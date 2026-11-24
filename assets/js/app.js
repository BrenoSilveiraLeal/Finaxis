/* ==========================================================================
   FINAXIS — app de controle financeiro (vanilla JS, dados salvos na conta do usuário)
   ========================================================================== */
(() => {
  'use strict';

  /* ---------------------------------------------------------------- utils */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const ymOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  const parseD = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d || 1); };
  const daysIn = (y, m) => new Date(y, m + 1, 0).getDate();
  const shiftYm = (ym, n) => { const d = parseD(ym + '-01'); d.setMonth(d.getMonth() + n); return ymOf(d); };
  const uid = () => Math.random().toString(36).slice(2, 10);
  const sum = (arr, f = (x) => x) => arr.reduce((s, x) => s + f(x), 0);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const MS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const DOW = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const ymLabel = (ym) => { const d = parseD(ym + '-01'); return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };
  const ymShort = (ym) => MS[parseD(ym + '-01').getMonth()];
  const monthYear = (d) => `${MONTHS[d.getMonth()].toLowerCase()} de ${d.getFullYear()}`;
  const now = () => new Date();
  const todayStr = () => ymd(now());

  const brlRaw = (v, dec = 2) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: dec, maximumFractionDigits: dec });
  const brl = (v, dec) => (S && S.settings.hide ? 'R$ •••' : brlRaw(v, dec));
  const brl0 = (v) => brl(v, 0);
  const moneyIn = (v, currency) => {
    if (!currency || currency === 'BRL') return brl(v);
    if (S && S.settings.hide) return '•••';
    try { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(v || 0); }
    catch { return `${currency} ${Number(v || 0).toLocaleString('pt-BR')}`; }
  };
  const signed = (v) => (S.settings.hide ? 'R$ •••' : (v < 0 ? '− ' : '+ ') + brlRaw(Math.abs(v)));
  const kfmt = (v) => (v >= 1000 ? (v / 1000).toFixed(1).replace('.', ',').replace(',0', '') + 'k' : String(Math.round(v)));
  const pct = (v) => `${Math.round(v * 100)}%`;
  const ARROW = '<img class="arrow" src="assets/img/arrow.svg" alt="">';
  const MASCOT = 'assets/img/logo.svg';


  /* --------------------------------------------------------- catálogos */
  const CATS = {
    // paleta contida: cores da marca + neutros quentes
    alimentacao: { name: 'Alimentação', emoji: '🍔', color: '#D4553A', group: 'want' },
    mercado: { name: 'Mercado', emoji: '🛒', color: '#6FA898', group: 'need' },
    transporte: { name: 'Transporte', emoji: '🚗', color: '#0B3D33', group: 'need' },
    moradia: { name: 'Moradia', emoji: '🏠', color: '#3E5C76', group: 'need' },
    contas: { name: 'Contas & serviços', emoji: '💡', color: '#8FA39C', group: 'need' },
    saude: { name: 'Saúde', emoji: '💊', color: '#C98A5E', group: 'need' },
    educacao: { name: 'Educação', emoji: '📚', color: '#B7A46A', group: 'need' },
    compras: { name: 'Compras', emoji: '🛍️', color: '#E3A08C', group: 'want' },
    lazer: { name: 'Lazer', emoji: '🎉', color: '#6C7A89', group: 'want' },
    assinaturas: { name: 'Assinaturas', emoji: '📺', color: '#9C3B2A', group: 'want' },
    viagem: { name: 'Viagem', emoji: '✈️', color: '#9DB7C9', group: 'want' },
    pets: { name: 'Pets', emoji: '🐶', color: '#A58A6E', group: 'want' },
    outros: { name: 'Outros', emoji: '📦', color: '#C3CCC9', group: 'want' },
    salario: { name: 'Salário', emoji: '💰', color: '#3DBA85', income: true },
    freela: { name: 'Freelas & extras', emoji: '💼', color: '#3DBA85', income: true },
    rendimentos: { name: 'Rendimentos', emoji: '📈', color: '#3DBA85', income: true },
    pixrecebido: { name: 'Pix recebido', emoji: '⚡', color: '#3DBA85', income: true },
    caixinha: { name: 'Caixinhas', emoji: '🐷', color: '#3DBA85', system: true },
    fatura: { name: 'Pagamento de fatura', emoji: '💳', color: '#3E5C76', system: true },
  };
  // Variações de design (?v=black,icons,dark)
  const VARIANT = (new URLSearchParams(location.search).get('v') || '').split(',').join(' ');
  if (VARIANT) document.documentElement.dataset.v = VARIANT;
  const CAT_SVG = {
    alimentacao: '<path d="M7 3v18M4.5 3v5a2.5 2.5 0 0 0 5 0V3M17 3c-2.5 2.5-2.5 7 0 9v9"/>',
    mercado: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.5 12h11L21 7H6"/>',
    transporte: '<path d="M5 15l1.5-6h11L19 15M3 15h18v4H3zM7 19v2M17 19v2"/>',
    moradia: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
    contas: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9V16h7v-2.1A6 6 0 0 0 12 3z"/>',
    saude: '<path d="M20.8 5.6a5 5 0 0 0-7.6.6L12 7.5l-1.2-1.3a5 5 0 0 0-7.6 6.4L12 21l8.8-8.4a5 5 0 0 0 0-7z"/>',
    educacao: '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11.5V16c3 2.2 9 2.2 12 0v-4.5"/>',
    compras: '<path d="M5 8h14l-1 13H6zM9 8V6a3 3 0 0 1 6 0v2"/>',
    lazer: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
    assinaturas: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M10 8l5 2.5-5 2.5zM8 21h8"/>',
    viagem: '<path d="M10.5 13.5L3 11l2-2 7 1 4.5-4.5a2 2 0 0 1 3 3L15 13l1 7-2 2-2.5-7.5L8 18v3l-1.5 1-1-4-4-1L3 15.5h3z"/>',
    pets: '<circle cx="6.5" cy="10" r="1.8"/><circle cx="10" cy="5.5" r="1.8"/><circle cx="14" cy="5.5" r="1.8"/><circle cx="17.5" cy="10" r="1.8"/><path d="M8 17c0-3 2-5 4-5s4 2 4 5-2 3-4 3-4 0-4-3z"/>',
    outros: '<path d="M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10"/>',
    salario: '<path d="M12 3v12M7 10l5 5 5-5M4 20h16"/>', freela: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M3 13h18"/>',
    rendimentos: '<path d="M3 17l6-6 4 4 8-8M15 7h6v6"/>', pixrecebido: '<path d="M12 3v12M7 10l5 5 5-5M4 20h16"/>',
    caixinha: '<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/>',
    fatura: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>',
  };
  Object.assign(CAT_SVG, {
    pix: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>', credito: CAT_SVG.fatura, debito: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M15 15h3"/>',
    dinheiro: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>',
    boleto: '<path d="M4 5v14M7 5v14M10 5v14M14 5v14M16 5v14M20 5v14"/>', ted: '<path d="M4 8h14l-3-3M20 16H6l3 3"/>',
    alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v4M12 17.5h.01"/>', trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4"/>',
    buoy: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M5.6 5.6l3.6 3.6M14.8 14.8l3.6 3.6M18.4 5.6l-3.6 3.6M9.2 14.8l-3.6 3.6"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>', cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    stop: '<path d="M8 3h8l5 5v8l-5 5H8l-5-5V8z"/><path d="M8 12h8"/>',
  });
  const svgI = (k, cls = 'cat-svg') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${CAT_SVG[k] || CAT_SVG.outros}</svg>`;
  const EMOJI_MODE = /\bemoji\b/.test(VARIANT); // ?v=emoji volta ao visual antigo
  const catIco = (k) => (EMOJI_MODE ? (CATS[k] || CATS.outros).emoji : svgI(CATS[k] ? k : 'outros'));
  const methodIco = (k) => (EMOJI_MODE ? (METHODS[k] || {}).ico || '' : svgI(k, 'cat-svg sm'));
  const UI_ICO = { '🥡': 'alimentacao', '🚕': 'transporte', '📺': 'assinaturas', '⚠️': 'alert', '🏆': 'trophy', '🛟': 'buoy', '🎯': 'target', '💳': 'fatura', '🏠': 'moradia', '📆': 'cal', '🐷': 'caixinha', '🛑': 'stop' };
  const uiIco = (e) => (String(e).startsWith('cat:') ? catIco(e.slice(4)) : EMOJI_MODE || !UI_ICO[e] ? e : svgI(UI_ICO[e]));
  const EXP_CATS = Object.keys(CATS).filter((k) => !CATS[k].income && !CATS[k].system);
  const INC_CATS = Object.keys(CATS).filter((k) => CATS[k].income);
  const cat = (k) => CATS[k] || CATS.outros;

  const RULES = [
    [/uber|99 ?pop|99app|cabify|indriver|metr[oô]|bilhete [uú]nico/i, 'transporte'],
    [/posto|shell|ipiranga|petrobras|estacionamento|sem parar/i, 'transporte'],
    [/ifood|rappi|z[eé] delivery|restaurante|lanchonete|burger|mcdonald|padaria|starbucks|outback|pizza|a[cç]a[ií]|sushi/i, 'alimentacao'],
    [/netflix|spotify|prime video|disney|hbo max|youtube premium|icloud|deezer|globoplay|chatgpt|google one/i, 'assinaturas'],
    [/amazon|mercado livre|shopee|shein|magalu|renner|zara|americanas|centauro|kabum/i, 'compras'],
    [/mercado|carrefour|p[aã]o de a[cç][uú]car|atacad|assa[ií]|hortifruti|sacol[aã]o|supermerc/i, 'mercado'],
    [/aluguel|condom[ií]nio|iptu|quinto ?andar/i, 'moradia'],
    [/vivo|claro|tim\b|enel|sabesp|light\b|comg[aá]s|internet|energia|[aá]gua|celular|telefone/i, 'contas'],
    [/drogasil|droga ?raia|farm[aá]cia|unimed|consulta|exame|academia|smart ?fit|dentista/i, 'saude'],
    [/cinema|cinemark|ingresso|show|\bbar\b|steam|playstation|xbox|teatro/i, 'lazer'],
    [/curso|udemy|alura|livraria|faculdade|escola/i, 'educacao'],
    [/latam|azul linhas|airbnb|booking|hotel|decolar|passagem/i, 'viagem'],
    [/petz|cobasi|veterin/i, 'pets'],
    [/sal[aá]rio|folha de pagamento|holerite/i, 'salario'],
    [/rendimento|juros recebidos|dividendo/i, 'rendimentos'],
    [/freela|nota fiscal|servi[cç]o prestado/i, 'freela'],
  ];
  const normDesc = (d) => String(d).toLowerCase().replace(/\s*\(\d+\/\d+\)\s*$/, '').replace(/\s*\*.*$/, '').replace(/[^a-z0-9à-ú ]/gi, '').trim();
  // Categoria enviada pelo banco/agregador (ex.: Pluggy "Groceries", "Video streaming") como 3ª pista
  const BANK_CAT_RULES = [
    [/salar|payroll|pro-labore/i, 'salario'], [/invest|rendiment|interest|yield/i, 'rendimentos'],
    [/grocer|supermarket|supermerc/i, 'mercado'], [/food|restaurant|aliment|delivery|eating/i, 'alimentacao'],
    [/taxi|ride|transport|fuel|gas station|combust|parking|toll|ped[aá]gio/i, 'transporte'], [/rent|housing|moradia|aluguel|mortgage/i, 'moradia'],
    [/utilit|telecom|internet|electric|water|phone|mobile|energia/i, 'contas'], [/health|pharm|sa[uú]de|farm|gym|fitness|wellness/i, 'saude'],
    [/education|educa|course|school|book/i, 'educacao'], [/streaming|digital service|subscription|assinatura/i, 'assinaturas'],
    [/shopping|compras|clothing|electronic|marketplace/i, 'compras'], [/travel|viage|airline|hotel|lodging|accommodation/i, 'viagem'],
    [/leisure|entertain|lazer|gaming|bars?\b|cinema|tickets/i, 'lazer'], [/\bpet/i, 'pets'],
  ];
  function autoCat(desc, amount, bankCategory) {
    const key = normDesc(desc);
    if (S && S.learned && S.learned[key]) return S.learned[key];
    for (const [re, c] of RULES) if (re.test(desc)) return c;
    if (bankCategory) for (const [re, c] of BANK_CAT_RULES) if (re.test(bankCategory) && !!CATS[c].income === amount > 0) return c;
    return amount > 0 ? 'pixrecebido' : 'outros';
  }

  const BANKS = {
    nubank: { name: 'Nubank', color: '#820AD1', short: 'nu' },
    itau: { name: 'Itaú', color: '#EC7000', short: 'it' },
    bradesco: { name: 'Bradesco', color: '#CC092F', short: 'b' },
    inter: { name: 'Inter', color: '#FF7A00', short: 'in' },
    bb: { name: 'Banco do Brasil', color: '#2a4a9f', short: 'bb' },
    santander: { name: 'Santander', color: '#EC0000', short: 's' },
    c6: { name: 'C6 Bank', color: '#242424', short: 'c6' },
    caixa: { name: 'Caixa', color: '#005CA9', short: 'cx' },
    picpay: { name: 'PicPay', color: '#11C76F', short: 'pp' },
    mercadopago: { name: 'Mercado Pago', color: '#009EE3', short: 'mp' },
    cash: { name: 'Dinheiro', color: '#2E7D32', short: 'R$' },
  };
  const METHODS = {
    pix: { name: 'Pix', ico: '⚡' }, credito: { name: 'Crédito', ico: '💳' }, debito: { name: 'Débito', ico: '🏧' },
    dinheiro: { name: 'Dinheiro', ico: '💵' }, boleto: { name: 'Boleto', ico: '🧾' }, ted: { name: 'Transferência', ico: '🔁' },
  };

  // Banco de uma conta/cartão: catálogo conhecido ou dados vindos do agregador (nome/cor)
  const bankOf = (o) => (o && BANKS[o.bank] && o.bank !== 'other' ? BANKS[o.bank]
    : o && o.bankName ? { name: o.bankName, color: o.bankColor || '#0B3D33', short: o.bankName.replace(/[^A-Za-zÀ-ú0-9]/g, '').slice(0, 2).toLowerCase() }
    : BANKS.cash);
  const isBankId = (id) => /^(of|dm)_/.test(String(id));

  /* ---------------------------------------------------------------- state */
  const KEY = 'finaxis.v1';
  let S = null;
  const UI = { route: 'painel', ym: ymOf(now()), f: { q: '', type: 'all', cat: '', method: '', src: '' }, fresh: new Set(), simGoal: null };
  const load = () => { try { const r = localStorage.getItem(KEY); return r ? JSON.parse(r) : null; } catch (e) { return null; } };

  /* ------------------------------------------------- sincronização (API) */
  // online = logado no servidor; senão o app roda só no navegador (localStorage)
  const API = { available: false, online: false, user: null, cfg: null, clientId: uid() + uid(), version: 0, synced: new Map(), syncedDoc: null, saving: null, dirty: false, timer: null, isNew: false };

  async function api(method, path, body) {
    const r = await fetch(path, {
      method, credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'X-Finaxis': '1', 'X-Client-Id': API.clientId },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok && r.status !== 409) {
      const e = new Error(data.error || `Erro ${r.status}`); e.status = r.status;
      if (r.status === 401 && API.online) { API.online = false; showAuth('Sua sessão expirou. Entre de novo.'); }
      throw e;
    }
    return { status: r.status, data };
  }

  const docOf = (s) => { const { tx, ...doc } = s; return doc; };

  function save() {
    if (!API.online) { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* storage indisponível */ } return; }
    API.dirty = true;
    clearTimeout(API.timer);
    API.timer = setTimeout(pushState, 350);
  }

  /** Envia só o que mudou: transações alteradas/excluídas (diff por id) e o documento, se mudou. */
  async function pushState() {
    if (!API.online) return;
    if (API.saving) { API.dirty = true; return API.saving; }
    API.dirty = false;
    const sent = [], seen = new Set();
    for (const t of S.tx) { seen.add(t.id); const j = JSON.stringify(t); if (API.synced.get(t.id) !== j) sent.push([t.id, j, t]); }
    const deletes = [...API.synced.keys()].filter((id) => !seen.has(id));
    const docJson = JSON.stringify(docOf(S));
    const body = { baseVersion: API.version, upserts: sent.map((x) => x[2]), deletes };
    if (docJson !== API.syncedDoc) body.doc = JSON.parse(docJson);
    if (!sent.length && !deletes.length && !body.doc) return;
    setSyncStatus('saving');
    API.saving = (async () => {
      try {
        let { status, data } = await api('PUT', '/api/state', body);
        let finalDoc = docJson;
        if (status === 409) { // outro dispositivo ou o sync bancário mudou o documento: mescla e reenvia
          mergeServerDoc(data.doc);
          finalDoc = JSON.stringify(docOf(S));
          ({ data } = await api('PUT', '/api/state', { baseVersion: data.version, doc: JSON.parse(finalDoc) }));
        }
        sent.forEach(([id, j]) => API.synced.set(id, j));
        deletes.forEach((id) => API.synced.delete(id));
        API.version = data.version;
        if (body.doc || status === 409) API.syncedDoc = finalDoc;
        setSyncStatus('ok');
      } catch (e) {
        API.dirty = true;
        setSyncStatus('error');
        if (e.status !== 401) setTimeout(() => API.dirty && pushState(), 5000);
      } finally {
        API.saving = null;
        if (API.dirty) { clearTimeout(API.timer); API.timer = setTimeout(pushState, 350); }
      }
    })();
    return API.saving;
  }

  async function flush() {
    clearTimeout(API.timer);
    for (let i = 0; i < 5 && (API.saving || API.dirty); i++) { if (API.saving) await API.saving; else await pushState(); }
  }

  /** Contas/cartões vindos do banco (ids of_/dm_) pertencem ao servidor; o resto é do usuário. */
  function mergeServerDoc(sd) {
    if (!sd) return;
    for (const k of ['accounts', 'cards', 'investments']) {
      const mine = (S[k] || []).filter((x) => !isBankId(x.id));
      const local = new Map((S[k] || []).map((x) => [x.id, x]));
      const bank = (sd[k] || []).filter((x) => isBankId(x.id)).map((x) => (local.get(x.id) && local.get(x.id).customName ? { ...x, name: local.get(x.id).name, customName: true } : x));
      S[k] = [...mine, ...bank];
    }
  }

  function normalizeState(doc, tx) {
    const base = emptyState(false);
    const d = doc || {};
    const s = { ...base, ...d, tx };
    for (const k of ['profile', 'settings', 'learn']) s[k] = { ...base[k], ...(d[k] || {}) };
    for (const k of ['accounts', 'cards', 'goals', 'recurring', 'investments']) if (!Array.isArray(s[k])) s[k] = k === 'accounts' ? base.accounts : [];
    for (const k of ['budgets', 'learned', 'posted', 'paid']) if (!s[k] || typeof s[k] !== 'object') s[k] = {};
    return s;
  }

  const categorizeMissing = () => { let n = 0; for (const t of S.tx) if (!t.cat) { t.cat = autoCat(t.desc, t.amount, t.bankCategory); n++; } return n; };

  async function loadRemote() {
    const { data } = await api('GET', '/api/state');
    API.version = data.version;
    API.synced = new Map(data.tx.map((t) => [t.id, JSON.stringify(t)]));
    S = normalizeState(data.doc, data.tx);
    S.v = 1;
    API.syncedDoc = data.doc ? JSON.stringify(docOf(S)) : null;
    if (!data.doc || !data.doc.profile) { API.isNew = true; S.profile.name = (API.user.name || 'Você').split(' ')[0]; }
    if (/[?&]debug\b/.test(location.search)) window.__finaxis = { get S() { return S; }, API, refreshFromServer };
    categorizeMissing();
  }

  /** Recarrega do servidor (após evento SSE). Antes envia o que estiver pendente aqui. */
  let refreshing = null;
  function refreshFromServer() {
    if (refreshing) return refreshing;
    refreshing = (async () => {
      try {
        await flush();
        const before = new Set(S.tx.map((t) => t.id));
        const { data } = await api('GET', '/api/state');
        API.version = data.version;
        API.synced = new Map(data.tx.map((t) => [t.id, JSON.stringify(t)]));
        S = normalizeState(data.doc, data.tx);
        S.v = 1;
        API.syncedDoc = data.doc ? JSON.stringify(docOf(S)) : null;
        data.tx.forEach((t) => { if (!before.has(t.id)) UI.fresh.add(t.id); });
        if (categorizeMissing() || postRecurring(S)) save();
        return data.tx.filter((t) => !before.has(t.id));
      } finally { refreshing = null; }
    })();
    return refreshing;
  }

  function setSyncStatus(st) {
    const sd = $('#syncDot'); if (!sd) return;
    sd.classList.toggle('off', st === 'error' || (!S.settings.live && st !== 'saving'));
    sd.lastElementChild.textContent = st === 'saving' ? 'Salvando…' : st === 'error' ? 'Sem conexão' : S.settings.live ? 'Ao vivo' : 'Sincronizado';
  }

  function connectEvents() {
    if (!window.EventSource) return;
    const es = new EventSource('/api/events?client=' + encodeURIComponent(API.clientId));
    es.addEventListener('change', async (e) => {
      let d = {}; try { d = JSON.parse(e.data); } catch (_) { /* ignore */ }
      const fresh = await refreshFromServer().catch(() => []);
      if (d.type === 'bank-sync' && fresh.length) {
        fresh.slice(0, 2).forEach((t) => {
          const bank = srcBank(t);
          toast(`<b>${t.amount > 0 ? 'Entrada' : t.method === 'credito' ? 'Compra no crédito' : 'Novo gasto'}</b> · ${esc(bank.name)}<br>${esc(t.desc)} ${signed(t.amount)} → ${cat(t.cat).name}`, t.amount > 0 ? '💸' : '💳', 5500);
          if (t.amount < 0) budgetCheck(t.cat);
        });
        if (fresh.length > 2) toast(`+${fresh.length - 2} transações sincronizadas`, '🔄');
      }
      if (d.type === 'bank-error') toast('Um banco conectado pediu nova autorização. Veja em Contas & cartões.', '⚠️', 7000);
      const busy = document.activeElement && document.activeElement.closest && document.activeElement.closest('#view input, #view select');
      if (!busy && !$('#modalRoot').children.length) render();
    });
    es.onerror = () => setSyncStatus('error');
    es.onopen = () => setSyncStatus('ok');
  }

  function emptyState(demo) {
    return {
      v: 1, demo: !!demo,
      profile: { name: 'Você', salary: 0, payday: 5 },
      accounts: [{ id: 'a3', bank: 'cash', name: 'Carteira', kind: 'dinheiro', initial: 0, connected: false }],
      cards: [], investments: [], tx: [], recurring: [], goals: [], budgets: {}, learned: {}, posted: {}, paid: {},
      learn: { done: [], xp: 0, challenges: {} },
      settings: { live: true, hide: false, reminders: true },
      recStart: ymOf(now()),
    };
  }

  /* ----------------------------------------------------- domínio/cálculo */
  function postRecurring(s) {
    let changed = false;
    const T = now();
    let [y, m] = s.recStart.split('-').map(Number); m--;
    while (new Date(y, m, 1) <= T) {
      const ym = `${y}-${pad(m + 1)}`, dim = daysIn(y, m);
      for (const r of s.recurring) {
        if (r.active === false || (r.start && ym < r.start)) continue;
        const date = new Date(y, m, Math.min(r.day, dim));
        const key = r.id + ':' + ym;
        if (date > T || s.posted[key]) continue;
        s.posted[key] = 1;
        s.tx.push({ id: 'r_' + r.id + '_' + ym, date: ymd(date), desc: r.desc, amount: r.amount, cat: r.cat, method: r.method, accountId: r.cardId ? undefined : r.accountId, cardId: r.cardId, recurringId: r.id, source: 'auto' });
        changed = true;
      }
      for (const g of s.goals) {
        if (!g.autoDay || !g.monthly || (g.start && ym < g.start)) continue;
        const date = new Date(y, m, Math.min(g.autoDay, dim));
        const key = 'g:' + g.id + ':' + ym;
        if (date > T || s.posted[key]) continue;
        s.posted[key] = 1;
        if (g.saved >= g.target) continue;
        s.tx.push({ id: 'g_' + g.id + '_' + ym, date: ymd(date), desc: `Caixinha · ${g.name}`, amount: -g.monthly, cat: 'caixinha', method: 'ted', accountId: g.accountId || 'a1', goalId: g.id, source: 'auto' });
        g.saved += g.monthly;
        changed = true;
      }
      m++; if (m > 11) { m = 0; y++; }
    }
    return changed;
  }

  const accBalance = (a) => a.initial + sum(S.tx.filter((t) => t.accountId === a.id), (t) => t.amount);
  const invoiceTotal = (c, ym, s = S) => -sum(s.tx.filter((t) => t.cardId === c.id && t.date.startsWith(ym)), (t) => t.amount);
  function invoiceDue(c, ym) { const d = parseD(ym + '-01'); return new Date(d.getFullYear(), d.getMonth() + 1, c.dueDay); }
  function openInvoices(c) {
    if (c.provider === 'pluggy') return c.statementBalance > 0 && c.dueDate ? [{ ym: c.dueDate.slice(0, 7), total: c.statementBalance, due: parseD(c.dueDate) }] : [];
    const months = [...new Set(S.tx.filter((t) => t.cardId === c.id).map((t) => t.date.slice(0, 7)))].sort();
    return months.filter((ym) => !S.paid[c.id + ':' + ym]).map((ym) => ({ ym, total: invoiceTotal(c, ym), due: invoiceDue(c, ym) })).filter((i) => i.total > 0.009);
  }
  // Cartão conectado via Pluggy: limite e fatura vêm do banco
  const limitUsed = (c) => (c.provider === 'pluggy' && c.available != null ? Math.max(0, c.limit - c.available) : sum(openInvoices(c), (i) => i.total));
  const srcName = (t) => { if (t.cardId) { const c = S.cards.find((x) => x.id === t.cardId); return c ? c.name : 'Cartão'; } const a = S.accounts.find((x) => x.id === t.accountId); return a ? a.name : '—'; };
  const srcBank = (t) => { const o = t.cardId ? S.cards.find((x) => x.id === t.cardId) : S.accounts.find((x) => x.id === t.accountId); return bankOf(o); };

  function monthStats(ym) {
    const txs = S.tx.filter((t) => t.date.startsWith(ym));
    let income = 0, expense = 0, saved = 0;
    const byCat = {}, byMethod = {};
    for (const t of txs) {
      if (t.cat === 'fatura') continue;
      if (t.cat === 'caixinha') { saved -= t.amount; continue; }
      if (t.amount > 0) income += t.amount;
      else { expense -= t.amount; byCat[t.cat] = (byCat[t.cat] || 0) - t.amount; byMethod[t.method] = (byMethod[t.method] || 0) - t.amount; }
    }
    return { income, expense, saved, byCat, byMethod, txs };
  }
  const isCurrent = (ym) => ym === ymOf(now());
  const dayProgress = (ym) => { if (!isCurrent(ym)) return 1; const d = now(); return d.getDate() / daysIn(d.getFullYear(), d.getMonth()); };
  // Projeção do mês por categoria: gasto variável extrapolado pelo ritmo + contas fixas no valor cheio
  function projCat(ym) {
    const st = monthStats(ym);
    if (!isCurrent(ym)) return { byCat: st.byCat, total: st.expense };
    const prog = dayProgress(ym), out = {}, fix = {}, vari = {}, hist = {};
    const isVar = (t) => t.amount < 0 && !cat(t.cat).system && !t.recurringId;
    for (let k = 1; k <= 3; k++) monthStats(shiftYm(ym, -k)).txs.forEach((t) => { if (isVar(t)) hist[t.cat] = (hist[t.cat] || 0) - t.amount / 3; });
    for (const t of st.txs) {
      if (t.amount >= 0 || cat(t.cat).system) continue;
      const bag = t.recurringId ? fix : vari;
      bag[t.cat] = (bag[t.cat] || 0) - t.amount;
    }
    // já gasto + restante do mês no ritmo histórico (ou no ritmo atual, se não houver histórico)
    for (const c of new Set([...Object.keys(fix), ...Object.keys(vari), ...Object.keys(hist)])) {
      const v = vari[c] || 0;
      const rest = (1 - prog) * (hist[c] != null ? hist[c] : v / prog);
      out[c] = (fix[c] || 0) + v + rest;
    }
    for (const r of S.recurring) {
      if (r.active === false || r.amount >= 0 || (r.start && ym < r.start) || S.posted[r.id + ':' + ym]) continue;
      out[r.cat] = (out[r.cat] || 0) - r.amount;
    }
    return { byCat: out, total: sum(Object.values(out)) };
  }

  function simulate(target, saved, monthly, rate) {
    const i = Math.pow(1 + (rate || 0) / 100, 1 / 12) - 1;
    let bal = saved, n = 0;
    const pts = [bal];
    if (bal >= target) return { months: 0, pts, final: bal, interest: 0 };
    if (monthly <= 0 && i <= 0) return { months: Infinity, pts, final: bal, interest: 0 };
    while (bal < target && n < 600) { bal = bal * (1 + i) + monthly; n++; pts.push(bal); }
    return { months: n >= 600 ? Infinity : n, pts, final: bal, interest: Math.max(0, bal - saved - monthly * n) };
  }
  const addMonths = (n) => { const d = now(); d.setDate(1); d.setMonth(d.getMonth() + n); return d; };
  const monthsTxt = (n) => (n === Infinity ? 'nunca, nesse ritmo' : n === 0 ? 'já chegou!' : n < 12 ? `${n} ${n === 1 ? 'mês' : 'meses'}` : `${Math.floor(n / 12)} ${Math.floor(n / 12) === 1 ? 'ano' : 'anos'}${n % 12 ? ` e ${n % 12} ${n % 12 === 1 ? 'mês' : 'meses'}` : ''}`);

  function avgExpenses(months = 3, filterFn) {
    let tot = 0;
    for (let k = 1; k <= months; k++) {
      const st = monthStats(shiftYm(ymOf(now()), -k));
      tot += filterFn ? sum(Object.entries(st.byCat).filter(([c]) => filterFn(c)), (e) => e[1]) : st.expense;
    }
    return tot / months;
  }
  const fixedMonthly = () => ({
    out: -sum(S.recurring.filter((r) => r.active !== false && r.amount < 0), (r) => r.amount),
    in: sum(S.recurring.filter((r) => r.active !== false && r.amount > 0), (r) => r.amount),
  });
  const incomeBase = (ym) => Math.max(S.profile.salary || 0, monthStats(ym).income);

  function calcScore() {
    const ym = shiftYm(ymOf(now()), -1); // último mês fechado
    const st = monthStats(ym);
    const inc = Math.max(st.income, S.profile.salary || 0);
    const rate = inc ? (inc - st.expense) / inc : 0;
    const p1 = clamp(rate / 0.2, 0, 1) * 300;
    const bk = Object.keys(S.budgets);
    const cur = monthStats(ymOf(now()));
    const okB = bk.filter((c) => (cur.byCat[c] || 0) <= S.budgets[c] * Math.max(dayProgress(ymOf(now())), 0.35) * 1.15).length;
    const p2 = bk.length ? (okB / bk.length) * 250 : 125;
    const essential = avgExpenses(3, (c) => cat(c).group === 'need') || 1;
    const reserve = S.goals.find((g) => g.kind === 'reserva');
    const monthsCovered = reserve ? reserve.saved / essential : 0;
    const p3 = clamp(monthsCovered / 6, 0, 1) * 250;
    const fx = fixedMonthly().out;
    const fr = inc ? fx / inc : 1;
    const p4 = fr <= 0.5 ? 200 : clamp((0.8 - fr) / 0.3, 0, 1) * 200;
    const score = Math.round(p1 + p2 + p3 + p4);
    const label = score < 400 ? 'Atenção' : score < 650 ? 'Em evolução' : score < 850 ? 'Saudável' : 'Excelente';
    return { score, label, rate, monthsCovered, fr, parts: [p1, p2, p3, p4] };
  }

  function genTips(ym) {
    const tips = [];
    const st = monthStats(ym), prevYm = shiftYm(ym, -1), pv = monthStats(prevYm);
    const prog = dayProgress(ym);
    const pj = projCat(ym);
    // categorias que cresceram (projeta mês atual)
    for (const [c, proj] of Object.entries(pj.byCat)) {
      const before = pv.byCat[c] || 0;
      if (before > 60 && proj > before * 1.2 && proj - before > 80) {
        tips.push({ kind: 'alert', ico: 'cat:' + c, title: `${cat(c).name} ${Math.round((proj / before - 1) * 100)}% acima de ${MONTHS[parseD(prevYm + '-01').getMonth()].toLowerCase()}`, text: `${isCurrent(ym) ? 'No ritmo atual você deve fechar o mês' : 'Você fechou o mês'} com ${brl0(proj)} em ${cat(c).name.toLowerCase()}, contra ${brl0(before)} no mês anterior.`, save: proj - before });
      }
    }
    const delivery = st.txs.filter((t) => /ifood|rappi|z[eé] delivery/i.test(t.desc) && t.amount < 0);
    if (delivery.length >= 5) {
      const tot = -sum(delivery, (t) => t.amount);
      tips.push({ kind: 'info', ico: '🥡', title: `${delivery.length} pedidos de delivery este mês`, text: `Foram ${brl(tot)}. Trocar 2 pedidos por semana por comida feita em casa economiza cerca de ${brl0(tot * 0.4 / prog)} por mês.`, save: tot * 0.4 / prog });
    }
    const rides = st.txs.filter((t) => /uber|99 ?pop/i.test(t.desc) && t.amount < 0);
    if (rides.length >= 6) {
      const tot = -sum(rides, (t) => t.amount);
      tips.push({ kind: 'info', ico: '🚕', title: `${rides.length} corridas de app (${brl0(tot)})`, text: `Corridas curtas são as que mais pesam no fim do mês. Combinar trajetos e usar transporte público em 30% delas pode render ${brl0(tot * 0.3 / prog)} a mais por mês.`, save: tot * 0.3 / prog });
    }
    const subs = -sum(S.recurring.filter((r) => r.cat === 'assinaturas' && r.active !== false), (r) => r.amount);
    if (subs > 0) tips.push({ kind: 'info', ico: '📺', title: `Assinaturas: ${brl(subs)}/mês`, text: `Isso dá ${brl0(subs * 12)} por ano. Revise o que você realmente usou nos últimos 30 dias e pause o resto.` });
    const inc = incomeBase(ym);
    if (inc > 0) {
      const rate = (inc - pj.total) / inc;
      if (rate < 0.1) tips.push({ kind: 'alert', ico: '⚠️', title: `Você está guardando só ${pct(Math.max(0, rate))} da renda`, text: 'O ideal é chegar a 20%. Comece pagando a si mesmo: programe um aporte automático para o dia seguinte ao salário.' });
      else if (rate >= 0.2) tips.push({ kind: 'good', ico: '🏆', title: `Mandou bem: ${pct(rate)} da renda livre`, text: 'Você está acima da meta de 20%. Direcione a sobra para a reserva de emergência ou para a caixinha mais próxima de completar.' });
    }
    const reserve = S.goals.find((g) => g.kind === 'reserva');
    const essential = avgExpenses(3, (c) => cat(c).group === 'need');
    if (essential > 0) {
      const mc = reserve ? reserve.saved / essential : 0;
      if (mc < 6) tips.push({ kind: mc < 2 ? 'alert' : 'info', ico: '🛟', title: `Sua reserva cobre ${mc.toFixed(1).replace('.', ',')} meses`, text: `Com gastos essenciais de ${brl0(essential)}/mês, a reserva ideal é ${brl0(essential * 6)} (6 meses). ${reserve ? '' : 'Crie uma caixinha "Reserva de emergência".'}` });
    }
    for (const [c, lim] of Object.entries(S.budgets)) {
      const v = st.byCat[c] || 0;
      if (v > lim) tips.push({ kind: 'alert', ico: '🎯', title: `Orçamento de ${cat(c).name.toLowerCase()} estourado`, text: `Você usou ${brl0(v)} de ${brl0(lim)} (${pct(v / lim)}).` });
    }
    for (const c of S.cards) {
      const used = limitUsed(c);
      if (c.limit && used / c.limit > 0.5) tips.push({ kind: 'alert', ico: '💳', title: `${c.name}: ${pct(used / c.limit)} do limite usado`, text: 'Usar mais de 30% do limite pode reduzir seu score de crédito. Evite parcelar novas compras até a próxima fatura.' });
    }
    const fx = fixedMonthly().out;
    if (inc && fx / inc > 0.5) tips.push({ kind: 'alert', ico: '🏠', title: `Contas fixas = ${pct(fx / inc)} da renda`, text: 'Acima de 50% o orçamento fica engessado. Renegocie planos (celular, internet) e reveja o que dá para reduzir.' });
    if (S.profile.payday) tips.push({ kind: 'good', ico: '📆', title: 'Pague-se primeiro', text: `Seu salário cai no dia ${S.profile.payday}. Programe as caixinhas para o dia ${Math.min(28, S.profile.payday + 1)}: o dinheiro sai antes de você ter a chance de gastar.` });
    const order = { alert: 0, info: 1, good: 2 };
    return tips.sort((a, b) => order[a.kind] - order[b.kind]);
  }

  function upcoming(days = 35) {
    const T = now(), end = new Date(T.getFullYear(), T.getMonth(), T.getDate() + days);
    const startT = new Date(T.getFullYear(), T.getMonth(), T.getDate());
    const out = [];
    for (let k = 0; k <= 1; k++) {
      const y = T.getFullYear(), m = T.getMonth() + k;
      const ref = new Date(y, m, 1), ym = ymOf(ref), dim = daysIn(ref.getFullYear(), ref.getMonth());
      for (const r of S.recurring) {
        if (r.active === false || (r.start && ym < r.start)) continue;
        const d = new Date(ref.getFullYear(), ref.getMonth(), Math.min(r.day, dim));
        if (d < startT || d > end || S.posted[r.id + ':' + ym]) continue;
        out.push({ date: d, title: r.desc, sub: `${METHODS[r.method] ? METHODS[r.method].name : ''} · ${cat(r.cat).name}`, amount: r.amount, kind: r.amount > 0 ? 'in' : 'out' });
      }
      for (const g of S.goals) {
        if (!g.autoDay || !g.monthly) continue;
        const d = new Date(ref.getFullYear(), ref.getMonth(), Math.min(g.autoDay, dim));
        if (d < startT || d > end || S.posted['g:' + g.id + ':' + ym]) continue;
        out.push({ date: d, title: `Caixinha · ${g.name}`, sub: 'Aporte automático', amount: -g.monthly, kind: 'save' });
      }
    }
    for (const c of S.cards) for (const inv of openInvoices(c)) {
      if (inv.due > end) continue;
      out.push({ date: inv.due, title: `Fatura ${c.name}`, sub: inv.due < startT ? 'Vencida!' : `Fatura de ${MONTHS[parseD(inv.ym + '-01').getMonth()].toLowerCase()}`, amount: -inv.total, kind: 'card', card: c.id, ym: inv.ym, late: inv.due < startT });
    }
    return out.sort((a, b) => a.date - b.date);
  }

  /* --------------------------------------------------------------- charts */
  function donut(items, total, label) {
    const R = 58, C = 2 * Math.PI * R;
    let off = 0;
    const segs = items.map((it) => {
      const len = total ? (it.value / total) * C : 0;
      const s = `<circle cx="80" cy="80" r="${R}" fill="none" stroke="${it.color}" stroke-width="28" stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(-90 80 80)"><title>${esc(it.label)}: ${esc(brl(it.value))}</title></circle>`;
      off += len; return s;
    }).join('');
    return `<svg class="donut-chart" viewBox="0 0 160 160" width="170" height="170" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Gastos por categoria">
      <circle cx="80" cy="80" r="${R}" fill="none" stroke="#E8EDEB" stroke-width="28"/>${segs}
      
      <circle cx="80" cy="80" r="${R - 14}" fill="#fff"/>
      <text x="80" y="75" text-anchor="middle" font-family="IBM Plex Sans" font-size="9" font-weight="700" fill="#5B6B66">${esc(label)}</text>
      <text x="80" y="93" text-anchor="middle" font-family="IBM Plex Sans, sans-serif" font-size="17" font-weight="600" fill="#0B3D33">${esc(S.settings.hide ? '•••' : 'R$ ' + kfmt(total))}</text></svg>`;
  }

  function barChart(rows, curIdx) {
    const W = 640, H = 240, L = 40, B = 205, top = 14;
    const max = Math.max(100, ...rows.flatMap((r) => [r.a, r.b])) * 1.12;
    const y = (v) => B - (v / max) * (B - top);
    const bw = (W - L) / rows.length;
    let g = '';
    for (let k = 0; k <= 4; k++) { const v = (max / 4) * k, yy = y(v); g += `<line x1="${L}" x2="${W}" y1="${yy}" y2="${yy}" stroke="#0B3D3318" stroke-dasharray="${k ? '4 4' : '0'}"/><text x="${L - 8}" y="${yy + 4}" text-anchor="end" font-size="10" font-family="IBM Plex Sans" fill="#5B6B66">${S.settings.hide ? '' : kfmt(v)}</text>`; }
    rows.forEach((r, i) => {
      const x = L + i * bw + bw * 0.16, w = bw * 0.32;
      const on = i === curIdx;
      g += `<rect x="${x}" y="${y(r.a)}" width="${w}" height="${B - y(r.a)}" rx="4" fill="#3DBA85"><title>Entradas ${esc(brl(r.a))}</title></rect>`;
      g += `<rect x="${x + w + 4}" y="${y(r.b)}" width="${w}" height="${B - y(r.b)}" rx="4" fill="${on ? '#D4553A' : '#EBB3A6'}"><title>Saídas ${esc(brl(r.b))}</title></rect>`;
      g += `<text x="${x + w + 2}" y="${B + 22}" text-anchor="middle" font-size="12" font-weight="${on ? 900 : 600}" font-family="IBM Plex Sans" fill="#0B3D33">${esc(r.label)}</text>`;
      if (on) g += `<rect x="${x - 6}" y="${B + 8}" width="${w * 2 + 16}" height="20" rx="10" fill="none" stroke="#0B3D33" stroke-width="1.5"/>`;
    });
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Entradas e saídas por mês">${g}</svg>`;
  }

  function projChart(pts, target, monthly) {
    const W = 640, H = 230, L = 46, B = 196, top = 16, R = 14;
    const n = Math.max(1, pts.length - 1);
    const max = Math.max(target, pts[pts.length - 1]) * 1.1 || 1;
    const x = (i) => L + (i / n) * (W - L - R);
    const y = (v) => B - (v / max) * (B - top);
    const line = pts.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    const contrib = pts.map((v, i) => `${x(i).toFixed(1)},${y(Math.min(pts[0] + monthly * i, max)).toFixed(1)}`).join(' ');
    let g = '';
    for (let k = 0; k <= 4; k++) { const v = (max / 4) * k; g += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="#0B3D3314"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end" font-size="10" font-family="IBM Plex Sans" fill="#5B6B66">${kfmt(v)}</text>`; }
    const step = Math.max(1, Math.ceil(n / 8));
    for (let i = 0; i <= n; i += step) g += `<text x="${x(i)}" y="${B + 18}" text-anchor="middle" font-size="10" font-family="IBM Plex Sans" fill="#5B6B66">${i === 0 ? 'hoje' : i + 'm'}</text>`;
    g += `<polygon points="${x(0)},${B} ${line} ${x(n)},${B}" fill="#3DBA85" opacity=".18"/>`;
    g += `<polyline points="${contrib}" fill="none" stroke="#3E5C76" stroke-width="2" stroke-dasharray="5 4"/>`;
    g += `<polyline points="${line}" fill="none" stroke="#0B3D33" stroke-width="2.25" stroke-linejoin="round"/>`;
    g += `<line x1="${L}" x2="${W - R}" y1="${y(target)}" y2="${y(target)}" stroke="#D4553A" stroke-width="2.5" stroke-dasharray="8 5"/>`;
    g += `<rect x="${W - R - 78}" y="${y(target) - 24}" width="78" height="20" rx="4" fill="#D4553A"/><text x="${W - R - 39}" y="${y(target) - 10}" text-anchor="middle" font-size="11" font-weight="800" font-family="IBM Plex Sans" fill="#fff">META ${kfmt(target)}</text>`;
    g += `<circle cx="${x(n)}" cy="${y(pts[n])}" r="5" fill="#fff" stroke="#0B3D33" stroke-width="2.25"/>`;
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Projeção da caixinha">${g}</svg>`;
  }

  function ring(value, size = 128, color = '#3DBA85', track = 'rgba(255,255,255,.15)', text = '') {
    const R = 46, C = 2 * Math.PI * R, len = clamp(value, 0, 1) * C;
    return `<svg class="score-ring" viewBox="0 0 120 120" width="${size}" height="${size}"><circle cx="60" cy="60" r="${R}" fill="none" stroke="${track}" stroke-width="14"/><circle cx="60" cy="60" r="${R}" fill="none" stroke="${color}" stroke-width="14" stroke-linecap="round" stroke-dasharray="${len} ${C}" transform="rotate(-90 60 60)"/>${text}</svg>`;
  }

  const hbars = (rows, color = '#0B3D33') => {
    const max = Math.max(1, ...rows.map((r) => r.value));
    return `<div class="rule-bars">${rows.map((r) => `<div class="rule-bar"><div class="rb-top"><span>${r.label}</span><b>${brl(r.value)}</b></div><div class="progress"><i style="width:${(r.value / max) * 100}%;background:${r.color || color}"></i></div></div>`).join('')}</div>`;
  };

  /* ------------------------------------------------------- componentes */
  function txRow(t) {
    const c = cat(t.cat);
    const m = METHODS[t.method] || { name: t.method, ico: '' };
    const live = t.source === 'bank' || t.source === 'live' ? '<span class="tag">Open Finance</span>' : t.source === 'auto' ? '<span class="tag">Automático</span>' : '';
    return `<div class="tx ${UI.fresh.has(t.id) ? 'tx-new' : ''}" data-act="editTx" data-id="${t.id}" role="button" tabindex="0">
      <div class="tx-ico">${catIco(t.cat)}</div>
      <div class="tx-main"><div class="tx-desc">${esc(t.desc)}</div>
      <div class="tx-meta"><span>${esc(c.name)}</span>·<span>${methodIco(t.method)} ${esc(m.name)}</span>·<span>${esc(srcName(t))}</span>${live}</div></div>
      <div class="tx-amt ${t.amount > 0 ? 'pos' : ''}">${signed(t.amount)}</div></div>`;
  }
  const emptyBox = (msg, btn = '') => `<div class="empty"><img src="${MASCOT}" alt="">${msg}${btn ? `<div style="margin-top:14px">${btn}</div>` : ''}</div>`;

  function billRow(b) {
    const d = b.date;
    const color = b.kind === 'in' ? 'pos' : '';
    const act = b.kind === 'card' ? `data-act="payInvoice" data-card="${b.card}" data-ym="${b.ym}" style="cursor:pointer" title="Pagar fatura"` : '';
    return `<div class="bill" ${act}><div class="bill-date"><b>${pad(d.getDate())}</b><span>${MS[d.getMonth()]}</span></div>
      <div class="bill-info"><b>${esc(b.title)}</b><span ${b.late ? 'class="neg" style="font-weight:800"' : ''}>${esc(b.sub)}</span></div>
      <div class="bill-amt ${color}">${signed(b.amount)}</div></div>`;
  }

  function goalCard(g) {
    const sim = simulate(g.target, g.saved, g.monthly, g.rate);
    const p = clamp(g.saved / g.target, 0, 1);
    const dark = ['#3E5C76', '#0B3D33', '#D4553A'].includes(g.color);
    const eta = sim.months === 0 ? '🎉 Meta batida! Hora de resgatar ou criar a próxima.' : sim.months === Infinity ? 'Defina um aporte mensal para calcular a data.' : `Guardando <b>${brl0(g.monthly)}/mês</b>${g.rate ? ` a ${String(g.rate).replace('.', ',')}% a.a.` : ''}, você chega lá em <b>${monthsTxt(sim.months)}</b> (${monthYear(addMonths(sim.months))}).`;
    return `<article class="goal">
      <div class="goal-top" style="background:${g.color};color:${dark ? '#fff' : '#0B3D33'}">
        <span class="emoji">${g.emoji}</span><h4>${esc(g.name)}</h4>
        <span class="pill pct">${Math.round(p * 100)}%</span>
      </div>
      <div class="goal-body">
        <div class="nums"><b>${brl(g.saved)}</b><span class="muted" style="font-size:.82rem">de ${brl0(g.target)}</span></div>
        <div class="progress"><i style="width:${p * 100}%"></i></div>
        <div class="goal-eta">${eta}${g.autoDay ? `<br><span class="muted">🔁 Aporte automático todo dia ${g.autoDay}</span>` : ''}</div>
        <div class="goal-actions">
          <button class="btn btn-lime btn-sm" data-act="goalMove" data-id="${g.id}" data-dir="1">+ Guardar</button>
          <button class="btn btn-sm" data-act="goalMove" data-id="${g.id}" data-dir="-1">Resgatar</button>
          <button class="btn btn-sm btn-ghost" data-act="simGoal" data-id="${g.id}">Simular</button>
          <button class="btn btn-sm btn-ghost" data-act="editGoal" data-id="${g.id}" aria-label="Editar">✏️</button>
        </div>
      </div></article>`;
  }

  /* ------------------------------------------------------------- views */
  const ROUTES = [
    { id: 'painel', name: 'Painel', ico: 'home' },
    { id: 'transacoes', name: 'Transações', ico: 'list' },
    { id: 'contas', name: 'Contas & cartões', ico: 'bank' },
    { id: 'orcamentos', name: 'Orçamentos', ico: 'target' },
    { id: 'caixinhas', name: 'Caixinhas', ico: 'coins' },
    { id: 'calendario', name: 'Contas fixas', ico: 'cal' },
    { id: 'relatorios', name: 'Relatórios', ico: 'chart' },
    { id: 'aprender', name: 'Dicas & aprender', ico: 'cap' },
    { id: 'ajustes', name: 'Ajustes', ico: 'sliders' },
  ];
  const ICONS = {
    home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
    bank: '<path d="M3 10l9-6 9 6M5 10v8M10 10v8M14 10v8M19 10v8M3 21h18"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    coins: '<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/>',
    cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    chart: '<path d="M5 20V11M11 20V5M17 20v-7M3 20h18"/>',
    cap: '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11.5V16c3 2.2 9 2.2 12 0v-4.5"/>',
    sliders: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  };
  const icon = (k) => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[k]}</svg>`;
  const TITLES = { painel: 'Seu <span class="serif">painel</span>', transacoes: 'Transações', contas: 'Contas & cartões', orcamentos: 'Orçamentos', caixinhas: 'Suas <span class="serif">caixinhas</span>', calendario: 'Contas fixas', relatorios: 'Relatórios', aprender: 'Dicas & <span class="serif">aprender</span>', ajustes: 'Ajustes' };

  const V = {};

  V.painel = () => {
    const ym = UI.ym, st = monthStats(ym), pv = monthStats(shiftYm(ym, -1));
    const bal = sum(S.accounts, accBalance);
    const goals = sum(S.goals, (g) => g.saved);
    const invested = sum(S.investments || [], (x) => x.currencyCode === 'BRL' ? x.balance : 0);
    const inv = sum(S.cards, limitUsed);
    const sc = calcScore();
    const tips = genTips(ym);
    const cats = Object.entries(st.byCat).sort((a, b) => b[1] - a[1]);
    const top = cats.slice(0, 6).map(([c, v]) => ({ key: c, label: cat(c).name, value: v, color: cat(c).color }));
    const rest = sum(cats.slice(6), (e) => e[1]);
    if (rest > 0) top.push({ key: '', label: 'Demais', value: rest, color: '#C9D3CF' });
    const delta = (a, b) => (b ? (a / b - 1) : 0);
    const pj = projCat(ym);
    const dExp = delta(pj.total, pv.expense);
    const inc = incomeBase(ym);
    const rate = inc ? (inc - pj.total) / inc : 0;
    const rows = []; for (let k = -5; k <= 0; k++) { const m = shiftYm(ym, k), s2 = monthStats(m); rows.push({ label: ymShort(m), a: s2.income, b: s2.expense }); }
    const bills = upcoming().slice(0, 6);
    const last = S.tx.filter((t) => t.date <= todayStr()).sort((a, b) => b.date.localeCompare(a.date) || (b.ts || 0) - (a.ts || 0)).slice(0, 6);
    const budgets = Object.entries(S.budgets).map(([c, lim]) => ({ c, lim, v: st.byCat[c] || 0 })).sort((a, b) => b.v / b.lim - a.v / a.lim).slice(0, 4);
    const tip = tips[0];

    return `
    <div class="grid g-main">
      <section class="hero-balance">
        <div>
          <div class="label">Saldo em contas <button data-act="toggleHide" aria-label="Mostrar ou esconder valores" class="eye-toggle">${S.settings.hide ? 'Mostrar' : 'Ocultar'}</button></div>
          <div class="value">${brl(bal)}</div>
        </div>
        <div class="row">
          <div>Metas do Finaxis<b>${brl0(goals)}</b></div>
          <div>Investimentos bancÃ¡rios<b>${brl0(invested)}</b></div>
          <div>Faturas em aberto<b>${brl0(inv)}</b></div>
          <div>Patrimônio líquido<b>${brl0(bal + goals + invested - inv)}</b></div>
        </div>
      </section>
      <section class="score-card">
        ${ring(sc.score / 1000, 128, '#1E8A5F', '#E6EEEB', `<text x="60" y="62" text-anchor="middle" font-family="IBM Plex Sans, sans-serif" font-size="26" font-weight="600" fill="#10231E">${sc.score}</text><text x="60" y="80" text-anchor="middle" font-family="IBM Plex Sans" font-size="9" font-weight="600" fill="#5B6B66">de 1000</text>`)}
        <div><span class="tag tag-live">Finaxis Score</span><h3 style="margin-top:8px">${sc.label}</h3>
        <p>Baseado em quanto você poupa, no respeito aos orçamentos, na reserva de emergência e no peso das contas fixas.</p>
        <button class="link" data-go="aprender" style="margin-top:8px">Como melhorar meu score</button></div>
      </section>
    </div>

    <div class="grid g-4" style="margin-top:20px">
      <div class="card kpi"><div class="k-label">Entradas</div><div class="k-value pos">${brl(st.income)}</div><div class="k-foot muted">${ymLabel(ym)}</div></div>
      <div class="card kpi"><div class="k-label">Saídas</div><div class="k-value">${brl(st.expense)}</div><div class="k-foot">${pv.expense ? `${dExp > 0 ? '▲' : '▼'} ${Math.abs(Math.round(dExp * 100))}% ${isCurrent(ym) ? 'no ritmo do' : 'vs'} mês anterior` : '—'}</div></div>
      <div class="card kpi"><div class="k-label">Guardado no mês</div><div class="k-value">${brl(st.saved)}</div><div class="k-foot">${S.goals.length} caixinhas ativas</div></div>
      <div class="card kpi"><div class="k-label">Sobra da renda</div><div class="k-value">${inc ? pct(Math.max(-1, rate)) : '—'}</div><div class="k-foot">Meta saudável: 20% ou mais</div></div>
    </div>

    <div class="grid g-main" style="margin-top:20px">
      <section class="card">
        <div class="card-head"><div><h3>Gastos por categoria</h3><span class="sub">${ymLabel(ym)}</span></div><button class="link" data-go="relatorios">Relatório completo</button></div>
        ${top.length ? `<div class="donut-wrap">${donut(top, st.expense, 'GASTOS')}<div class="legend">${top.map((t) => `<div class="legend-row" ${t.key ? `data-act="filterCat" data-cat="${t.key}"` : ''}><i style="background:${t.color}"></i><span>${esc(t.label)}</span><b>${brl0(t.value)} · ${pct(t.value / st.expense)}</b></div>`).join('')}</div></div>` : emptyBox('Nenhum gasto neste mês ainda.')}
      </section>
      <section class="card cream">
        <div class="card-head"><div><h3>Próximas contas</h3><span class="sub">Próximos 35 dias</span></div><button class="link" data-go="calendario">Calendário</button></div>
        ${bills.length ? bills.map(billRow).join('') : emptyBox('Nada para pagar por enquanto.')}
      </section>
    </div>

    <div class="grid g-main" style="margin-top:20px">
      <section class="card">
        <div class="card-head"><div><h3>Fluxo dos últimos 6 meses</h3><span class="sub">Entradas x saídas</span></div><div class="chart-legend"><span><i style="background:#3DBA85"></i>Entradas</span><span><i style="background:#D4553A"></i>Saídas</span></div></div>
        <div class="chart-wrap">${barChart(rows, 5)}</div>
      </section>
      <section class="card">
        <div class="card-head"><h3>Caixinhas</h3><button class="link" data-go="caixinhas">Ver todas</button></div>
        ${S.goals.length ? S.goals.slice(0, 4).map((g) => { const p = clamp(g.saved / g.target, 0, 1); const sim = simulate(g.target, g.saved, g.monthly, g.rate); return `<div class="budget-row"><div class="top"><b>${g.emoji} ${esc(g.name)}</b><span class="vals">${pct(p)}</span></div><div class="progress"><i style="width:${p * 100}%;background:${g.color}"></i></div><div class="muted" style="font-size:.74rem;margin-top:6px">${brl0(g.saved)} de ${brl0(g.target)} · ${sim.months === 0 ? 'concluída' : 'faltam ' + monthsTxt(sim.months)}</div></div>`; }).join('') : emptyBox('Crie sua primeira caixinha.', '<button class="btn btn-lime btn-sm" data-act="newGoal">Criar caixinha</button>')}
      </section>
    </div>

    <div class="grid g-main" style="margin-top:20px">
      <section class="card">
        <div class="card-head"><div><h3>Últimas transações</h3><span class="sub">Atualizadas pelo Open Finance</span></div><button class="link" data-go="transacoes">Ver todas</button></div>
        <div class="tx-list">${last.length ? last.map(txRow).join('') : emptyBox('Sem transações. Conecte um banco ou lance manualmente.', '<button class="btn btn-lime btn-sm" data-act="connectBank">Conectar banco</button>')}</div>
      </section>
      <div class="stack">
        ${tip ? `<section class="tip-hero"><img src="${MASCOT}" alt=""><div><b>Dica do mês</b><p><strong>${esc(tip.title)}.</strong> ${esc(tip.text)}</p><button class="link" data-go="aprender" style="margin-top:6px">Mais ${Math.max(0, tips.length - 1)} dicas →</button></div></section>` : ''}
        <section class="card">
          <div class="card-head"><h3>Orçamentos</h3><button class="link" data-go="orcamentos">Ajustar</button></div>
          ${budgets.length ? budgets.map((b) => budgetRow(b.c, b.v, b.lim, ym)).join('') : emptyBox('Defina limites por categoria.', '<button class="btn btn-sm btn-lime" data-go="orcamentos">Criar orçamento</button>')}
        </section>
      </div>
    </div>`;
  };

  function budgetRow(c, v, lim, ym) {
    const p = lim ? v / lim : 0;
    const exp = dayProgress(ym);
    const cls = p > 1 ? 'over' : p > 0.8 || p > exp + 0.15 ? 'warn' : '';
    const left = lim - v;
    return `<div class="budget-row"><div class="top"><b>${catIco(c)} ${esc(cat(c).name)}</b><span class="vals">${brl0(v)} / ${brl0(lim)}</span></div>
      <div class="progress ${cls}"><i style="width:${clamp(p, 0, 1) * 100}%"></i></div>
      <div class="muted" style="font-size:.74rem;margin-top:6px">${left >= 0 ? `Resta ${brl0(left)}${isCurrent(ym) && left > 0 ? ` · ${brl0(left / Math.max(1, daysIn(now().getFullYear(), now().getMonth()) - now().getDate() + 1))}/dia até o fim do mês` : ''}` : `<span class="neg" style="font-weight:700">Estourou ${brl0(-left)}</span>`}</div></div>`;
  }

  V.transacoes = () => {
    const opts = (arr, sel) => arr.map(([v, l]) => `<option value="${v}" ${sel === v ? 'selected' : ''}>${esc(l)}</option>`).join('');
    const f = UI.f;
    return `
    <section class="card">
      <div class="filters">
        <input class="input search" type="search" placeholder="Buscar por descrição…" value="${esc(f.q)}" data-filter="q" aria-label="Buscar">
        <div class="seg" role="group" aria-label="Tipo">${[['all', 'Todas'], ['out', 'Saídas'], ['in', 'Entradas']].map(([v, l]) => `<button data-act="ftype" data-v="${v}" class="${f.type === v ? 'on' : ''}">${l}</button>`).join('')}</div>
        <select class="select" data-filter="cat" aria-label="Categoria"><option value="">Todas as categorias</option>${opts(Object.keys(CATS).map((k) => [k, cat(k).name]), f.cat)}</select>
        <select class="select" data-filter="method" aria-label="Forma de pagamento"><option value="">Todas as formas</option>${opts(Object.entries(METHODS).map(([k, m]) => [k, m.name]), f.method)}</select>
        <select class="select" data-filter="src" aria-label="Conta ou cartão"><option value="">Contas e cartões</option>${opts([...S.accounts.map((a) => ['a:' + a.id, a.name]), ...S.cards.map((c) => ['c:' + c.id, '💳 ' + c.name])], f.src)}</select>
        <button class="btn btn-sm" data-act="exportCsv">⬇ CSV</button>
      </div>
      <div id="txSummary"></div>
      <div class="tx-list" id="txList"></div>
    </section>`;
  };
  function renderTxList() {
    const box = $('#txList'); if (!box) return;
    const f = UI.f, q = f.q.trim().toLowerCase();
    let list = S.tx.filter((t) => t.date.startsWith(UI.ym));
    if (q) list = list.filter((t) => t.desc.toLowerCase().includes(q) || cat(t.cat).name.toLowerCase().includes(q));
    if (f.type === 'in') list = list.filter((t) => t.amount > 0);
    if (f.type === 'out') list = list.filter((t) => t.amount < 0);
    if (f.cat) list = list.filter((t) => t.cat === f.cat);
    if (f.method) list = list.filter((t) => t.method === f.method);
    if (f.src) { const [k, id] = f.src.split(':'); list = list.filter((t) => (k === 'a' ? t.accountId === id : t.cardId === id)); }
    list.sort((a, b) => b.date.localeCompare(a.date) || (b.ts || 0) - (a.ts || 0));
    const inS = sum(list.filter((t) => t.amount > 0), (t) => t.amount), outS = -sum(list.filter((t) => t.amount < 0), (t) => t.amount);
    $('#txSummary').innerHTML = `<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:6px"><span class="chip">${list.length} transações</span><span class="chip"><span class="chip-dot" style="background:#2E9E6B"></span>Entradas ${brl(inS)}</span><span class="chip"><span class="chip-dot" style="background:#D4553A"></span>Saídas ${brl(outS)}</span></div>`;
    if (!list.length) { box.innerHTML = emptyBox('Nenhuma transação encontrada com esses filtros.'); return; }
    let html = '', cur = '';
    const groups = {};
    list.forEach((t) => { (groups[t.date] = groups[t.date] || []).push(t); });
    for (const d of Object.keys(groups)) {
      const dt = parseD(d), tot = sum(groups[d], (t) => t.amount);
      const lbl = d === todayStr() ? 'Hoje' : `${DOW[dt.getDay()]}, ${dt.getDate()} de ${MONTHS[dt.getMonth()].toLowerCase()}`;
      html += `<div class="day-head"><span>${lbl}</span><span>${signed(tot)}</span></div>` + groups[d].map(txRow).join('');
    }
    box.innerHTML = html;
  }

  V.contas = () => {
    const accs = S.accounts.map((a) => {
      const b = bankOf(a);
      return `<article class="bank-card acc">
        <div class="bc-top"><div style="display:flex;gap:12px;align-items:center"><span class="bank-logo" style="background:${b.color}">${b.short}</span><div><div class="bc-name">${esc(a.name)}</div><span style="font-size:.78rem" class="muted">${a.kind === 'dinheiro' ? 'Dinheiro em espécie' : 'Conta corrente'}</span></div></div>
        ${a.connected ? '<span class="tag tag-live">● Conectada</span>' : '<span class="tag">Manual</span>'}</div>
        <div class="bc-bottom"><div><small>Saldo disponível</small><b>${brl(accBalance(a))}</b></div>
        <div style="display:flex;gap:6px">${a.connected ? `<button class="btn btn-sm" data-act="syncAcc" data-id="${a.id}">⟳ Sincronizar</button>` : ''}${a.connected && a.connectionId ? `<button class="btn btn-sm btn-ghost" data-act="disconnectAcc" data-id="${a.id}" title="Revogar consentimento">Desconectar</button>` : ''}<button class="btn btn-sm btn-ghost" data-act="editAcc" data-id="${a.id}" aria-label="Editar conta">✏️</button></div></div>
        ${a.connected ? `<span class="muted" style="font-size:.7rem;position:relative;z-index:1">Última sincronização: ${a.lastSync ? new Date(a.lastSync).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—'}</span>` : ''}
      </article>`;
    }).join('');
    const cards = S.cards.map((c) => {
      const b = bankOf(c);
      const curYm = ymOf(now());
      const open = invoiceTotal(c, curYm), used = limitUsed(c), inv = openInvoices(c).filter((i) => i.ym < curYm);
      return `<div class="stack" style="gap:12px">
        <article class="bank-card" style="background:#0B3D33">
          <div class="bc-top"><div style="display:flex;gap:12px;align-items:center"><span class="bank-logo" style="background:${b.color};border-color:#fff">${b.short}</span><div class="bc-name">${esc(c.name)}</div></div><span style="font-weight:800;font-size:.85rem">${esc(c.brand || '')}</span></div>
          <div style="display:flex;align-items:center;gap:14px;position:relative;z-index:1"><span class="chipimg"></span><span class="bc-num">•••• •••• •••• ${esc(c.last4 || '0000')}</span></div>
          <div class="bc-bottom"><div><small>Fatura atual (aberta)</small><b>${brl(open)}</b></div><div style="text-align:right"><small>Vence dia</small><b>${c.dueDay}</b></div></div>
          <div style="position:relative;z-index:1"><div class="progress"><i style="width:${c.limit ? clamp(used / c.limit, 0, 1) * 100 : 0}%;background:${used / c.limit > 0.7 ? '#D4553A' : '#3DBA85'}"></i></div><span style="font-size:.72rem;opacity:.9;display:block;margin-top:6px">Limite usado ${brl0(used)} de ${brl0(c.limit)} · disponível ${brl0(Math.max(0, c.limit - used))}</span></div>
        </article>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-sm" data-act="viewCard" data-id="${c.id}">Ver fatura</button>
          ${inv.map((i) => `<button class="btn btn-sm btn-lime" data-act="payInvoice" data-card="${c.id}" data-ym="${i.ym}">Pagar ${MS[parseD(i.ym + '-01').getMonth()]} · ${brl0(i.total)}</button>`).join('')}
          <button class="btn btn-sm btn-ghost" data-act="editCard" data-id="${c.id}">✏️ Editar</button>${c.connected && c.connectionId ? `<button class="btn btn-sm btn-ghost" data-act="disconnectAcc" data-id="${c.id}">Desconectar</button>` : ''}
        </div></div>`;
    }).join('');
    return `
    <div class="grid g-main">
      <section class="card cream" style="display:flex;gap:18px;align-items:center;flex-wrap:wrap">
        <div style="flex:1;min-width:240px"><span class="pill">Open Finance</span><h3 class="display" style="font-size:1.6rem;margin-top:14px">Conecte seus bancos e cartões</h3>
        <p class="muted" style="margin-top:8px;font-size:.9rem;line-height:1.5">Com o seu consentimento, o Finaxis lê saldos, faturas, Pix, compras e salário e já categoriza tudo. Sem senha do banco: a autorização acontece no app da sua instituição.</p></div>
        <div style="display:flex;flex-direction:column;gap:10px"><button class="btn btn-lime btn-lg" data-act="connectBank">Conectar banco ${ARROW}</button><button class="btn btn-sm" data-act="newAccount">+ Conta manual</button><button class="btn btn-sm" data-act="newCard">+ Cartão manual</button></div>
      </section>
      <section class="card">
        <div class="card-head"><h3>Tempo real</h3><span class="sync-dot ${S.settings.live ? '' : 'off'}"><i></i>${S.settings.live ? 'Ao vivo' : 'Pausado'}</span></div>
        <div class="setting"><div><b>Receber transações ao vivo</b><span>Novas compras e Pix aparecem assim que o banco envia.</span></div><label class="toggle"><input type="checkbox" data-setting="live" ${S.settings.live ? 'checked' : ''}><span></span></label></div>
        <button class="btn btn-red btn-sm" data-act="simulateLive" style="margin-top:12px">⚡ Simular nova compra agora</button>
      </section>
    </div>
    <h3 class="display" style="font-size:1.4rem;margin:30px 0 14px">Contas</h3>
    <div class="grid g-3">${accs}</div>
    <h3 class="display" style="font-size:1.4rem;margin:30px 0 14px">Cartões de crédito</h3>
    ${S.cards.length ? `<div class="grid g-3">${cards}</div>` : `<div class="card">${emptyBox('Nenhum cartão cadastrado.', '<button class="btn btn-lime btn-sm" data-act="connectBank">Conectar via Open Finance</button>')}</div>`}`;
  };

  V.orcamentos = () => {
    const ym = UI.ym, st = monthStats(ym);
    const inc = incomeBase(ym);
    const pj = projCat(ym).byCat;
    const need = sum(Object.entries(pj).filter(([c]) => cat(c).group === 'need'), (e) => e[1]);
    const want = sum(Object.entries(pj).filter(([c]) => cat(c).group === 'want'), (e) => e[1]);
    const savedTot = Math.max(0, inc - need - want);
    const rule = (label, val, ideal, color, txt) => `<div class="rule-bar"><div class="rb-top"><span><b>${label}</b> · ${txt}</span><span>${brl0(val)} <span class="muted">/ ideal ${brl0(ideal)}</span></span></div><div class="progress ${val > ideal && color !== '#3DBA85' ? 'over' : ''}"><i style="width:${ideal ? clamp(val / ideal, 0, 1) * 100 : 0}%;background:${color}"></i></div></div>`;
    const withB = Object.keys(S.budgets);
    const noB = EXP_CATS.filter((c) => !S.budgets[c] && st.byCat[c]);
    return `
    <div class="grid g-main">
      <section class="card">
        <div class="card-head"><div><h3>Seus limites do mês</h3><span class="sub">${ymLabel(ym)} · ${withB.length} categorias</span></div><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-sm" data-act="suggestBudgets">✨ Sugerir</button><button class="btn btn-sm btn-lime" data-act="editBudgets">Editar limites</button></div></div>
        ${withB.length ? withB.map((c) => budgetRow(c, st.byCat[c] || 0, S.budgets[c], ym)).join('') : emptyBox('Você ainda não definiu limites. Use “Sugerir” para criar a partir da sua média.')}
        ${noB.length ? `<div class="day-head" style="margin-top:8px"><span>Sem limite definido</span></div>${noB.map((c) => `<div class="bill"><div class="tx-ico">${catIco(c)}</div><div class="bill-info"><b>${cat(c).name}</b><span>Sem limite</span></div><div class="bill-amt">${brl0(st.byCat[c])}</div></div>`).join('')}` : ''}
      </section>
      <div class="stack">
        <section class="card cream">
          <div class="card-head"><div><h3>Regra 50/30/20</h3><span class="sub">Renda de ${brl0(inc)}${isCurrent(ym) ? ' · projeção de fechamento do mês' : ''}</span></div></div>
          ${inc ? `<div class="rule-bars">
            ${rule('50%', need, inc * 0.5, '#0B3D33', 'Necessidades')}
            ${rule('30%', want, inc * 0.3, '#D4553A', 'Desejos')}
            ${rule('20%', savedTot, inc * 0.2, '#3DBA85', 'Poupança e metas')}
          </div><p class="muted" style="font-size:.8rem;margin-top:14px;line-height:1.5">Necessidades: moradia, mercado, contas, transporte, saúde, educação. Desejos: delivery, compras, lazer, assinaturas, viagens.</p>` : emptyBox('Informe seu salário em Ajustes para calcular.', '<button class="btn btn-sm btn-lime" data-go="ajustes">Informar salário</button>')}
        </section>
        <section class="tip-hero"><img src="${MASCOT}" alt=""><div><b>Como funciona</b><p>Você recebe um alerta quando uma categoria passa de 80% do limite. O app também mostra quanto dá para gastar por dia até o fim do mês.</p></div></section>
      </div>
    </div>`;
  };

  V.caixinhas = () => {
    const g = UI.simGoal === '__free' ? null : (S.goals.find((x) => x.id === UI.simGoal) || S.goals[0]);
    const totalSaved = sum(S.goals, (x) => x.saved), totalMonthly = sum(S.goals, (x) => x.monthly);
    const investments = S.investments || [];
    const investmentTotal = sum(investments, (x) => x.currencyCode === 'BRL' ? x.balance : 0);
    const deliv = avgExpenses(3, (c) => c === 'alimentacao');
    return `
    <div class="grid g-3" style="margin-bottom:20px">
      <div class="card kpi"><div class="k-label">Total guardado</div><div class="k-value">${brl(totalSaved)}</div><div class="k-foot">${S.goals.length} caixinhas</div></div>
      <div class="card kpi"><div class="k-label">Aportes por mês</div><div class="k-value">${brl(totalMonthly)}</div><div class="k-foot muted">${S.profile.salary ? pct(totalMonthly / S.profile.salary) + ' do salário' : ''}</div></div>
      <div class="card kpi"><div class="k-label">Rendimento estimado em 12 meses</div><div class="k-value">${brl0(sum(S.goals, (x) => { const i = Math.pow(1 + (x.rate || 0) / 100, 1 / 12) - 1; let b = x.saved; for (let k = 0; k < 12; k++) b = b * (1 + i) + x.monthly; return b - x.saved - x.monthly * 12; }))}</div><div class="k-foot">Juros compostos trabalhando por você</div></div>
    </div>
    <section class="card" style="margin-bottom:20px">
      <div class="card-head"><div><h3>Investimentos e caixinhas dos bancos</h3><span class="sub">Saldo informado pela instituiÃ§Ã£o conectada</span></div><b>${brl(investmentTotal)}</b></div>
      ${investments.length ? `<div class="stack" style="gap:8px">${investments.map((x) => `<div class="bill"><div class="bank-logo" style="background:${esc(x.bankColor || '#0B3D33')}">${esc((x.bankName || 'BN').slice(0, 2))}</div><div class="bill-info"><b>${esc(x.name)}</b><span>${esc(x.bankName || x.issuer || 'InstituiÃ§Ã£o')} Â· ${esc([x.subtype, x.rateType && x.rate != null ? `${x.rate}% ${x.rateType}` : ''].filter(Boolean).join(' Â· ') || x.type)}</span></div><div class="bill-amt">${moneyIn(x.balance, x.currencyCode)}</div></div>`).join('')}</div>` : `<p class="muted" style="font-size:.86rem;line-height:1.5">Nenhum investimento foi retornado pelas conexÃµes. Ao conectar o banco, autorize investimentos se essa opÃ§Ã£o aparecer. A disponibilidade depende do banco e do plano Pluggy. Estes valores sÃ£o somente leitura; as metas do Finaxis abaixo sÃ£o controles separados.</p>`}
    </section>
    <div class="grid g-3">${S.goals.map(goalCard).join('')}
      <button class="goal-new" data-act="newGoal"><div><div class="plus">+</div><b class="display" style="font-size:1.2rem">Nova caixinha</b><p class="muted" style="font-size:.84rem;margin-top:6px">Viagem, carro, casamento, reserva…</p></div></button>
    </div>
    <section class="card" style="margin-top:24px" id="simulator">
      <div class="card-head"><div><h3>Simulador de metas</h3><span class="sub">Mexa nos valores e veja quando você chega lá</span></div>
        ${S.goals.length ? `<select class="select" style="width:auto" id="simPick" aria-label="Escolher caixinha"><option value="">Simulação livre</option>${S.goals.map((x) => `<option value="${x.id}" ${g && g.id === x.id ? 'selected' : ''}>${x.emoji} ${esc(x.name)}</option>`).join('')}</select>` : ''}</div>
      <div class="sim">
        <div class="stack" style="gap:14px">
          <div class="field"><label for="sTarget">Valor da meta</label><div class="input-money"><input class="input" id="sTarget" type="number" min="0" step="50" value="${g ? g.target : 10000}"></div></div>
          <div class="field"><label for="sSaved">Já guardado</label><div class="input-money"><input class="input" id="sSaved" type="number" min="0" step="50" value="${g ? Math.round(g.saved) : 0}"></div></div>
          <div class="field"><label for="sMonthly">Aporte mensal: <span id="sMonthlyV"></span></label><input id="sMonthly" type="range" min="0" max="3000" step="10" value="${g ? g.monthly : 300}"></div>
          <div class="field"><label for="sRate">Rendimento ao ano: <span id="sRateV"></span></label><input id="sRate" type="range" min="0" max="15" step="0.5" value="${g ? g.rate : 10.5}"><span class="hint">0% = dinheiro parado · ~10,5% = CDB 100% do CDI (estimativa, antes do IR)</span></div>
          <div class="sim-result" id="simOut"></div>
        </div>
        <div>
          <div class="chart-wrap" id="simChart"></div>
          <div class="chart-legend" style="margin-top:8px"><span><i style="background:#3DBA85"></i>Saldo com rendimento</span><span><i style="background:#3E5C76"></i>Só aportes</span><span><i style="background:#D4553A"></i>Meta</span></div>
          <h4 class="display" style="font-size:1rem;margin:20px 0 10px">E se…</h4>
          <div id="simWhatIf" class="stack" style="gap:8px"></div>
          ${deliv > 100 ? `<div class="goal-eta" style="margin-top:12px">🍔 Você gasta em média <b>${brl0(deliv)}/mês</b> com alimentação fora. Cortando 30% e mandando para cá, são <b>+${brl0(deliv * 0.3)}/mês</b> na meta.</div>` : ''}
        </div>
      </div>
    </section>`;
  };
  function mountSimulator() {
    const el = $('#simulator'); if (!el) return;
    const ids = ['sTarget', 'sSaved', 'sMonthly', 'sRate'];
    const run = () => {
      const target = +$('#sTarget').value || 0, saved = +$('#sSaved').value || 0, monthly = +$('#sMonthly').value || 0, rate = +$('#sRate').value || 0;
      $('#sMonthlyV').textContent = brlRaw(monthly, 0);
      $('#sRateV').textContent = String(rate).replace('.', ',') + '%';
      const r = simulate(target, saved, monthly, rate);
      const d = addMonths(r.months === Infinity ? 0 : r.months);
      $('#simOut').innerHTML = `<span class="tag tag-light" style="align-self:flex-start">Você chega lá em</span>
        <div class="big">${r.months === Infinity ? '∞' : r.months === 0 ? 'JÁ!' : monthsTxt(r.months).toUpperCase()}</div>
        <div>${r.months === Infinity ? 'Com aporte zero e sem rendimento, a meta não anda. Coloque qualquer valor mensal.' : r.months === 0 ? 'Você já tem o valor da meta. 🎉' : `Previsão: <b>${monthYear(d)}</b>`}</div>
        ${r.months !== Infinity && r.months > 0 ? `<div class="row"><div>Você deposita<b>${brlRaw(monthly * r.months, 0)}</b></div><div>Rendimento<b style="color:#3DBA85">+${brlRaw(r.interest, 0)}</b></div><div>Saldo final<b>${brlRaw(r.final, 0)}</b></div></div>` : ''}`;
      const pts = r.months === Infinity ? Array.from({ length: 13 }, (_, i) => saved) : r.pts;
      $('#simChart').innerHTML = projChart(pts.length > 1 ? pts : [saved, saved], target, monthly);
      const base = r.months;
      $('#simWhatIf').innerHTML = [50, 100, 250].map((x) => {
        const r2 = simulate(target, saved, monthly + x, rate);
        const gain = base === Infinity ? null : base - r2.months;
        return `<div class="bill"><div class="tx-ico" style="background:#3DBA85">+</div><div class="bill-info"><b>Guardar +${brlRaw(x, 0)} por mês</b><span>${r2.months === 0 ? 'meta já batida' : `chega em ${monthsTxt(r2.months)}`}</span></div><div class="bill-amt pos">${gain == null ? '—' : gain > 0 ? `−${gain} ${gain === 1 ? 'mês' : 'meses'}` : '='}</div></div>`;
      }).join('');
    };
    ids.forEach((id) => $('#' + id).addEventListener('input', run));
    const pick = $('#simPick');
    if (pick) pick.addEventListener('change', () => { UI.simGoal = pick.value || '__free'; render(); $('#simulator').scrollIntoView({ block: 'start' }); });
    run();
  }

  V.calendario = () => {
    const ym = UI.ym, d0 = parseD(ym + '-01'), y = d0.getFullYear(), m = d0.getMonth(), dim = daysIn(y, m);
    const ev = {};
    const push = (day, e) => { (ev[day] = ev[day] || []).push(e); };
    for (const r of S.recurring) if (r.active !== false && !(r.start && ym < r.start)) push(Math.min(r.day, dim), { t: r.desc, cls: r.amount > 0 ? 'in' : '', v: r.amount });
    for (const c of S.cards) { const prevYm = shiftYm(ym, -1); const tot = invoiceTotal(c, prevYm); if (tot > 0) push(Math.min(c.dueDay, dim), { t: `Fatura ${c.name.split(' ')[0]}`, cls: 'card', v: -tot }); }
    for (const g of S.goals) if (g.autoDay && g.monthly) push(Math.min(g.autoDay, dim), { t: `🐷 ${g.name}`, cls: 'in', v: -g.monthly });
    const T = now();
    let cells = DOW.map((d) => `<div class="dow">${d}</div>`).join('');
    const first = d0.getDay();
    for (let i = 0; i < first; i++) cells += '<div class="day out"></div>';
    for (let d = 1; d <= dim; d++) {
      const isT = T.getFullYear() === y && T.getMonth() === m && T.getDate() === d;
      const es = ev[d] || [];
      cells += `<div class="day ${isT ? 'today' : ''}" title="${esc(es.map((e) => `${e.t}: ${brlRaw(e.v)}`).join('\n'))}"><span class="n">${d}</span>${es.slice(0, 3).map((e) => `<span class="ev ${e.cls}">${esc(e.t)}</span>`).join('')}${es.length > 3 ? `<span class="muted">+${es.length - 3}</span>` : ''}</div>`;
    }
    const fx = fixedMonthly();
    const inc = S.profile.salary || fx.in;
    const list = [...S.recurring].sort((a, b) => a.day - b.day);
    return `
    <div class="grid g-main">
      <section class="card">
        <div class="card-head"><div><h3>${ymLabel(ym)}</h3><span class="sub">Vencimentos, salário e aportes automáticos</span></div><div class="chart-legend"><span><i style="background:#D4553A"></i>Conta</span><span><i style="background:#3E5C76"></i>Fatura</span><span><i style="background:#3DBA85"></i>Entrada/caixinha</span></div></div>
        <div class="cal">${cells}</div>
      </section>
      <div class="stack">
        <section class="card kpi"><div class="k-label">Comprometido com contas fixas</div><div class="k-value">${brl(fx.out)}<span style="font-size:.5em">/mês</span></div><div class="k-foot">${inc ? `${pct(fx.out / inc)} da sua renda · ideal abaixo de 50%` : 'Informe sua renda em Ajustes'}</div></section>
        <section class="card">
          <div class="card-head"><div><h3>Recorrentes</h3><span class="sub">Lançados sozinhos todo mês, no dia certo</span></div><button class="btn btn-sm btn-lime" data-act="newRec">+ Nova</button></div>
          ${list.length ? list.map((r) => `<div class="bill" data-act="editRec" data-id="${r.id}" style="cursor:pointer;${r.active === false ? 'opacity:.45' : ''}"><div class="bill-date"><b>${pad(r.day)}</b><span>dia</span></div><div class="bill-info"><b style="display:flex;gap:6px;align-items:center">${catIco(r.cat)} ${esc(r.desc)}</b><span>${METHODS[r.method] ? METHODS[r.method].name : ''} · ${esc(r.cardId ? (S.cards.find((c) => c.id === r.cardId) || {}).name || '' : (S.accounts.find((a) => a.id === r.accountId) || {}).name || '')}${r.active === false ? ' · pausada' : ''}</span></div><div class="bill-amt ${r.amount > 0 ? 'pos' : ''}">${signed(r.amount)}</div></div>`).join('') : emptyBox('Cadastre aluguel, telefone, streaming… e esqueça.')}
        </section>
      </div>
    </div>`;
  };

  V.relatorios = () => {
    const ym = UI.ym, st = monthStats(ym), pvYm = shiftYm(ym, -1), pv = monthStats(pvYm);
    const T = now();
    const elapsed = isCurrent(ym) ? T.getDate() : daysIn(parseD(ym + '-01').getFullYear(), parseD(ym + '-01').getMonth());
    const daily = st.expense / Math.max(1, elapsed);
    const pj = projCat(ym), proj = pj.total, cur = isCurrent(ym);
    const biggest = st.txs.filter((t) => t.amount < 0 && !CATS[t.cat].system).sort((a, b) => a.amount - b.amount)[0];
    const merchants = {};
    st.txs.filter((t) => t.amount < 0 && !CATS[t.cat].system).forEach((t) => { const k = t.desc.replace(/\s*\(\d+\/\d+\)$/, '').replace(/\s*\*.*$/, '').trim(); merchants[k] = merchants[k] || { v: 0, n: 0, c: t.cat }; merchants[k].v -= t.amount; merchants[k].n++; });
    const topM = Object.entries(merchants).sort((a, b) => b[1].v - a[1].v).slice(0, 7);
    const methods = Object.entries(st.byMethod).sort((a, b) => b[1] - a[1]);
    const allCats = [...new Set([...Object.keys(st.byCat), ...Object.keys(pv.byCat)])].sort((a, b) => (st.byCat[b] || 0) - (st.byCat[a] || 0));
    const rows = []; for (let k = -5; k <= 0; k++) { const m = shiftYm(ym, k), s2 = monthStats(m); rows.push({ label: ymShort(m), a: s2.income, b: s2.expense }); }
    return `
    <div class="grid g-4">
      <div class="card kpi"><div class="k-label">Média por dia</div><div class="k-value">${brl(daily)}</div><div class="k-foot muted">${elapsed} dias considerados</div></div>
      <div class="card kpi"><div class="k-label">${isCurrent(ym) ? 'Projeção do mês' : 'Total do mês'}</div><div class="k-value">${brl0(proj)}</div><div class="k-foot">${pv.expense ? `${proj > pv.expense ? '▲' : '▼'} ${brl0(Math.abs(proj - pv.expense))} vs ${ymShort(pvYm)}` : ''}</div></div>
      <div class="card kpi"><div class="k-label">Transações</div><div class="k-value">${st.txs.length}</div><div class="k-foot muted">${st.txs.filter((t) => t.method === 'pix').length} via Pix · ${st.txs.filter((t) => t.method === 'credito').length} no crédito</div></div>
      <div class="card kpi"><div class="k-label">Maior gasto</div><div class="k-value">${biggest ? brl0(-biggest.amount) : '—'}</div><div class="k-foot">${biggest ? esc(biggest.desc) : ''}</div></div>
    </div>
    <div class="grid g-main" style="margin-top:20px">
      <section class="card">
        <div class="card-head"><div><h3>Categoria a categoria</h3><span class="sub">${ymLabel(ym)} vs ${ymLabel(pvYm)}</span></div></div>
        <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:.88rem;min-width:420px">
          <thead><tr style="text-align:left;font-size:.7rem;text-transform:uppercase;letter-spacing:.05em;color:#5B6B66"><th style="padding:8px 4px">Categoria</th><th style="text-align:right">${ymShort(pvYm)}</th><th style="text-align:right">${ymShort(ym)}</th><th style="text-align:right;padding-right:4px">${cur ? 'Tendência*' : 'Variação'}</th></tr></thead>
          <tbody>${allCats.map((c) => { const a = pv.byCat[c] || 0, b = st.byCat[c] || 0, bp = pj.byCat[c] || 0, d = a ? (bp - a) / a : null; return `<tr style="border-top:1px dashed rgba(11,61,51,.12)"><td style="padding:10px 4px;font-weight:600">${catIco(c)} ${esc(cat(c).name)}</td><td style="text-align:right">${brl0(a)}</td><td style="text-align:right;font-weight:700">${brl0(b)}</td><td style="text-align:right;padding-right:4px">${d == null ? '<span class="chip">novo</span>' : `<span class="chip" style="background:${d > 0.05 ? '#D4553A' : d < -0.05 ? '#3DBA85' : '#fff'};color:${d > 0.05 ? '#fff' : '#0B3D33'}">${d > 0 ? '▲' : '▼'} ${Math.abs(Math.round(d * 100))}%</span>`}</td></tr>`; }).join('')}</tbody>
        </table></div>${cur ? '<p class="muted" style="font-size:.74rem;margin-top:10px">* Tendência compara a projeção de fechamento do mês (ritmo atual + contas fixas que ainda vão cair) com o mês anterior.</p>' : ''}
      </section>
      <div class="stack">
        <section class="card"><div class="card-head"><h3>Onde mais gastei</h3></div>${topM.length ? hbars(topM.map(([k, o]) => ({ label: `${catIco(o.c)} ${esc(k)} <span class="muted">· ${o.n}x</span>`, value: o.v }))) : emptyBox('Sem gastos.')}</section>
        <section class="card cream"><div class="card-head"><h3>Por forma de pagamento</h3></div>${methods.length ? hbars(methods.map(([k, v]) => ({ label: `${methodIco(k)} ${(METHODS[k] || { name: k }).name}`, value: v }))) : emptyBox('Sem gastos.')}</section>
      </div>
    </div>
    <section class="card" style="margin-top:20px"><div class="card-head"><div><h3>Evolução</h3><span class="sub">6 meses até ${ymLabel(ym)}</span></div><div class="chart-legend"><span><i style="background:#3DBA85"></i>Entradas</span><span><i style="background:#D4553A"></i>Saídas</span></div></div><div class="chart-wrap">${barChart(rows, 5)}</div></section>`;
  };

  const COURSES = [
    { id: 'c1', title: 'Primeiros passos', color: '#D4553A', emoji: '🚀', lessons: [
      { id: 'l1', t: 'Pague-se primeiro', body: ['A maioria das pessoas tenta guardar o que sobra no fim do mês. O problema: quase nunca sobra. A ideia de “pagar-se primeiro” inverte a ordem: assim que o salário cai, uma parte vai direto para a sua caixinha, como se fosse uma conta obrigatória.', 'Comece pequeno. 5% da renda já cria o hábito; depois aumente 1 ponto por mês até chegar a 15 ou 20%.'], tip: 'No Finaxis, ative o aporte automático da caixinha para o dia seguinte ao salário.' },
      { id: 'l2', t: 'A regra 50/30/20', body: ['É um jeito simples de dividir a renda líquida: 50% para necessidades (moradia, mercado, contas, transporte), 30% para desejos (delivery, compras, lazer) e 20% para o futuro (reserva, metas, investimentos).', 'Ela não é lei. Se o aluguel come metade do salário, ajuste para 60/20/20, mas mantenha a parte do futuro sempre visível.'], tip: 'A aba Orçamentos compara seus gastos reais com essa divisão automaticamente.' },
      { id: 'l3', t: 'Reserva de emergência', body: ['A reserva é o dinheiro que impede uma emergência (demissão, problema de saúde, conserto do carro) de virar dívida. O alvo comum é de 3 a 6 meses dos seus gastos essenciais.', 'Ela precisa ficar num lugar seguro e com resgate rápido, como um CDB de liquidez diária ou o Tesouro Selic. Rentabilidade aqui é secundária.'], tip: 'Crie uma caixinha do tipo “reserva”: ela conta para o seu Finaxis Score.' },
    ] },
    { id: 'c2', title: 'Cartão sem sustos', color: '#3E5C76', emoji: '💳', lessons: [
      { id: 'l4', t: 'Como funciona a fatura', body: ['O cartão tem duas datas: fechamento e vencimento. Tudo o que você compra depois do fechamento só entra na fatura seguinte, e por isso comprar logo após o fechamento dá quase 40 dias até pagar.', 'Acompanhar a fatura aberta durante o mês evita a surpresa do “como gastei tudo isso?”.'], tip: 'Em Contas & cartões você vê a fatura atual e o limite usado em tempo real.' },
      { id: 'l5', t: 'Rotativo: o vilão', body: ['Pagar o mínimo da fatura joga o resto no crédito rotativo, uma das linhas de crédito mais caras do país, com juros que podem passar de 400% ao ano.', 'Se não der para pagar tudo, compare o parcelamento da fatura com um empréstimo pessoal mais barato. Qualquer opção costuma ser melhor que o rotativo.'], tip: 'Ative os lembretes de vencimento em Ajustes.' },
      { id: 'l6', t: 'Parcelar ou não?', body: ['Parcelar sem juros não é dinheiro grátis: cada parcela compromete a renda dos próximos meses. Somadas, várias parcelas pequenas viram uma conta fixa grande.', 'Regra prática: só parcele se a soma de todas as parcelas abertas couber em até 15% da sua renda mensal.'], tip: 'Ao lançar uma compra no crédito, use o campo de parcelas para ver o impacto nos meses seguintes.' },
    ] },
    { id: 'c3', title: 'Fazendo render', color: '#0B3D33', emoji: '📈', lessons: [
      { id: 'l7', t: 'Poupança, CDB ou Tesouro?', body: ['A poupança é simples, mas costuma render menos que alternativas igualmente seguras. CDBs que pagam 100% do CDI ou mais e o Tesouro Selic geralmente rendem mais, com garantia do FGC (no CDB) ou do Tesouro Nacional.', 'Fique atento ao Imposto de Renda, que é regressivo: quanto mais tempo o dinheiro fica aplicado, menor a alíquota.'], tip: 'O simulador de caixinhas permite comparar rendimentos: teste 6% x 10,5% ao ano.' },
      { id: 'l8', t: 'Juros compostos', body: ['Nos juros compostos, o rendimento de hoje também rende amanhã. No começo a diferença é pequena; com o tempo, a curva acelera.', 'Por isso começar cedo com pouco costuma valer mais do que começar tarde com muito.'], tip: 'No gráfico do simulador, a distância entre a linha cheia e a tracejada é o efeito dos juros.' },
      { id: 'l9', t: 'Metas SMART', body: ['Uma meta boa é específica, mensurável, atingível, relevante e tem prazo. “Juntar dinheiro” vira “juntar R$ 8.000 para a viagem ao Chile até julho”.', 'Com valor e prazo definidos, o aporte mensal necessário fica claro, e dá para acompanhar o progresso todo mês.'], tip: 'Cada caixinha do Finaxis já é uma meta SMART: valor, aporte e data prevista.' },
    ] },
  ];
  const CHALLENGES = [
    { id: 'ch1', ico: '🥡', t: 'Semana sem delivery', d: '7 dias sem pedir comida por app.', days: 7, xp: 150, check: (since) => !S.tx.some((t) => t.date >= since && /ifood|rappi|z[eé] delivery/i.test(t.desc)) },
    { id: 'ch2', ico: '🐷', t: 'Desafio das 52 semanas', d: 'Guarde R$ 1 na 1ª semana, R$ 2 na 2ª… e termine o ano com R$ 1.378.', days: 364, xp: 500 },
    { id: 'ch3', ico: '🛑', t: 'Fim de semana zero supérfluo', d: 'Sábado e domingo sem compras não essenciais.', days: 2, xp: 80 },
    { id: 'ch4', ico: '📺', t: 'Faxina de assinaturas', d: 'Revise e cancele pelo menos uma assinatura que você não usa.', days: 3, xp: 100 },
  ];

  V.aprender = () => {
    const tips = genTips(UI.ym);
    const lvl = Math.floor(S.learn.xp / 300) + 1, inLvl = S.learn.xp % 300;
    const allLessons = COURSES.flatMap((c) => c.lessons);
    return `
    <div class="grid g-main">
      <section class="card">
        <div class="card-head"><div><h3>Dicas para você</h3><span class="sub">Geradas a partir dos seus gastos de ${ymLabel(UI.ym).toLowerCase()}</span></div><span class="chip">${tips.length} dicas</span></div>
        ${tips.map((t) => `<div class="tip ${t.kind}"><div class="t-ico">${uiIco(t.ico)}</div><div><b>${esc(t.title)}</b><p>${esc(t.text)}</p>${t.save ? `<span class="chip t-save chip-pos">Potencial: ${brl0(t.save)}/mês</span>` : ''}</div></div>`).join('') || emptyBox('Tudo em ordem por aqui! 🎉')}
      </section>
      <div class="stack">
        <section class="score-card" style="flex-direction:row">
          ${ring(inLvl / 300, 110, '#1E8A5F', '#E6EEEB', `<text x="60" y="58" text-anchor="middle" font-family="IBM Plex Sans" font-size="10" font-weight="600" fill="#5B6B66">Nível</text><text x="60" y="82" text-anchor="middle" font-family="IBM Plex Sans, sans-serif" font-size="30" font-weight="600" fill="#10231E">${lvl}</text>`)}
          <div><h3>${S.learn.xp} XP</h3><p>${S.learn.done.length}/${allLessons.length} aulas concluídas. Faltam ${300 - inLvl} XP para o nível ${lvl + 1}.</p></div>
        </section>
        <section class="card cream">
          <div class="card-head"><h3>Desafios</h3></div>
          ${CHALLENGES.map((ch) => {
            const st = S.learn.challenges[ch.id];
            let body;
            if (!st) body = `<button class="btn btn-sm btn-lime" data-act="joinCh" data-id="${ch.id}">Aceitar</button>`;
            else {
              const days = Math.floor((now() - parseD(st.joined)) / 86400000);
              const failed = ch.check && !ch.check(st.joined);
              const done = st.done || (!failed && days >= ch.days);
              const p = done ? 1 : clamp(days / ch.days, 0, 1);
              body = failed ? `<span class="chip" style="background:#D4553A;color:#fff">Quebrou 😅</span> <button class="link" data-act="joinCh" data-id="${ch.id}">Recomeçar</button>` : done ? `<span class="chip chip-pos">Concluído ✓</span>` : `<div class="progress" style="height:9px"><i style="width:${Math.max(4, p * 100)}%"></i></div><span class="muted" style="font-size:.72rem">${days} de ${ch.days} dias</span> ${ch.days <= 3 ? `<button class="link" data-act="doneCh" data-id="${ch.id}">Marcar como feito</button>` : ''}`;
            }
            return `<div class="challenge"><div class="c-ico">${uiIco(ch.ico)}</div><div class="c-main"><b>${ch.t}</b><p>${ch.d}</p>${body}</div><span class="xp">+${ch.xp}</span></div>`;
          }).join('')}
        </section>
      </div>
    </div>
    <h3 class="display" style="font-size:1.4rem;margin:30px 0 14px">Trilhas de educação financeira</h3>
    <div class="grid g-3">${COURSES.map((c) => { const done = c.lessons.filter((l) => S.learn.done.includes(l.id)).length; return `<article class="course"><div class="course-top" style="background:${c.color}"><span style="font-size:2rem">${c.emoji}</span><div><span class="tag tag-light">${done}/${c.lessons.length} aulas</span><h4 style="margin-top:8px">${c.title}</h4></div></div><div class="course-body">${c.lessons.map((l) => `<button class="lesson ${S.learn.done.includes(l.id) ? 'done' : ''}" data-act="openLesson" data-id="${l.id}"><span class="ck">${S.learn.done.includes(l.id) ? '✓' : ''}</span>${l.t}<span class="muted" style="margin-left:auto;font-size:.72rem">3 min</span></button>`).join('')}</div></article>`; }).join('')}</div>`;
  };

  V.ajustes = () => `
    <div class="grid g-2">
      ${API.online ? `<section class="card span-2" style="display:flex;gap:18px;align-items:center;flex-wrap:wrap">
        
        <div style="flex:1;min-width:200px"><h3 class="display" style="font-size:1.2rem">${esc(API.user.name)}</h3><p class="muted" style="font-size:.86rem;margin-top:4px">${esc(API.user.email)} · Open Finance: ${API.cfg.provider === 'pluggy' ? 'Pluggy' + (API.cfg.webhooks ? ' com webhooks' : ' (sincroniza ao abrir e periodicamente)') : 'modo demonstração'}</p></div>
        <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn btn-sm" data-act="logout">Sair</button><button class="btn btn-sm btn-ghost neg" data-act="deleteAccount">Excluir minha conta</button></div>
      </section>` : ''}
      <section class="card">
        <div class="card-head"><h3>Seu perfil</h3></div>
        <div class="form-grid">
          <div class="field full"><label for="pName">Como quer ser chamado(a)?</label><input class="input" id="pName" data-profile="name" value="${esc(S.profile.name)}"></div>
          <div class="field"><label for="pSalary">Salário líquido mensal</label><div class="input-money"><input class="input" id="pSalary" type="number" min="0" step="50" data-profile="salary" value="${S.profile.salary || ''}"></div><span class="hint">Usado na regra 50/30/20 e nas dicas</span></div>
          <div class="field"><label for="pPay">Dia do pagamento</label><input class="input" id="pPay" type="number" min="1" max="31" data-profile="payday" value="${S.profile.payday || ''}"></div>
        </div>
      </section>
      <section class="card">
        <div class="card-head"><h3>Preferências</h3></div>
        <div class="setting"><div><b>Transações em tempo real</b><span>Recebe novas compras e Pix das contas conectadas</span></div><label class="toggle"><input type="checkbox" data-setting="live" ${S.settings.live ? 'checked' : ''}><span></span></label></div>
        <div class="setting"><div><b>Esconder valores</b><span>Modo discreto para usar em público</span></div><label class="toggle"><input type="checkbox" data-setting="hide" ${S.settings.hide ? 'checked' : ''}><span></span></label></div>
        <div class="setting"><div><b>Lembretes de vencimento</b><span>Aviso 3 dias antes de cada conta e fatura</span></div><label class="toggle"><input type="checkbox" data-setting="reminders" ${S.settings.reminders ? 'checked' : ''}><span></span></label></div>
      </section>
      <section class="card cream">
        <div class="card-head"><h3>Seus dados</h3></div>
        <p class="muted" style="font-size:.86rem;line-height:1.5;margin-bottom:14px">Seus dados ficam salvos na sua conta e sincronizados entre dispositivos.${Object.keys(S.learned).length ? ` O app já aprendeu ${Object.keys(S.learned).length} regra(s) de categoria com você.` : ''}</p>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn btn-sm" data-act="exportCsv">⬇ Exportar CSV</button>
          <button class="btn btn-sm" data-act="exportJson">⬇ Backup (JSON)</button>
          <button class="btn btn-sm btn-red" data-act="startEmpty">Começar do zero</button>
        </div>
      </section>
      <section class="card">
        <div class="card-head"><h3>Segurança e Open Finance</h3></div>
        <ul style="font-size:.86rem;line-height:1.6;padding-left:18px">
          <li>O Finaxis nunca pede a senha do seu banco: a autorização é feita no app da instituição.</li>
          <li>O consentimento tem prazo e pode ser revogado a qualquer momento.</li>
          <li>Acesso somente leitura: o app não faz pagamentos nem transferências.</li>
        </ul>
      </section>
    </div>`;

  /* ----------------------------------------------------------- render */
  function render() {
    const r = UI.route;
    $('#view').innerHTML = `<div class="view">${(V[r] || V.painel)()}</div>`;
    $('#viewTitle').innerHTML = TITLES[r] || '';
    const h = now().getHours();
    $('#hello').textContent = `${h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'}, ${S.profile.name} 👋`;
    $('#monthLabel').textContent = ymLabel(UI.ym);
    $('#monthSwitch').style.display = ['contas', 'caixinhas', 'aprender', 'ajustes'].includes(r) ? 'none' : '';
    $$('[data-route]').forEach((a) => a.classList.toggle('active', a.dataset.route === r));
    const sd = $('#syncDot');
    sd.classList.toggle('off', !S.settings.live);
    sd.lastElementChild.textContent = S.settings.live ? 'Ao vivo' : 'Sincronização pausada';
    if (r === 'transacoes') renderTxList();
    if (r === 'caixinhas') mountSimulator();
    UI.fresh.clear();
  }

  function navHtml(cls) {
    return ROUTES.map((x) => `<a href="#/${x.id}" data-route="${x.id}"><span class="ico">${icon(x.ico)}</span>${x.name}</a>`).join('');
  }
  function buildNav() {
    $('#sideNav').innerHTML = `<span class="label">Menu</span>${navHtml()}`;
    const b = (id) => { const x = ROUTES.find((r) => r.id === id); return `<a href="#/${id}" data-route="${id}"><span class="ico">${icon(x.ico)}</span>${x.name.split(' ')[0]}</a>`; };
    $('#bottomNav').innerHTML = `${b('painel')}${b('transacoes')}<button class="fab" data-act="addTx" aria-label="Novo lançamento">+</button>${b('caixinhas')}<a href="#" data-act="more"><span class="ico">${icon('menu')}</span>Mais</a>`;
  }
  function route() {
    const id = (location.hash.match(/^#\/(\w+)/) || [])[1];
    UI.route = ROUTES.some((r) => r.id === id) ? id : 'painel';
    closeModal();
    render();
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  const go = (id) => { if (location.hash === '#/' + id) route(); else location.hash = '#/' + id; };

  /* -------------------------------------------------------- modal/toast */
  function openModal({ title, body, wide, foot = '', onMount }) {
    const root = $('#modalRoot');
    root.innerHTML = `<div class="modal-back" data-close><div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title.replace(/<[^>]+>/g, ''))}"><div class="modal-head"><h3>${title}</h3><button class="icon-btn" data-close aria-label="Fechar">✕</button></div><div class="modal-body">${body}</div>${foot ? `<div class="modal-foot">${foot}</div>` : ''}</div></div>`;
    const m = $('.modal', root);
    root.firstElementChild.addEventListener('click', (e) => { if (e.target.hasAttribute('data-close') || e.target.closest('.modal-head [data-close]')) closeModal(); });
    if (onMount) onMount(m);
    const f = $('input:not([type=hidden]), select, textarea, button.btn', m); if (f && matchMedia('(min-width: 769px)').matches) f.focus();
    return m;
  }
  function closeModal() { $('#modalRoot').innerHTML = ''; }
  function toast(html, ico = '✨', ms = 4200) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = `<span class="t-ico">${ico}</span><div>${html}</div>`;
    $('#toasts').appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 320); }, ms);
  }
  const commit = (rerender = true) => { save(); if (rerender) render(); };

  /* ---------------------------------------------------------- formulários */
  function srcOptions(sel, onlyAccounts) {
    const a = S.accounts.map((x) => `<option value="a:${x.id}" ${sel === 'a:' + x.id ? 'selected' : ''}>🏦 ${esc(x.name)}</option>`).join('');
    const c = onlyAccounts ? '' : S.cards.map((x) => `<option value="c:${x.id}" ${sel === 'c:' + x.id ? 'selected' : ''}>💳 ${esc(x.name)}</option>`).join('');
    return a + c;
  }
  function catPicker(sel, income) {
    return (income ? INC_CATS : EXP_CATS).map((k) => `<button type="button" data-cat="${k}" class="${k === sel ? 'on' : ''}"><span>${catIco(k)}</span>${esc(cat(k).name)}</button>`).join('');
  }

  function txModal(t) {
    const isNew = !t;
    const tx = t || { desc: '', amount: -0, date: todayStr(), method: 'pix', cat: 'outros', accountId: S.accounts[0] && S.accounts[0].id };
    let income = tx.amount > 0;
    let picked = !isNew;
    let curCat = tx.cat;
    const sys = CATS[tx.cat] && CATS[tx.cat].system;
    const body = `
      <div class="seg red" style="margin-bottom:16px" id="tType"><button type="button" data-v="out" class="${!income ? 'on' : ''}">Despesa</button><button type="button" data-v="in" class="${income ? 'on' : ''}">Receita</button></div>
      <div class="form-grid">
        <div class="field"><label for="tAmt">Valor</label><div class="input-money"><input class="input" id="tAmt" type="number" step="0.01" min="0" value="${tx.amount ? Math.abs(tx.amount) : ''}" placeholder="0,00" required></div></div>
        <div class="field"><label for="tDate">Data</label><input class="input" id="tDate" type="date" value="${tx.date}"></div>
        <div class="field full"><label for="tDesc">Descrição</label><input class="input" id="tDesc" value="${esc(tx.desc)}" placeholder="Ex.: iFood, Uber, Mercado Livre…" autocomplete="off"><span class="hint" id="tHint"></span></div>
        <div class="field"><label for="tMethod">Forma</label><select class="select" id="tMethod">${Object.entries(METHODS).map(([k, m]) => `<option value="${k}" ${tx.method === k ? 'selected' : ''}>${m.name}</option>`).join('')}</select></div>
        <div class="field"><label for="tSrc">Conta / cartão</label><select class="select" id="tSrc">${srcOptions(tx.cardId ? 'c:' + tx.cardId : 'a:' + tx.accountId)}</select></div>
        ${isNew ? `<div class="field" id="tInstWrap" style="display:none"><label for="tInst">Parcelas</label><select class="select" id="tInst">${Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}">${i + 1}x</option>`).join('')}</select><span class="hint" id="tInstHint"></span></div>` : ''}
        ${sys ? `<div class="field full"><span class="chip">${catIco(tx.cat)} ${cat(tx.cat).name} (gerado pelo sistema)</span></div>` : `<div class="field full"><label>Categoria</label><div class="cat-pick" id="tCats">${catPicker(curCat, income)}</div></div>`}
        ${!isNew && !sys ? `<label class="field full" style="flex-direction:row;align-items:center;gap:10px;font-size:.85rem"><input type="checkbox" id="tLearn" checked> Usar essa categoria sempre para “${esc(normDesc(tx.desc))}”</label>` : ''}
      </div>`;
    const foot = `${!isNew ? '<button class="btn btn-sm btn-ghost neg" data-act-m="del" style="margin-right:auto">🗑 Excluir</button>' : ''}<button class="btn btn-sm" data-close>Cancelar</button><button class="btn btn-lime" data-act-m="save">${isNew ? 'Adicionar' : 'Salvar'}</button>`;
    openModal({ title: isNew ? 'Novo lançamento' : 'Editar transação', body, foot, onMount: (m) => {
      const setCats = () => { const box = $('#tCats', m); if (box) box.innerHTML = catPicker(curCat, income); };
      const hint = () => {
        const d = $('#tDesc', m).value;
        if (!picked && !sys) { const g = autoCat(d, income ? 1 : -1); if (g !== curCat) { curCat = g; setCats(); } }
        $('#tHint', m).textContent = d && !sys ? `Categoria ${picked ? 'escolhida' : 'sugerida automaticamente'}: ${cat(curCat).name}` : '';
      };
      const instUpd = () => {
        const w = $('#tInstWrap', m); if (!w) return;
        w.style.display = $('#tMethod', m).value === 'credito' && !income ? '' : 'none';
        const n = +$('#tInst', m).value, v = +$('#tAmt', m).value || 0;
        $('#tInstHint', m).textContent = n > 1 ? `${n}x de ${brlRaw(v / n)} nas próximas faturas` : '';
      };
      $('#tType', m).addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; income = b.dataset.v === 'in'; $$('#tType button', m).forEach((x) => x.classList.toggle('on', x === b)); if (!sys) { curCat = income ? 'pixrecebido' : 'outros'; picked = false; setCats(); hint(); } instUpd(); });
      m.addEventListener('click', (e) => { const b = e.target.closest('[data-cat]'); if (!b) return; curCat = b.dataset.cat; picked = true; setCats(); hint(); });
      $('#tDesc', m).addEventListener('input', hint);
      $('#tMethod', m).addEventListener('change', () => {
        const meth = $('#tMethod', m).value, src = $('#tSrc', m);
        if (meth === 'credito' && S.cards[0] && !src.value.startsWith('c:')) src.value = 'c:' + S.cards[0].id;
        if (meth !== 'credito' && src.value.startsWith('c:')) src.value = 'a:' + (meth === 'dinheiro' ? (S.accounts.find((a) => a.kind === 'dinheiro') || S.accounts[0]).id : S.accounts[0].id);
        instUpd();
      });
      ['#tAmt', '#tInst'].forEach((s) => { const el = $(s, m); if (el) el.addEventListener('input', instUpd); });
      instUpd(); hint();
      m.addEventListener('click', (e) => {
        const a = e.target.closest('[data-act-m]'); if (!a) return;
        if (a.dataset.actM === 'del') { if (confirm('Excluir esta transação?')) { S.tx = S.tx.filter((x) => x.id !== t.id); if (t.goalId) { const g = S.goals.find((x) => x.id === t.goalId); if (g) g.saved = Math.max(0, g.saved + t.amount); } closeModal(); commit(); toast('Transação excluída', '🗑'); } return; }
        const v = Math.abs(+$('#tAmt', m).value);
        if (!v) { $('#tAmt', m).focus(); $('#tAmt', m).style.borderColor = '#D4553A'; return; }
        const desc = $('#tDesc', m).value.trim() || cat(curCat).name;
        const [k, id] = $('#tSrc', m).value.split(':');
        const base = { desc, amount: income ? v : -v, date: $('#tDate', m).value || todayStr(), method: $('#tMethod', m).value, cat: sys ? tx.cat : curCat, accountId: k === 'a' ? id : undefined, cardId: k === 'c' ? id : undefined };
        if (isNew) {
          const n = $('#tInst', m) && $('#tInstWrap', m).style.display !== 'none' ? +$('#tInst', m).value : 1;
          if (n > 1) {
            const d = parseD(base.date);
            const per = Math.round(base.amount / n * 100) / 100;
            for (let i = 0; i < n; i++) { const di = new Date(d.getFullYear(), d.getMonth() + i, Math.min(d.getDate(), daysIn(d.getFullYear(), d.getMonth() + i))); const amt = i === n - 1 ? Math.round((base.amount - per * (n - 1)) * 100) / 100 : per; const tt = { ...base, id: uid(), ts: Date.now(), source: 'manual', amount: amt, desc: `${desc} (${i + 1}/${n})`, date: ymd(di) }; S.tx.push(tt); UI.fresh.add(tt.id); }
          } else { const tt = { ...base, id: uid(), ts: Date.now(), source: 'manual' }; S.tx.push(tt); UI.fresh.add(tt.id); }
          if (picked && autoCat(desc, base.amount) !== curCat && !sys) S.learned[normDesc(desc)] = curCat;
          closeModal(); commit(); toast(`<b>${esc(desc)}</b> lançado em ${cat(base.cat).name}`, '✅');
          budgetCheck(base.cat);
        } else {
          Object.assign(t, base);
          const learn = $('#tLearn', m);
          if (learn && learn.checked && !sys) {
            const key = normDesc(desc); S.learned[key] = curCat;
            let n = 0; S.tx.forEach((x) => { if (x !== t && normDesc(x.desc) === key && x.cat !== curCat && !cat(x.cat).system) { x.cat = curCat; n++; } });
            if (n) toast(`Recategorizei mais <b>${n}</b> transações iguais`, '🧠');
          }
          closeModal(); commit();
        }
      });
    } });
  }

  function budgetCheck(c) {
    const lim = S.budgets[c]; if (!lim) return;
    const v = monthStats(ymOf(now())).byCat[c] || 0;
    if (v > lim) toast(`Orçamento de <b>${cat(c).name}</b> estourado: ${brl0(v)} de ${brl0(lim)}`, '🚨', 6000);
    else if (v > lim * 0.8) toast(`Atenção: você já usou <b>${pct(v / lim)}</b> do orçamento de ${cat(c).name}`, '⚠️', 6000);
  }

  function goalModal(g) {
    const isNew = !g;
    const x = g || { name: '', emoji: '🎯', target: '', saved: 0, monthly: 200, rate: 10.5, color: '#D4553A', autoDay: Math.min(28, (S.profile.payday || 5) + 1), accountId: S.accounts[0].id };
    const EM = ['✈️', '🏠', '🚗', '🎮', '💍', '🛟', '🎓', '💻', '📱', '🏖️', '🐶', '🎯'];
    const COLORS = ['#D4553A', '#3DBA85', '#3E5C76', '#0B3D33', '#E6EEEB'];
    const body = `<div class="form-grid">
      <div class="field full"><label for="gName">Nome da caixinha</label><input class="input" id="gName" value="${esc(x.name)}" placeholder="Ex.: Viagem para o Chile"></div>
      <div class="field full"><label>Ícone</label><div class="cat-pick" id="gEm" style="grid-template-columns:repeat(auto-fill,minmax(44px,1fr))">${EM.map((e) => `<button type="button" data-em="${e}" class="${e === x.emoji ? 'on' : ''}"><span>${e}</span></button>`).join('')}</div></div>
      <div class="field full"><label>Cor</label><div style="display:flex;gap:8px;flex-wrap:wrap" id="gCol">${COLORS.map((c) => `<button type="button" data-col="${c}" aria-label="Cor ${c}" style="width:34px;height:34px;border-radius:50%;background:${c};border:2px solid #0B3D33;${c === x.color ? 'box-shadow:0 0 0 3px #F3F5F4,0 0 0 5px #0B3D33' : ''}"></button>`).join('')}</div></div>
      <div class="field"><label for="gTarget">Valor da meta</label><div class="input-money"><input class="input" id="gTarget" type="number" min="1" step="50" value="${x.target}"></div></div>
      <div class="field"><label for="gSaved">Já tenho guardado</label><div class="input-money"><input class="input" id="gSaved" type="number" min="0" step="50" value="${Math.round(x.saved)}" ${isNew ? '' : 'disabled'}></div>${isNew ? '' : '<span class="hint">Use Guardar/Resgatar para movimentar</span>'}</div>
      <div class="field"><label for="gMonthly">Aporte mensal</label><div class="input-money"><input class="input" id="gMonthly" type="number" min="0" step="10" value="${x.monthly}"></div></div>
      <div class="field"><label for="gRate">Rendimento (% ao ano)</label><input class="input" id="gRate" type="number" min="0" max="30" step="0.5" value="${x.rate}"></div>
      <label class="field" style="flex-direction:row;align-items:center;gap:10px;font-size:.85rem"><input type="checkbox" id="gAuto" ${x.autoDay ? 'checked' : ''}> Aporte automático no dia</label>
      <div class="field"><input class="input" id="gDay" type="number" min="1" max="28" value="${x.autoDay || Math.min(28, (S.profile.payday || 5) + 1)}" aria-label="Dia do aporte"></div>
      <label class="field full" style="flex-direction:row;align-items:center;gap:10px;font-size:.85rem"><input type="checkbox" id="gRes" ${x.kind === 'reserva' ? 'checked' : ''}> Esta é minha reserva de emergência</label>
      <div class="goal-eta full" id="gPrev"></div>
    </div>`;
    const foot = `${!isNew ? '<button class="btn btn-sm btn-ghost neg" data-act-m="del" style="margin-right:auto">🗑 Excluir</button>' : ''}<button class="btn btn-sm" data-close>Cancelar</button><button class="btn btn-lime" data-act-m="save">${isNew ? 'Criar caixinha' : 'Salvar'}</button>`;
    let em = x.emoji, col = x.color;
    openModal({ title: isNew ? 'Nova caixinha' : 'Editar caixinha', body, foot, onMount: (m) => {
      const prev = () => { const r = simulate(+$('#gTarget', m).value || 0, +$('#gSaved', m).value || 0, +$('#gMonthly', m).value || 0, +$('#gRate', m).value || 0); $('#gPrev', m).innerHTML = (+$('#gTarget', m).value) ? (r.months === Infinity ? 'Defina um aporte mensal para ver a previsão.' : `📅 Previsão: <b>${monthsTxt(r.months)}</b> (${monthYear(addMonths(r.months))})${r.interest > 1 ? `, com <b>${brlRaw(r.interest, 0)}</b> de rendimento` : ''}.`) : 'Preencha o valor da meta para ver a previsão.'; };
      $$('input', m).forEach((i) => i.addEventListener('input', prev)); prev();
      $('#gEm', m).addEventListener('click', (e) => { const b = e.target.closest('[data-em]'); if (!b) return; em = b.dataset.em; $$('#gEm button', m).forEach((z) => z.classList.toggle('on', z === b)); });
      $('#gCol', m).addEventListener('click', (e) => { const b = e.target.closest('[data-col]'); if (!b) return; col = b.dataset.col; $$('#gCol button', m).forEach((z) => { z.style.boxShadow = z === b ? '0 0 0 3px #F3F5F4,0 0 0 5px #0B3D33' : ''; }); });
      m.addEventListener('click', (e) => {
        const a = e.target.closest('[data-act-m]'); if (!a) return;
        if (a.dataset.actM === 'del') { if (confirm(`Excluir a caixinha “${g.name}”? O saldo de ${brlRaw(g.saved)} volta para a conta.`)) { if (g.saved > 0) S.tx.push({ id: uid(), ts: Date.now(), date: todayStr(), desc: `Resgate · ${g.name}`, amount: g.saved, cat: 'caixinha', method: 'ted', accountId: g.accountId || S.accounts[0].id, goalId: g.id, source: 'manual' }); S.goals = S.goals.filter((z) => z !== g); closeModal(); commit(); } return; }
        const name = $('#gName', m).value.trim(), target = +$('#gTarget', m).value;
        if (!name) { $('#gName', m).focus(); return; } if (!target) { $('#gTarget', m).focus(); return; }
        const o = g || { id: uid(), saved: +$('#gSaved', m).value || 0, accountId: S.accounts[0].id };
        Object.assign(o, { name, emoji: em, color: col, target, monthly: +$('#gMonthly', m).value || 0, rate: +$('#gRate', m).value || 0, autoDay: $('#gAuto', m).checked ? clamp(+$('#gDay', m).value || 1, 1, 28) : null, kind: $('#gRes', m).checked ? 'reserva' : undefined });
        if (isNew || !o.start) { const T = now(); o.start = o.autoDay && o.autoDay < T.getDate() ? shiftYm(ymOf(T), 1) : ymOf(T); }
        if (isNew) S.goals.push(o);
        UI.simGoal = o.id;
        closeModal(); commit(); toast(`Caixinha <b>${esc(name)}</b> ${isNew ? 'criada' : 'atualizada'}!`, em);
      });
    } });
  }

  function goalMoveModal(g, dir) {
    const body = `<div class="field"><label for="mvAmt">${dir > 0 ? 'Quanto guardar agora?' : 'Quanto resgatar?'}</label><div class="input-money"><input class="input" id="mvAmt" type="number" min="0" step="10" value="${dir > 0 ? g.monthly || 100 : ''}"></div>${dir < 0 ? `<span class="hint">Disponível: ${brlRaw(g.saved)}</span>` : ''}</div>
      <div class="field" style="margin-top:14px"><label for="mvAcc">${dir > 0 ? 'Sair de' : 'Voltar para'}</label><select class="select" id="mvAcc">${srcOptions('a:' + (g.accountId || S.accounts[0].id), true)}</select></div>
      ${dir > 0 ? '<div class="field" style="margin-top:14px"><label>Atalhos</label><div style="display:flex;gap:8px;flex-wrap:wrap" id="mvQuick">' + [50, 100, 200, 500].map((v) => `<button type="button" class="btn btn-sm" data-v="${v}">+${v}</button>`).join('') + '</div></div>' : ''}`;
    openModal({ title: `${g.emoji} ${dir > 0 ? 'Guardar em' : 'Resgatar de'} ${esc(g.name)}`, body, foot: `<button class="btn btn-sm" data-close>Cancelar</button><button class="btn btn-lime" id="mvOk">Confirmar</button>`, onMount: (m) => {
      const q = $('#mvQuick', m); if (q) q.addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (b) $('#mvAmt', m).value = b.dataset.v; });
      $('#mvOk', m).addEventListener('click', () => {
        let v = Math.abs(+$('#mvAmt', m).value); if (!v) return;
        if (dir < 0) v = Math.min(v, g.saved);
        const id = $('#mvAcc', m).value.split(':')[1];
        S.tx.push({ id: uid(), ts: Date.now(), date: todayStr(), desc: `${dir > 0 ? 'Caixinha' : 'Resgate'} · ${g.name}`, amount: -dir * v, cat: 'caixinha', method: 'ted', accountId: id, goalId: g.id, source: 'manual' });
        const before = g.saved; g.saved += dir * v;
        closeModal(); commit();
        if (before < g.target && g.saved >= g.target) toast(`🎉 <b>Meta batida!</b> ${esc(g.name)} chegou a ${brl0(g.saved)}.`, '🏆', 7000);
        else toast(`${dir > 0 ? 'Guardado' : 'Resgatado'}: <b>${brlRaw(v)}</b> ${dir > 0 ? 'em' : 'de'} ${esc(g.name)}`, g.emoji);
      });
    } });
  }

  function recModal(r) {
    const isNew = !r;
    const x = r || { desc: '', amount: -0, cat: 'contas', day: 10, method: 'boleto', accountId: S.accounts[0].id };
    let income = x.amount > 0;
    const body = `<div class="seg red" style="margin-bottom:16px" id="rType"><button type="button" data-v="out" class="${!income ? 'on' : ''}">Conta a pagar</button><button type="button" data-v="in" class="${income ? 'on' : ''}">Receita fixa</button></div>
      <div class="form-grid">
        <div class="field full"><label for="rDesc">Descrição</label><input class="input" id="rDesc" value="${esc(x.desc)}" placeholder="Ex.: Telefone, aluguel, academia"></div>
        <div class="field"><label for="rAmt">Valor</label><div class="input-money"><input class="input" id="rAmt" type="number" min="0" step="0.01" value="${x.amount ? Math.abs(x.amount) : ''}"></div></div>
        <div class="field"><label for="rDay">Todo dia</label><input class="input" id="rDay" type="number" min="1" max="31" value="${x.day}"></div>
        <div class="field"><label for="rCat">Categoria</label><select class="select" id="rCat">${[...EXP_CATS, ...INC_CATS].map((k) => `<option value="${k}" ${x.cat === k ? 'selected' : ''}>${cat(k).name}</option>`).join('')}</select></div>
        <div class="field"><label for="rMethod">Forma</label><select class="select" id="rMethod">${Object.entries(METHODS).map(([k, m]) => `<option value="${k}" ${x.method === k ? 'selected' : ''}>${m.name}</option>`).join('')}</select></div>
        <div class="field full"><label for="rSrc">Conta / cartão</label><select class="select" id="rSrc">${srcOptions(x.cardId ? 'c:' + x.cardId : 'a:' + x.accountId)}</select></div>
        ${!isNew ? `<label class="field full" style="flex-direction:row;align-items:center;gap:10px;font-size:.85rem"><input type="checkbox" id="rActive" ${x.active !== false ? 'checked' : ''}> Ativa (lançar automaticamente todo mês)</label>` : ''}
      </div>`;
    const foot = `${!isNew ? '<button class="btn btn-sm btn-ghost neg" data-act-m="del" style="margin-right:auto">🗑 Excluir</button>' : ''}<button class="btn btn-sm" data-close>Cancelar</button><button class="btn btn-lime" data-act-m="save">Salvar</button>`;
    openModal({ title: isNew ? 'Nova conta fixa' : 'Editar conta fixa', body, foot, onMount: (m) => {
      $('#rType', m).addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; income = b.dataset.v === 'in'; $$('#rType button', m).forEach((z) => z.classList.toggle('on', z === b)); $('#rCat', m).value = income ? 'salario' : 'contas'; });
      $('#rDesc', m).addEventListener('input', () => { const g = autoCat($('#rDesc', m).value, income ? 1 : -1); if (g !== 'outros' && g !== 'pixrecebido') $('#rCat', m).value = g; });
      m.addEventListener('click', (e) => {
        const a = e.target.closest('[data-act-m]'); if (!a) return;
        if (a.dataset.actM === 'del') { if (confirm('Excluir esta conta fixa? Lançamentos passados continuam no histórico.')) { S.recurring = S.recurring.filter((z) => z !== r); closeModal(); commit(); } return; }
        const desc = $('#rDesc', m).value.trim(), v = Math.abs(+$('#rAmt', m).value);
        if (!desc) { $('#rDesc', m).focus(); return; } if (!v) { $('#rAmt', m).focus(); return; }
        const [k, id] = $('#rSrc', m).value.split(':');
        const o = r || { id: uid() };
        Object.assign(o, { desc, amount: income ? v : -v, day: clamp(+$('#rDay', m).value || 1, 1, 31), cat: $('#rCat', m).value, method: $('#rMethod', m).value, accountId: k === 'a' ? id : undefined, cardId: k === 'c' ? id : undefined });
        if (!isNew) o.active = $('#rActive', m).checked;
        if (isNew) { const T = now(); o.start = o.day < T.getDate() ? shiftYm(ymOf(T), 1) : ymOf(T); S.recurring.push(o); }
        postRecurring(S);
        closeModal(); commit(); toast(`<b>${esc(desc)}</b> será lançada todo dia ${o.day}`, '📅');
      });
    } });
  }

  function budgetsModal(sugg) {
    const body = `<p class="muted" style="font-size:.85rem;margin-bottom:14px">${sugg ? 'Sugestão baseada na média dos últimos 3 meses, com 10% de economia. Ajuste como quiser.' : 'Deixe em branco para não limitar a categoria.'}</p>
      <div class="form-grid">${EXP_CATS.map((c) => `<div class="field"><label for="b_${c}" style="display:flex;gap:6px;align-items:center">${catIco(c)} ${cat(c).name}</label><div class="input-money"><input class="input" id="b_${c}" data-b="${c}" type="number" min="0" step="10" value="${sugg ? (sugg[c] || '') : (S.budgets[c] || '')}"></div></div>`).join('')}</div>`;
    openModal({ title: 'Limites mensais', body, wide: true, foot: `<button class="btn btn-sm" data-close>Cancelar</button><button class="btn btn-lime" id="bOk">Salvar limites</button>`, onMount: (m) => {
      $('#bOk', m).addEventListener('click', () => { const b = {}; $$('[data-b]', m).forEach((i) => { const v = +i.value; if (v > 0) b[i.dataset.b] = v; }); S.budgets = b; closeModal(); commit(); toast('Orçamentos atualizados', '🎯'); });
    } });
  }

  function cardModal(c) {
    const isNew = !c;
    const x = c || { name: '', bank: 'nubank', brand: 'Mastercard', last4: '', limit: 3000, dueDay: 10, accountId: S.accounts[0].id };
    const body = `<p class="muted" style="font-size:.85rem;line-height:1.5;margin-bottom:14px">Cadastro manual serve apenas para organizar o cartão. Para importar faturas e compras automaticamente, conecte o banco pelo Open Finance. Nunca informe o número completo do cartão.</p><div class="form-grid">
      <div class="field full"><label for="cName">Nome do cartão</label><input class="input" id="cName" value="${esc(x.name)}" placeholder="Ex.: Nubank Roxinho"></div>
      <div class="field"><label for="cBank">Banco</label><select class="select" id="cBank">${Object.entries(BANKS).filter(([k]) => k !== 'cash').map(([k, b]) => `<option value="${k}" ${x.bank === k ? 'selected' : ''}>${b.name}</option>`).join('')}</select></div>
      <div class="field"><label for="cBrand">Bandeira</label><select class="select" id="cBrand">${['Mastercard', 'Visa', 'Elo', 'Amex', 'Hipercard'].map((b) => `<option ${x.brand === b ? 'selected' : ''}>${b}</option>`).join('')}</select></div>
      <div class="field"><label for="cLast">Últimos 4 dígitos</label><input class="input" id="cLast" inputmode="numeric" maxlength="4" value="${esc(x.last4)}" placeholder="0000"><span class="hint">Apenas para identificar. Nunca pedimos o número completo.</span></div>
      <div class="field"><label for="cLimit">Limite</label><div class="input-money"><input class="input" id="cLimit" type="number" min="0" step="100" value="${x.limit}"></div></div>
      <div class="field"><label for="cDue">Dia do vencimento</label><input class="input" id="cDue" type="number" min="1" max="28" value="${x.dueDay}"></div>
      <div class="field"><label for="cAcc">Pagar a fatura com</label><select class="select" id="cAcc">${srcOptions('a:' + x.accountId, true)}</select></div>
    </div>`;
    const foot = `${!isNew ? '<button class="btn btn-sm btn-ghost neg" data-act-m="del" style="margin-right:auto">Remover</button>' : ''}<button class="btn btn-sm" data-close>Cancelar</button><button class="btn btn-lime" data-act-m="save">Salvar</button>`;
    openModal({ title: isNew ? 'Adicionar cartão' : 'Editar cartão', body, foot, onMount: (m) => {
      m.addEventListener('click', (e) => {
        const a = e.target.closest('[data-act-m]'); if (!a) return;
        if (a.dataset.actM === 'del') { if (confirm('Remover este cartão? As transações dele continuam no histórico.')) { S.cards = S.cards.filter((z) => z !== c); S.tx.forEach((t) => { if (t.cardId === c.id) { t.accountId = c.accountId; t.cardId = undefined; } }); closeModal(); commit(); } return; }
        const name = $('#cName', m).value.trim(); if (!name) { $('#cName', m).focus(); return; }
        const o = c || { id: uid(), connected: false };
        Object.assign(o, { name, bank: $('#cBank', m).value, brand: $('#cBrand', m).value, last4: $('#cLast', m).value.replace(/\D/g, '').slice(0, 4), limit: +$('#cLimit', m).value || 0, dueDay: clamp(+$('#cDue', m).value || 10, 1, 28), accountId: $('#cAcc', m).value.split(':')[1] });
        if (isNew) S.cards.push(o);
        closeModal(); commit();
      });
    } });
  }

  function accountModal(acc) {
    const isNew = !acc;
    const x = acc || { name: '', bank: 'cash', kind: 'corrente', initial: 0 };
    const body = `<div class="form-grid">
      <div class="field full"><label for="aName">Nome</label><input class="input" id="aName" value="${esc(x.name)}" placeholder="Ex.: Conta Inter, Cofre de casa"></div>
      <div class="field"><label for="aBank">Instituição</label><select class="select" id="aBank">${Object.entries(BANKS).map(([k, b]) => `<option value="${k}" ${x.bank === k ? 'selected' : ''}>${b.name}</option>`).join('')}</select></div>
      <div class="field"><label for="aBal">Saldo atual</label><div class="input-money"><input class="input" id="aBal" type="number" step="0.01" value="${isNew ? '' : accBalance(x).toFixed(2)}"></div><span class="hint">Ajustamos o saldo inicial para bater com este valor</span></div>
    </div>`;
    const canDel = !isNew && S.accounts.length > 1 && !isBankId(acc.id);
    const foot = `${canDel ? '<button class="btn btn-sm btn-ghost neg" data-act-m="del" style="margin-right:auto">Remover</button>' : ''}<button class="btn btn-sm" data-close>Cancelar</button><button class="btn btn-lime" data-act-m="save">Salvar</button>`;
    openModal({ title: isNew ? 'Nova conta manual' : 'Editar conta', body, foot, onMount: (m) => {
      m.addEventListener('click', (e) => {
        const a = e.target.closest('[data-act-m]'); if (!a) return;
        if (a.dataset.actM === 'del') { if (confirm('Remover esta conta e todas as transações dela?')) { S.accounts = S.accounts.filter((z) => z !== acc); S.tx = S.tx.filter((t) => t.accountId !== acc.id); closeModal(); commit(); } return; }
        const name = $('#aName', m).value.trim(); if (!name) { $('#aName', m).focus(); return; }
        const o = acc || { id: uid(), kind: 'corrente', connected: false, initial: 0 };
        if (isBankId(o.id) && o.name !== name) o.customName = true;
        o.name = name; if (!isBankId(o.id)) o.bank = $('#aBank', m).value; o.kind = o.bank === 'cash' ? 'dinheiro' : 'corrente';
        if (isNew) S.accounts.push(o);
        const want = +$('#aBal', m).value || 0; o.initial += want - accBalance(o);
        closeModal(); commit();
      });
    } });
  }

  /* ------------------------------------------- Open Finance (simulado) */
  const IMPORT_POOL = [
    ['iFood *Restaurante Tokai', -54.9, 'credito'], ['Uber *Trip', -23.4, 'credito'], ['Pão de Açúcar', -187.35, 'debito'], ['Petz', -89.9, 'credito'],
    ['Pix recebido — Lucas R.', 120, 'pix'], ['Drogasil', -38.7, 'debito'], ['Amazon.com.br', -129.9, 'credito'], ['99 Pop', -17.8, 'credito'],
    ['Posto Ipiranga', -180, 'debito'], ['Starbucks', -27.5, 'credito'], ['Shopee', -64.3, 'credito'], ['Cinemark', -58, 'credito'],
    ['Hortifruti Natural', -72.4, 'debito'], ['Rappi *Açaí', -32.9, 'credito'], ['Padaria Real', -18.4, 'pix'], ['Pix recebido — Bia', 45, 'pix'],
  ];
  function connectBankModal() {
    let step = 0, bankId = null;
    const m = openModal({ title: 'Conectar via <span class="serif">Open Finance</span>', wide: true, body: '<div id="ofBody"></div>' });
    const box = $('#ofBody', m);
    const steps = () => `<div class="steps">${[0, 1, 2, 3].map((i) => `<i class="${i <= step ? 'on' : ''}"></i>`).join('')}</div>`;
    const draw = () => {
      const b = BANKS[bankId] || {};
      if (step === 0) {
        const taken = new Set(S.accounts.filter((a) => a.connected).map((a) => a.bank));
        box.innerHTML = `${steps()}<p style="margin-bottom:14px;font-weight:600">Escolha sua instituição</p><div class="bank-pick">${Object.entries(BANKS).filter(([k]) => k !== 'cash').map(([k, bb]) => `<button data-bank="${k}" ${taken.has(k) ? 'disabled style="opacity:.4"' : ''}><span class="bank-logo" style="background:${bb.color}">${bb.short}</span>${bb.name}${taken.has(k) ? '<span class="tag">conectado</span>' : ''}</button>`).join('')}</div>`;
      } else if (step === 1) {
        box.innerHTML = `${steps()}<div style="display:flex;gap:14px;align-items:center;margin-bottom:16px"><span class="bank-logo" style="background:${b.color};width:54px;height:54px">${b.short}</span><div><b style="font-size:1.1rem">${b.name}</b><p class="muted" style="font-size:.84rem">O Finaxis está pedindo acesso de leitura aos seus dados</p></div></div>
          <div class="consent"><b>Dados compartilhados</b><ul style="margin-top:6px"><li>Saldos e extratos de conta</li><li>Cartões de crédito, limites e faturas</li><li>Transações: Pix, débito, crédito, boletos e TED</li></ul>
          <p style="margin-top:10px"><b>Prazo:</b> 12 meses (você pode revogar quando quiser)<br><b>Finalidade:</b> controle financeiro e categorização de gastos</p></div>
          <p class="muted" style="font-size:.76rem;margin-top:12px">🔒 Ambiente de demonstração: nenhuma senha ou dado bancário é solicitado. No app real esta etapa redireciona para o aplicativo do ${b.name}.</p>
          <div class="modal-foot"><button class="btn btn-sm" data-of="back">Voltar</button><button class="btn btn-lime" data-of="ok">Autorizar no app do banco ${ARROW}</button></div>`;
      } else if (step === 2) {
        box.innerHTML = `${steps()}<div style="text-align:center;padding:20px 0"><div class="loader"></div><p class="display" style="font-size:1.2rem;margin-top:14px" id="ofMsg">Abrindo o app do ${b.name}…</p><p class="muted" style="font-size:.84rem;margin-top:6px">Isso leva só alguns segundos</p></div>`;
        setTimeout(() => { const e = $('#ofMsg'); if (e) e.textContent = 'Autorizado ✓ Importando transações…'; }, 1100);
        setTimeout(finish, 2300);
      }
    };
    const done = (b, n, counts) => {
      step = 3;
      box.innerHTML = `${steps()}<div style="text-align:center"><img src="${MASCOT}" alt="" style="width:80px;margin:0 auto 10px"><h3 class="display" style="font-size:1.6rem">${esc(b.name)} conectado!</h3><p class="muted" style="margin-top:6px">Importamos <b>${n} transações</b>, 1 conta e 1 cartão. Já categorizamos tudo:</p></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-top:16px">${Object.entries(counts).map(([c, k]) => `<span class="chip">${catIco(c)} ${cat(c).name} · ${k}</span>`).join('')}</div>
        <div class="modal-foot" style="justify-content:center"><button class="btn btn-sm" data-close>Fechar</button><button class="btn btn-lime" data-of="see">Ver transações ${ARROW}</button></div>`;
      render();
      toast(`<b>${esc(b.name)}</b> conectado via Open Finance`, '🔗');
    };
    const finish = async () => {
      if (!$('#ofBody')) return;
      if (API.online) { // servidor cria a conexão de demonstração e importa as transações
        try {
          const { data } = await api('POST', '/api/openfinance/demo/connect', { bank: bankId });
          await refreshFromServer();
          const mine = S.tx.filter((t) => t.connectionId === data.connection.id);
          const counts = {}; mine.forEach((t) => { counts[t.cat] = (counts[t.cat] || 0) + 1; });
          if ($('#ofBody')) done(BANKS[bankId], mine.length, counts);
        } catch (e) { box.innerHTML = `${steps()}<p class="neg" style="font-weight:700">Não foi possível conectar: ${esc(e.message)}</p><div class="modal-foot"><button class="btn btn-sm" data-of="back">Tentar de novo</button></div>`; }
        return;
      }
      const b = BANKS[bankId], T = now();
      const acc ={ id: uid(), bank: bankId, name: `Conta ${b.name}`, kind: 'corrente', initial: Math.round(800 + Math.random() * 2400), connected: true, lastSync: Date.now() };
      const card = { id: uid(), bank: bankId, name: `${b.name} Crédito`, brand: Math.random() < 0.5 ? 'Visa' : 'Mastercard', last4: String(1000 + Math.floor(Math.random() * 8999)), limit: 2000 + Math.round(Math.random() * 6) * 500, dueDay: 5 + Math.floor(Math.random() * 20), accountId: acc.id, connected: true };
      S.accounts.push(acc); S.cards.push(card);
      const n = 9 + Math.floor(Math.random() * 6), pool = [...IMPORT_POOL].sort(() => Math.random() - 0.5).slice(0, n);
      const counts = {};
      pool.forEach(([d, a, meth]) => {
        const day = 1 + Math.floor(Math.random() * T.getDate());
        const t = { id: uid(), date: ymd(new Date(T.getFullYear(), T.getMonth(), day)), desc: d, amount: a, cat: autoCat(d, a), method: meth, source: 'bank', ...(meth === 'credito' ? { cardId: card.id } : { accountId: acc.id }) };
        S.tx.push(t); UI.fresh.add(t.id); counts[t.cat] = (counts[t.cat] || 0) + 1;
      });
      save();
      done(b, n, counts);
    };
    box.addEventListener('click', (e) => {
      const bk = e.target.closest('[data-bank]');
      if (bk && !bk.disabled) { bankId = bk.dataset.bank; step = 1; draw(); return; }
      const of = e.target.closest('[data-of]'); if (!of) return;
      if (of.dataset.of === 'back') { step = 0; draw(); }
      if (of.dataset.of === 'ok') { step = 2; draw(); }
      if (of.dataset.of === 'see') { closeModal(); UI.ym = ymOf(now()); UI.f = { q: '', type: 'all', cat: '', method: '', src: '' }; go('transacoes'); }
    });
    draw();
  }

  /* ------------------------------------------- Open Finance real (Pluggy) */
  const loadScript = (src) => new Promise((ok, fail) => {
    if (window.PluggyConnect) return ok();
    const s = document.createElement('script');
    s.src = src; s.async = true; s.onload = () => ok(); s.onerror = () => fail(new Error('Não foi possível carregar o widget do Pluggy'));
    document.head.appendChild(s);
  });

  async function pluggyConnect() {
    try {
      toast('Abrindo a conexão segura com o seu banco…', '🔒', 3000);
      await loadScript(API.cfg.connectScript);
      const { data } = await api('POST', '/api/openfinance/connect-token');
      const widget = new window.PluggyConnect({
        connectToken: data.accessToken,
        includeSandbox: !!API.cfg.sandbox,
        products: ['ACCOUNTS', 'CREDIT_CARDS', 'TRANSACTIONS', 'INVESTMENTS'],
        language: 'pt',
        onSuccess: async ({ item }) => {
          toast('Banco autorizado! Importando suas transações…', '⏳', 4000);
          try {
            const r = await api('POST', '/api/openfinance/items', { itemId: item.id });
            await refreshFromServer();
            render();
            toast(`<b>${esc(r.data.connection.bankName || 'Banco')}</b> conectado: ${r.data.imported} transações importadas. Novas movimentações chegam automaticamente.`, '🔗', 7000);
          } catch (e) { toast(`Não foi possível registrar a conexão: ${esc(e.message)}`, '⚠️', 7000); }
        },
        onError: (err) => toast(`O banco não concluiu a conexão${err && err.message ? `: ${esc(err.message)}` : ''}`, '⚠️', 7000),
      });
      await widget.init();
    } catch (e) { toast(esc(e.message), '⚠️', 6000); }
  }

  /* ----------------------------------------------------- login / conta */
  function showAuth(msg) {
    document.body.classList.add('auth-open');
    let mode = 'login';
    const root = document.createElement('div');
    root.className = 'auth';
    root.innerHTML = `
      <section class="auth-art">
        <a href="index.html" class="brand" aria-label="Finaxis — página inicial"><img src="${MASCOT}" alt=""><span class="brand-word" style="color:#fff">Finaxis</span></a>
        <div>
          <h1 class="display">Seu dinheiro sob <span class="serif">controle</span>, em tempo real</h1>
          <ul><li>Bancos e cartões conectados via Open Finance</li><li>Gastos categorizados sozinhos</li><li>Caixinhas com simulação de metas</li></ul>
        </div>
        <img class="auth-mascot" src="${MASCOT}" alt="">
      </section>
      <section class="auth-panel">
        <div class="card auth-card">
          <div class="seg" id="authTabs" style="margin-bottom:20px"><button type="button" data-m="login" class="on">Entrar</button><button type="button" data-m="signup">Criar conta</button></div>
          <button class="btn auth-google" id="authGoogle" type="button"><svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#4285F4" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.4 9.4 0 0 1-4.1 6.2v5.1h6.7c3.9-3.6 6-8.8 6-15Z"/><path fill="#34A853" d="M24 44c5.5 0 10.2-1.8 13.6-4.9l-6.7-5.1c-1.8 1.2-4.1 1.9-6.9 1.9-5.3 0-9.8-3.6-11.4-8.4H5.7v5.3A20 20 0 0 0 24 44Z"/><path fill="#FBBC05" d="M12.6 27.5a12 12 0 0 1 0-7v-5.3H5.7a20 20 0 0 0 0 17.6l6.9-5.3Z"/><path fill="#EA4335" d="M24 12.1c3 0 5.7 1 7.8 3.1l5.9-5.9C34.2 6 29.5 4 24 4A20 20 0 0 0 5.7 15.2l6.9 5.3c1.6-4.8 6.1-8.4 11.4-8.4Z"/></svg>Continuar com Google</button>
          <div class="auth-divider"><span>ou entre com e-mail</span></div>
          <form id="authForm" class="stack" style="gap:14px" novalidate>
            <div class="field" id="fName" hidden><label for="aName2">Seu nome</label><input class="input" id="aName2" autocomplete="name" maxlength="60"></div>
            <div class="field"><label for="aEmail">E-mail</label><input class="input" id="aEmail" type="email" autocomplete="email" required></div>
            <div class="field"><label for="aPass">Senha</label><input class="input" id="aPass" type="password" autocomplete="current-password" minlength="8" required><span class="hint" id="aHint" hidden>Mínimo de 8 caracteres</span></div>
            <p class="neg" id="aErr" role="alert" style="font-size:.85rem;font-weight:700;min-height:1em">${msg ? esc(msg) : ''}</p>
            <button class="btn btn-lime btn-lg" id="aSubmit" type="submit">Entrar ${ARROW}</button>
          </form>
        </div>
      </section>`;
    document.body.appendChild(root);
    const googleButton = $('#authGoogle', root);
    googleButton.addEventListener('click', () => { location.href = '/api/auth/google'; });
    fetch('/api/auth/providers', { cache: 'no-store' }).then((r) => r.json()).then((p) => { googleButton.hidden = !p.google; }).catch(() => { googleButton.hidden = true; });
    const setMode = (m) => {
      mode = m;
      $$('#authTabs button', root).forEach((b) => b.classList.toggle('on', b.dataset.m === m));
      $('#fName', root).hidden = m !== 'signup';
      $('#aHint', root).hidden = m !== 'signup';
      $('#aPass', root).autocomplete = m === 'signup' ? 'new-password' : 'current-password';
      $('#aSubmit', root).innerHTML = `${m === 'signup' ? 'Criar minha conta' : 'Entrar'} ${ARROW}`;
      $('#aErr', root).textContent = '';
    };
    $('#authTabs', root).addEventListener('click', (e) => { const b = e.target.closest('[data-m]'); if (b) setMode(b.dataset.m); });
    $('#authForm', root).addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('#aSubmit', root);
      btn.disabled = true;
      try {
        const body = { email: $('#aEmail', root).value, password: $('#aPass', root).value };
        if (mode === 'signup') body.name = $('#aName2', root).value;
        await api('POST', mode === 'signup' ? '/api/auth/signup' : '/api/auth/login', body);
        history.replaceState(null, '', location.pathname);
        location.reload();
      } catch (err) { $('#aErr', root).textContent = err.message; btn.disabled = false; }
    });
    if (location.hash === '#criar') setMode('signup');
    setTimeout(() => $('#aEmail', root).focus(), 50);
  }

  async function logout() {
    await flush().catch(() => {});
    await api('POST', '/api/auth/logout').catch(() => {});
    location.reload();
  }

  function deleteAccountModal() {
    openModal({
      title: 'Excluir minha conta',
      body: `<p style="line-height:1.55">Isso apaga <b>permanentemente</b> seu perfil, transações, caixinhas e orçamentos, e revoga as conexões com bancos. Não dá para desfazer.</p>
        <div class="field" style="margin-top:16px"><label for="delPass">Confirme sua senha</label><input class="input" id="delPass" type="password" autocomplete="current-password"></div>
        <p class="neg" id="delErr" style="font-size:.85rem;font-weight:700;margin-top:8px"></p>`,
      foot: '<button class="btn btn-sm" data-close>Cancelar</button><button class="btn btn-red" id="delOk">Excluir tudo</button>',
      onMount: (m) => $('#delOk', m).addEventListener('click', async () => {
        try { await api('POST', '/api/me/delete', { password: $('#delPass', m).value }); location.reload(); } catch (e) { $('#delErr', m).textContent = e.message; }
      }),
    });
  }

  /** Recarregar demo / começar do zero mantendo o que vem do banco (senão o próximo sync apagaria essas transações). */
  function keepBankData(next, prev) {
    if (!API.online || !prev) return next;
    next.accounts = [...next.accounts.filter((a) => !isBankId(a.id)), ...prev.accounts.filter((a) => isBankId(a.id))];
    next.cards = [...next.cards.filter((c) => !isBankId(c.id)), ...prev.cards.filter((c) => isBankId(c.id))];
    next.tx = [...next.tx, ...prev.tx.filter((t) => isBankId(t.id))];
    return next;
  }

  function reminders() {
    if (!S.settings.reminders) return;
    const soon = upcoming(3).filter((b) => b.amount < 0 && b.kind !== 'save');
    if (soon.length) setTimeout(() => toast(`<b>${soon.length} conta${soon.length > 1 ? 's vencem' : ' vence'} em até 3 dias</b><br>${soon.slice(0, 2).map((b) => esc(b.title)).join(', ')}${soon.length > 2 ? '…' : ''}`, '⏰', 6500), 1200);
  }

  /* --------------------------------------------------------- exportação */
  function download(name, text, type) {
    const blob = new Blob([text], { type });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function exportCsv() {
    const rows = [['Data', 'Descrição', 'Categoria', 'Forma', 'Conta/Cartão', 'Valor']];
    [...S.tx].sort((a, b) => a.date.localeCompare(b.date)).forEach((t) => rows.push([t.date, t.desc, cat(t.cat).name, (METHODS[t.method] || {}).name || t.method, srcName(t), t.amount.toFixed(2).replace('.', ',')]));
    download('finaxis-transacoes.csv', '﻿' + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n'), 'text/csv;charset=utf-8');
    toast('CSV exportado (abre no Excel ou Google Sheets)', '⬇');
  }

  /* -------------------------------------------------------------- ações */
  const ACTIONS = {
    addTx: () => txModal(),
    editTx: (el) => { const t = S.tx.find((x) => x.id === el.dataset.id); if (t) txModal(t); },
    toggleHide: () => { S.settings.hide = !S.settings.hide; commit(); },
    filterCat: (el) => { UI.f = { q: '', type: 'out', cat: el.dataset.cat, method: '', src: '' }; go('transacoes'); },
    ftype: (el) => { UI.f.type = el.dataset.v; $$('[data-act="ftype"]').forEach((b) => b.classList.toggle('on', b === el)); renderTxList(); },
    exportCsv, exportJson: () => download('finaxis-backup.json', JSON.stringify(S, null, 2), 'application/json'),
    connectBank: () => (API.online && API.cfg && API.cfg.provider === 'pluggy' ? pluggyConnect() : connectBankModal()),
    disconnectAcc: async (el) => {
      const a = [...S.accounts, ...S.cards].find((x) => x.id === el.dataset.id);
      if (!a || !a.connectionId) return;
      if (!confirm(`Desconectar ${bankOf(a).name}? O Finaxis deixa de receber novas transações desse banco (o histórico continua aqui).`)) return;
      try { await api('DELETE', `/api/openfinance/connections/${a.connectionId}`); await refreshFromServer(); render(); toast(`${esc(bankOf(a).name)} desconectado. Consentimento revogado.`, '🔌'); } catch (e) { toast(esc(e.message), '⚠️'); }
    },
    logout: () => logout(),
    deleteAccount: () => deleteAccountModal(),
    newCard: () => cardModal(), editCard: (el) => cardModal(S.cards.find((c) => c.id === el.dataset.id)),
    newAccount: () => accountModal(), editAcc: (el) => accountModal(S.accounts.find((a) => a.id === el.dataset.id)),
    viewCard: (el) => { UI.f = { q: '', type: 'all', cat: '', method: '', src: 'c:' + el.dataset.id }; UI.ym = ymOf(now()); go('transacoes'); },
    syncAcc: async (el) => {
      const a = S.accounts.find((x) => x.id === el.dataset.id);
      el.innerHTML = '⟳ Sincronizando…';
      if (API.online && a.connectionId) {
        try {
          const { data } = await api('POST', '/api/openfinance/sync', { connectionId: a.connectionId });
          await refreshFromServer(); render();
          toast(data.imported ? `${data.imported} novas transações de ${esc(bankOf(a).name)}` : `${esc(a.name)} sincronizada. Tudo em dia ✓`, '🔄');
        } catch (e) { toast(`Falha ao sincronizar: ${esc(e.message)}`, '⚠️'); render(); }
        return;
      }
      setTimeout(() => { a.lastSync = Date.now(); save(); render(); toast(`${esc(a.name)} sincronizada. Tudo em dia ✓`, '🔄'); }, 900);
    },
    simulateLive: async () => {
      try { await api('POST', '/api/openfinance/demo/tick'); } catch (e) { toast(e.status === 400 ? 'Conecte um banco de demonstração primeiro (botão Conectar banco).' : esc(e.message), '🔌'); }
    },
    payInvoice: (el) => {
      const c = S.cards.find((x) => x.id === el.dataset.card), ym = el.dataset.ym, total = invoiceTotal(c, ym);
      const acc = S.accounts.find((a) => a.id === c.accountId) || S.accounts[0];
      if (!confirm(`Registrar pagamento da fatura ${c.name} de ${MONTHS[parseD(ym + '-01').getMonth()].toLowerCase()} (${brlRaw(total)}) saindo de ${acc.name}?`)) return;
      S.tx.push({ id: uid(), ts: Date.now(), date: todayStr(), desc: `Fatura ${c.name} (${ymShort(ym)})`, amount: -total, cat: 'fatura', method: 'boleto', accountId: acc.id, source: 'manual' });
      S.paid[c.id + ':' + ym] = true; commit(); toast('Fatura paga! Limite liberado.', '✅');
    },
    newGoal: () => goalModal(), editGoal: (el) => goalModal(S.goals.find((g) => g.id === el.dataset.id)),
    goalMove: (el) => goalMoveModal(S.goals.find((g) => g.id === el.dataset.id), +el.dataset.dir),
    simGoal: (el) => { UI.simGoal = el.dataset.id; render(); $('#simulator').scrollIntoView({ behavior: 'smooth', block: 'start' }); },
    editBudgets: () => budgetsModal(),
    suggestBudgets: () => { const sg = {}; EXP_CATS.forEach((c) => { const v = avgExpenses(3, (k) => k === c); if (v > 20) sg[c] = Math.ceil((v * 0.9) / 10) * 10; }); budgetsModal(sg); },
    newRec: () => recModal(), editRec: (el) => recModal(S.recurring.find((r) => r.id === el.dataset.id)),
    joinCh: (el) => { S.learn.challenges[el.dataset.id] = { joined: todayStr() }; commit(); toast('Desafio aceito! Bora 💪', '🔥'); },
    doneCh: (el) => { const ch = CHALLENGES.find((c) => c.id === el.dataset.id); const st = S.learn.challenges[ch.id]; if (st.done) return; st.done = true; S.learn.xp += ch.xp; commit(); toast(`Desafio concluído: <b>+${ch.xp} XP</b>`, '🏆'); },
    openLesson: (el) => {
      const course = COURSES.find((c) => c.lessons.some((l) => l.id === el.dataset.id)), l = course.lessons.find((x) => x.id === el.dataset.id);
      const done = S.learn.done.includes(l.id);
      openModal({ title: l.t, body: `<span class="tag" style="background:${course.color};color:#fff">${course.emoji} ${course.title}</span><div class="lesson-content" style="margin-top:14px">${l.body.map((p) => `<p>${esc(p)}</p>`).join('')}<div class="callout">💡 <b>Na prática:</b> ${esc(l.tip)}</div></div>`, foot: `<button class="btn btn-sm" data-close>Fechar</button>${done ? '<span class="chip" style="background:#3DBA85">Concluída ✓</span>' : '<button class="btn btn-lime" id="lDone">Concluir aula · +50 XP</button>'}`, onMount: (m) => {
        const b = $('#lDone', m); if (b) b.addEventListener('click', () => { S.learn.done.push(l.id); S.learn.xp += 50; closeModal(); commit(); toast('Aula concluída: <b>+50 XP</b>', '🎓'); });
      } });
    },
    more: () => openModal({ title: 'Menu', body: `<nav class="side-nav more-sheet">${navHtml()}</nav>`, onMount: (m) => { $$('[data-route]', m).forEach((a) => { a.classList.toggle('active', a.dataset.route === UI.route); a.addEventListener('click', closeModal); }); } }),
    startEmpty: () => {
      if (!confirm(`Apagar todos os dados${API.online ? ' (exceto o que vem dos bancos conectados)' : ''} e começar do zero?`)) return;
      const prev = S; S = keepBankData(emptyState(false), prev); UI.ym = ymOf(now()); commit(); onboarding();
    },
  };

  function onboarding() {
    openModal({ title: 'Bem-vindo ao <span class="serif">Finaxis</span>', body: `<div style="display:flex;gap:14px;align-items:center;margin-bottom:18px"><img src="${MASCOT}" alt="" style="width:64px"><p style="line-height:1.5">Responda três perguntas rápidas e o Finaxis monta seu painel.</p></div>
      <div class="form-grid"><div class="field full"><label for="oName">Seu nome</label><input class="input" id="oName" placeholder="Como quer ser chamado(a)?"></div>
      <div class="field"><label for="oSal">Salário líquido</label><div class="input-money"><input class="input" id="oSal" type="number" min="0" step="50"></div></div>
      <div class="field"><label for="oDay">Dia em que recebe</label><input class="input" id="oDay" type="number" min="1" max="31" value="5"></div>
      <label class="field full" style="flex-direction:row;gap:10px;align-items:center;font-size:.85rem"><input type="checkbox" id="oRec" checked> Lançar o salário automaticamente todo mês</label></div>`,
      foot: `<button class="btn btn-sm" data-close>Depois</button><button class="btn btn-lime" id="oOk">Montar meu painel ${ARROW}</button>`, onMount: (m) => {
        if (S.profile.name && S.profile.name !== 'Você') $('#oName', m).value = S.profile.name;
        $('#oOk', m).addEventListener('click', () => {
          S.profile.name = $('#oName', m).value.trim() || 'Você'; S.profile.salary = +$('#oSal', m).value || 0; S.profile.payday = clamp(+$('#oDay', m).value || 5, 1, 31);
          if ($('#oRec', m).checked && S.profile.salary) { const T = now(); S.recurring.push({ id: uid(), desc: 'Salário', amount: S.profile.salary, cat: 'salario', day: S.profile.payday, method: 'ted', accountId: S.accounts[0].id, start: S.profile.payday < T.getDate() ? shiftYm(ymOf(T), 1) : ymOf(T) }); postRecurring(S); }
          closeModal(); commit(); toast('Painel pronto! Agora conecte um banco ou lance seu primeiro gasto.', '🎉', 6000);
        });
      } });
  }

  /* ------------------------------------------------------------- eventos */
  document.addEventListener('click', (e) => {
    const g = e.target.closest('[data-go]');
    if (g) { e.preventDefault(); go(g.dataset.go); return; }
    const a = e.target.closest('[data-act]');
    if (a && ACTIONS[a.dataset.act]) { e.preventDefault(); ACTIONS[a.dataset.act](a, e); }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('#modalRoot').children.length) closeModal();
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.tx[data-act]')) { e.preventDefault(); ACTIONS.editTx(e.target); }
  });
  document.addEventListener('input', (e) => {
    const f = e.target.closest('[data-filter]');
    if (f) { UI.f[f.dataset.filter] = f.value; renderTxList(); return; }
    const p = e.target.closest('[data-profile]');
    if (p) { const k = p.dataset.profile; S.profile[k] = k === 'name' ? p.value : +p.value || 0; save(); if (k === 'name') $('#hello').textContent = `Olá, ${S.profile.name} 👋`; }
  });
  document.addEventListener('change', (e) => {
    const s = e.target.closest('[data-setting]');
    if (s) { S.settings[s.dataset.setting] = s.checked; commit(); if (s.dataset.setting === 'live' && s.checked) toast('Tempo real ligado. Novas transações vão aparecer aqui.', '⚡'); }
  });
  $('#monthSwitch').addEventListener('click', (e) => { const b = e.target.closest('[data-m]'); if (!b) return; UI.ym = shiftYm(UI.ym, +b.dataset.m); render(); });
  $('#addBtn').addEventListener('click', () => txModal());
  $('#moreBtn').addEventListener('click', () => ACTIONS.more());
  window.addEventListener('hashchange', route);

  /* ---------------------------------------------------------------- boot */
  function sidePanel() {
    const box = $('.side-promo'); if (!box) return;
    if (API.online) box.innerHTML = `<b>${esc(API.user.name)}</b><p>${esc(API.user.email)}<br>Dados salvos na sua conta${API.cfg && API.cfg.provider === 'demo' ? ' · bancos em modo demonstração' : ''}.</p><button class="link" data-act="logout" style="margin-top:8px">Sair</button>`;
  }

  async function boot() {
    const params = new URLSearchParams(location.search);
    const createAccountRequested = location.hash === '#criar';
    let googleErrorMessage = '';
    if (params.get('auth') === 'google' || params.has('google_error')) {
      if (params.has('google_error')) {
        const messages = { not_configured: 'Login Google ainda não configurado no servidor.', cancelled: 'Login Google cancelado.', invalid_state: 'A tentativa expirou. Tente entrar com Google novamente.', token_exchange: 'O Google não concluiu a autenticação. Tente novamente.', invalid_identity: 'Não foi possível validar sua conta Google.', authentication_failed: 'Falha no login Google. Tente novamente.' };
        googleErrorMessage = messages[params.get('google_error')] || 'Não foi possível entrar com Google.';
      }
      history.replaceState(null, '', location.pathname);
    }
    try { const r = await fetch('/api/health', { cache: 'no-store' }); API.available = r.ok && !!(await r.json()).ok; } catch (_) { API.available = false; }
    if (!API.available) throw new Error('servidor indisponível');
    // A landing page's "Criar conta" CTA must never inherit the current browser session.
    // This matters on shared devices, where another person may still be signed in.
    if (createAccountRequested) {
      await api('POST', '/api/auth/logout').catch(() => {});
      showAuth(googleErrorMessage);
      return;
    }
    try { API.user = (await api('GET', '/api/me')).data.user; } catch (e) { if (e.status === 401) return showAuth(googleErrorMessage); throw e; }
    API.online = true;
    API.cfg = (await api('GET', '/api/openfinance/config')).data;
    await loadRemote();
    if (postRecurring(S)) toast('Contas fixas do período foram lançadas automaticamente', '📅');
    save();
    buildNav();
    sidePanel();
    route();
    reminders();
    connectEvents();
    if (API.isNew) onboarding();
    window.addEventListener('beforeunload', () => { if (API.dirty || API.saving) { clearTimeout(API.timer); pushState(); } });
  }
  boot().catch((e) => {
    console.error(e);
    $('#view').innerHTML = `<div class="card">${emptyBox(`Não foi possível carregar seus dados (${esc(e.message)}). Verifique sua conexão e recarregue a página.`, '<a class="btn btn-lime btn-sm" href="app.html">Recarregar</a>')}</div>`;
  });
})();
