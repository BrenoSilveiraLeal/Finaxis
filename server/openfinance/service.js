'use strict';
const { HttpError, randomId, isoDate, safeEqual } = require('../util');
const { createPluggy } = require('./pluggy');
const { bankKey, mapAccounts, mapTx } = require('./mapping');

const DAY = 86400000;

// Bancos e lançamentos usados pelo provedor de demonstração (sem credenciais Pluggy)
const DEMO_BANKS = {
  nubank: ['Nubank', '#820AD1'], itau: ['Itaú', '#EC7000'], bradesco: ['Bradesco', '#CC092F'], inter: ['Inter', '#FF7A00'],
  bb: ['Banco do Brasil', '#2a4a9f'], santander: ['Santander', '#EC0000'], c6: ['C6 Bank', '#242424'], caixa: ['Caixa', '#005CA9'],
  picpay: ['PicPay', '#11C76F'], mercadopago: ['Mercado Pago', '#009EE3'],
};
const DEMO_POOL = [
  ['iFood *Restaurante Tokai', [30, 70], 'credito'], ['Uber *Trip', [12, 45], 'credito'], ['Pão de Açúcar', [60, 260], 'debito'],
  ['Petz', [40, 140], 'credito'], ['Pix recebido — Lucas R.', [40, 250], 'pix', true], ['Drogasil', [20, 90], 'debito'],
  ['Amazon.com.br', [40, 230], 'credito'], ['99 Pop', [9, 30], 'credito'], ['Posto Ipiranga', [120, 220], 'debito'],
  ['Starbucks', [16, 34], 'credito'], ['Shopee', [30, 120], 'credito'], ['Cinemark', [30, 80], 'credito'],
  ['Hortifruti Natural', [25, 90], 'debito'], ['Rappi *Açaí da Vila', [22, 41], 'credito'], ['Padaria Real', [9, 30], 'pix'],
];
const rnd = (a, b) => Math.round((a + Math.random() * (b - a)) * 100) / 100;

function createOpenFinance({ db, store, events, log = console }) {
  const env = process.env;
  const pluggy = env.PLUGGY_CLIENT_ID && env.PLUGGY_CLIENT_SECRET
    ? createPluggy({ clientId: env.PLUGGY_CLIENT_ID, clientSecret: env.PLUGGY_CLIENT_SECRET, baseUrl: env.PLUGGY_BASE_URL || undefined })
    : null;
  const provider = pluggy ? 'pluggy' : 'demo';
  const publicUrl = (env.PUBLIC_URL || '').replace(/\/$/, '');
  const webhookUrl = pluggy && /^https:\/\//.test(publicUrl) && env.WEBHOOK_SECRET ? `${publicUrl}/api/webhooks/pluggy` : null;

  db.exec(`CREATE TABLE IF NOT EXISTS connection_accounts (
    external_account_id TEXT PRIMARY KEY,
    connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE CASCADE)`);

  const q = {
    byId: db.prepare('SELECT * FROM connections WHERE id = ?'),
    byExt: db.prepare('SELECT * FROM connections WHERE provider = ? AND external_id = ?'),
    byUser: db.prepare("SELECT * FROM connections WHERE user_id = ? AND status != 'revoked' ORDER BY created_at"),
    byAccount: db.prepare('SELECT c.* FROM connection_accounts ca JOIN connections c ON c.id = ca.connection_id WHERE ca.external_account_id = ?'),
    stale: db.prepare("SELECT * FROM connections WHERE provider = 'pluggy' AND status IN ('active','error','updating') AND (last_sync_at IS NULL OR last_sync_at < ?)"),
    ins: db.prepare('INSERT INTO connections (id, user_id, provider, external_id, bank_key, bank_name, bank_color, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'),
    setBank: db.prepare('UPDATE connections SET bank_key = ?, bank_name = ?, bank_color = ? WHERE id = ?'),
    setSync: db.prepare('UPDATE connections SET last_sync_at = ?, status = ?, last_error = ? WHERE id = ?'),
    setStatus: db.prepare('UPDATE connections SET status = ?, last_error = ? WHERE id = ?'),
    linkAcc: db.prepare('INSERT OR REPLACE INTO connection_accounts (external_account_id, connection_id) VALUES (?, ?)'),
    seenEvent: db.prepare('INSERT OR IGNORE INTO webhook_events (event_id, received_at) VALUES (?, ?)'),
    purgeEvents: db.prepare('DELETE FROM webhook_events WHERE received_at < ?'),
  };

  const publicConn = (c) => ({ id: c.id, provider: c.provider, bank: c.bank_key, bankName: c.bank_name, bankColor: c.bank_color, status: c.status, lastSyncAt: c.last_sync_at, lastError: c.last_error });

  /** Mescla contas/cartões vindos do banco no documento, preservando o nome que o usuário deu. */
  function mergeList(list, incoming, connId) {
    const old = new Map((list || []).map((x) => [x.id, x]));
    const others = (list || []).filter((x) => x.connectionId !== connId && !incoming.some((n) => n.id === x.id));
    return [...others, ...incoming.map((n) => (old.get(n.id) && old.get(n.id).customName ? { ...n, name: old.get(n.id).name, customName: true } : n))];
  }

  /** Grava dados bancários (transações + contas + cartões) de forma atômica e avisa as abas abertas. */
  function applyBank(conn, accs, cards, txs, status = 'active', error = null) {
    const uid = conn.user_id;
    const fresh = [];
    const version = db.atomic(() => {
      for (const t of txs) {
        if (!t.date || store.isTombstoned(uid, t.id)) continue;
        const old = store.getTx(uid, t.id);
        const merged = old ? { ...old, ...t, cat: old.cat || t.cat } : t; // categoria escolhida pelo usuário prevalece
        if (!old) fresh.push(merged);
        store.putTx(uid, merged);
      }
      const all = store.listTx(uid);
      for (const a of accs) {
        const s = all.filter((x) => x.accountId === a.id).reduce((p, x) => p + x.amount, 0);
        a.initial = Math.round((a.balance - s) * 100) / 100; // o app calcula saldo = inicial + transações
      }
      for (const a of [...accs, ...cards]) q.linkAcc.run(a.id.replace(/^of_/, ''), conn.id);
      const v = store.mutateDoc(uid, (doc) => {
        doc.accounts = mergeList(doc.accounts, accs, conn.id);
        doc.cards = mergeList(doc.cards, cards, conn.id);
      });
      q.setSync.run(Date.now(), status, error, conn.id);
      return v;
    });
    fresh.sort((a, b) => b.date.localeCompare(a.date));
    events.emit(uid, {
      type: 'bank-sync', version, connectionId: conn.id, bank: conn.bank_name, count: fresh.length,
      newTx: fresh.slice(0, 3).map((t) => ({ desc: t.desc, amount: t.amount, method: t.method })),
    });
    return { version, imported: fresh.length };
  }

  /* ------------------------------------------------------------ Pluggy */
  const inflight = new Map();
  function syncConnection(conn) {
    if (conn.provider !== 'pluggy') return Promise.resolve({ imported: 0 });
    if (inflight.has(conn.id)) return inflight.get(conn.id);
    const p = (async () => {
      try {
        const item = await pluggy.item(conn.external_id);
        if (item.connector) {
          const name = item.connector.name || conn.bank_name;
          q.setBank.run(bankKey(name), name, item.connector.primaryColor ? '#' + String(item.connector.primaryColor).replace('#', '') : conn.bank_color, conn.id);
          conn = q.byId.get(conn.id);
        }
        const accounts = await pluggy.accounts(conn.external_id);
        const from = isoDate(conn.last_sync_at ? conn.last_sync_at - 10 * DAY : Date.now() - 365 * DAY);
        const txs = [];
        for (const a of accounts) for (const t of await pluggy.transactions(a.id, from)) txs.push(mapTx(t, a, conn));
        const { accs, cards } = mapAccounts(conn, accounts);
        const bad = ['LOGIN_ERROR', 'OUTDATED'].includes(item.status);
        const status = item.status === 'UPDATING' ? 'updating' : bad ? 'error' : 'active';
        return applyBank(conn, accs, cards, txs, status, bad ? (item.error && item.error.message) || item.executionStatus || item.status : null);
      } catch (e) {
        log.error('[sync]', conn.id, e.message);
        q.setStatus.run(e.status === 404 ? 'revoked' : 'error', e.message.slice(0, 300), conn.id);
        throw e;
      } finally {
        inflight.delete(conn.id);
      }
    })();
    inflight.set(conn.id, p);
    return p;
  }

  async function connectToken(user) {
    if (!pluggy) throw new HttpError(400, 'Pluggy não configurado');
    return pluggy.connectToken(user.id, webhookUrl || undefined);
  }

  /** Registra o item retornado pelo widget. Só aceita itens criados com o clientUserId deste usuário. */
  async function registerItem(user, itemId) {
    if (!pluggy) throw new HttpError(400, 'Pluggy não configurado');
    if (typeof itemId !== 'string' || !/^[\w-]{8,80}$/.test(itemId)) throw new HttpError(400, 'itemId inválido');
    const item = await pluggy.item(itemId).catch((e) => { throw new HttpError(e.status === 404 ? 404 : 502, 'Não foi possível consultar a conexão no Pluggy'); });
    if (item.clientUserId !== user.id) throw new HttpError(403, 'Esta conexão não pertence à sua conta');
    let conn = q.byExt.get('pluggy', itemId);
    if (conn && conn.user_id !== user.id) throw new HttpError(403, 'Esta conexão não pertence à sua conta');
    if (!conn) {
      const name = (item.connector && item.connector.name) || 'Banco';
      const color = item.connector && item.connector.primaryColor ? '#' + String(item.connector.primaryColor).replace('#', '') : '#161616';
      q.ins.run('c_' + randomId(10), user.id, 'pluggy', itemId, bankKey(name), name, color, 'active', Date.now());
      conn = q.byExt.get('pluggy', itemId);
    } else q.setStatus.run('active', null, conn.id);
    // A coleta pode ainda estar em andamento: sincroniza agora e de novo em alguns instantes
    const first = await Promise.race([syncConnection(conn).catch(() => null), new Promise((r) => setTimeout(r, 20000))]);
    for (const ms of [15000, 60000, 180000]) setTimeout(() => syncConnection(q.byId.get(conn.id)).catch(() => {}), ms).unref();
    return { connection: publicConn(q.byId.get(conn.id)), imported: first ? first.imported : 0 };
  }

  /* -------------------------------------------------------------- Demo */
  function demoConnect(user, key) {
    const [name, color] = DEMO_BANKS[key] || DEMO_BANKS.nubank;
    const id = 'c_' + randomId(10);
    q.ins.run(id, user.id, 'demo', 'demo_' + randomId(10), key in DEMO_BANKS ? key : 'nubank', name, color, 'active', Date.now());
    const conn = q.byId.get(id);
    const accId = 'dm_' + randomId(8), cardId = 'dm_' + randomId(8);
    const accs = [{ id: accId, bank: conn.bank_key, bankName: name, bankColor: color, name: `Conta ${name}`, kind: 'corrente', balance: rnd(800, 3200), connected: true, provider: 'demo', connectionId: id, lastSync: Date.now() }];
    const limit = 2000 + Math.round(Math.random() * 6) * 500;
    const cards = [{ id: cardId, bank: conn.bank_key, bankName: name, bankColor: color, name: `${name} Crédito`, brand: Math.random() < 0.5 ? 'Visa' : 'Mastercard', last4: String(1000 + Math.floor(Math.random() * 8999)), limit, dueDay: 5 + Math.floor(Math.random() * 20), accountId: accId, connected: true, provider: 'demo', connectionId: id }];
    const today = new Date();
    const txs = [...DEMO_POOL].sort(() => Math.random() - 0.5).slice(0, 9 + Math.floor(Math.random() * 5)).map(([desc, [lo, hi], method, income]) => ({
      id: 'dm_' + randomId(10), date: isoDate(new Date(today.getFullYear(), today.getMonth(), 1 + Math.floor(Math.random() * today.getDate())).getTime() + 12 * 3600000),
      desc, amount: income ? rnd(lo, hi) : -rnd(lo, hi), cat: null, method, source: 'bank', connectionId: id,
      ...(method === 'credito' ? { cardId } : { accountId: accId }),
    }));
    return { connection: publicConn(conn), ...applyBank(conn, accs, cards, txs) };
  }

  /** Simula o banco enviando uma nova transação (Pix, compra no débito ou no crédito). */
  function demoTick(userId) {
    const conns = q.byUser.all(userId).filter((c) => c.provider === 'demo');
    if (!conns.length) return null;
    const conn = conns[Math.floor(Math.random() * conns.length)];
    const { doc } = store.readDoc(userId);
    const accs = ((doc && doc.accounts) || []).filter((a) => a.connectionId === conn.id).map((a) => ({ ...a }));
    const cards = ((doc && doc.cards) || []).filter((c) => c.connectionId === conn.id).map((c) => ({ ...c }));
    if (!accs.length) return null;
    const [desc, [lo, hi], method, income] = DEMO_POOL[Math.floor(Math.random() * DEMO_POOL.length)];
    const onCard = method === 'credito' && cards.length;
    const amount = income ? rnd(lo, hi) : -rnd(lo, hi);
    const t = { id: 'dm_' + randomId(10), date: isoDate(Date.now() - new Date().getTimezoneOffset() * 60000), desc, amount, cat: null, method: onCard ? 'credito' : method === 'credito' ? 'debito' : method, source: 'bank', connectionId: conn.id, ...(onCard ? { cardId: cards[0].id } : { accountId: accs[0].id }) };
    if (!onCard) accs[0].balance = Math.round(((accs[0].balance || 0) + amount) * 100) / 100;
    accs.forEach((a) => { a.lastSync = Date.now(); });
    return applyBank(conn, accs, cards, [t]);
  }

  /* --------------------------------------------------------- Comuns */
  async function disconnect(user, connId) {
    const conn = q.byId.get(connId);
    if (!conn || conn.user_id !== user.id) throw new HttpError(404, 'Conexão não encontrada');
    if (conn.provider === 'pluggy') await pluggy.deleteItem(conn.external_id).catch((e) => { if (e.status !== 404) throw new HttpError(502, 'Não foi possível revogar no Pluggy'); });
    q.setStatus.run('revoked', null, conn.id);
    const version = store.mutateDoc(user.id, (doc) => {
      const off = (x) => (x.connectionId === conn.id ? { ...x, connected: false, provider: 'manual', connectionId: undefined } : x);
      doc.accounts = (doc.accounts || []).map(off);
      doc.cards = (doc.cards || []).map(off);
    });
    events.emit(user.id, { type: 'bank-disconnect', version, connectionId: conn.id });
    return { ok: true, version };
  }

  async function syncUser(user, connId) {
    const list = q.byUser.all(user.id).filter((c) => (!connId || c.id === connId) && c.provider === 'pluggy');
    let imported = 0;
    for (const c of list) imported += (await syncConnection(c).catch(() => ({ imported: 0 }))).imported || 0;
    return { imported, connections: q.byUser.all(user.id).map(publicConn) };
  }

  /** Webhook do Pluggy: responde rápido, valida o segredo e processa em segundo plano. */
  function webhookAuthorized(req, body) {
    if (!env.WEBHOOK_SECRET || !safeEqual(req.headers['x-finaxis-secret'] || '', env.WEBHOOK_SECRET)) return false;
    if (body && body.clientId && env.PLUGGY_CLIENT_ID && body.clientId !== env.PLUGGY_CLIENT_ID) return false;
    return true;
  }

  async function handleWebhook(body) {
    if (!pluggy || !body || typeof body.event !== 'string') return;
    if (body.eventId && q.seenEvent.run(String(body.eventId), Date.now()).changes === 0) return; // repetido
    const conn = body.itemId ? q.byExt.get('pluggy', String(body.itemId)) : body.accountId ? q.byAccount.get(String(body.accountId)) : null;
    if (!conn) return;
    const ev = body.event;
    if (ev === 'item/deleted') { q.setStatus.run('revoked', null, conn.id); return; }
    if (ev === 'item/error') { q.setStatus.run('error', (body.error && body.error.message) || 'Erro na conexão', conn.id); events.emit(conn.user_id, { type: 'bank-error', connectionId: conn.id }); return; }
    if (ev === 'transactions/deleted' && Array.isArray(body.transactionIds)) {
      const version = db.atomic(() => { body.transactionIds.forEach((id) => store.delTx(conn.user_id, 'of_' + id)); return store.readDoc(conn.user_id).version; });
      events.emit(conn.user_id, { type: 'bank-sync', version, connectionId: conn.id, count: 0 });
      return;
    }
    if (/^(item\/(created|updated|login_succeeded)|transactions\/(created|updated))$/.test(ev)) await syncConnection(conn).catch(() => {});
  }

  /* --------------------------------------------------- Rotinas de fundo */
  function start() {
    if (pluggy && webhookUrl) {
      pluggy.ensureWebhook(webhookUrl, env.WEBHOOK_SECRET).then(() => log.info('[pluggy] webhook ativo em', webhookUrl)).catch((e) => log.error('[pluggy] webhook:', e.message));
    }
    // Varredura periódica (cobre quem não tem webhook público, ex.: rodando local)
    const every = Math.max(5, Number(env.SYNC_INTERVAL_MINUTES) || 60) * 60000;
    setInterval(async () => {
      if (!pluggy) return;
      for (const c of q.stale.all(Date.now() - every)) await syncConnection(c).catch(() => {});
      q.purgeEvents.run(Date.now() - 7 * DAY);
    }, 5 * 60000).unref();
    // Ao abrir o app, sincroniza conexões paradas há mais de 10 min
    events.onSubscribe((uid) => {
      if (!pluggy) return;
      for (const c of q.byUser.all(uid)) if (c.provider === 'pluggy' && (!c.last_sync_at || Date.now() - c.last_sync_at > 10 * 60000)) syncConnection(c).catch(() => {});
    });
    // Demo "ao vivo": o banco fictício manda uma transação de tempos em tempos para quem está com o app aberto
    const demoEvery = Math.max(15, Number(env.DEMO_LIVE_SECONDS) || 60) * 1000;
    setInterval(() => {
      for (const uid of events.onlineUsers()) {
        const { doc } = store.readDoc(uid);
        if (doc && doc.settings && doc.settings.live === false) continue;
        try { demoTick(uid); } catch (e) { log.error('[demo]', e.message); }
      }
    }, demoEvery).unref();
  }

  return {
    provider,
    config: () => ({ provider, sandbox: env.PLUGGY_SANDBOX !== 'false', connectScript: env.PLUGGY_CONNECT_SCRIPT || 'https://cdn.pluggy.ai/pluggy-connect/v2.7.0/pluggy-connect.js', webhooks: !!webhookUrl }),
    list: (user) => q.byUser.all(user.id).map(publicConn),
    connectToken, registerItem, demoConnect, demoTick, disconnect, syncUser, webhookAuthorized, handleWebhook, start,
  };
}

module.exports = { createOpenFinance };
