'use strict';
// Teste de ponta a ponta da API: `npm test`
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');

const PORT = 5199;
const BASE = `http://127.0.0.1:${PORT}`;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'finaxis-test-'));
let proc;

function client() {
  let cookie = '';
  return async (method, p, body, headers = {}) => {
    const r = await fetch(BASE + p, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-Finaxis': '1', ...(cookie ? { Cookie: cookie } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    const sc = r.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    const text = await r.text();
    return { status: r.status, body: text ? JSON.parse(text) : null };
  };
}

before(async () => {
  proc = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'index.js')], {
    env: { ...process.env, PORT: String(PORT), DB_FILE: path.join(tmp, 'test.db'), PLUGGY_CLIENT_ID: '', PLUGGY_CLIENT_SECRET: '', DEMO_LIVE_SECONDS: '3600' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((ok, fail) => {
    const t = setTimeout(() => fail(new Error('servidor não subiu')), 8000);
    proc.stdout.on('data', (d) => { if (String(d).includes('rodando')) { clearTimeout(t); ok(); } });
    proc.stderr.on('data', (d) => process.stderr.write(d));
  });
});
after(async () => {
  await new Promise((ok) => { proc.once('exit', ok); proc.kill(); });
  try { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* Windows pode segurar o arquivo por um instante */ }
});

test('health e arquivos estáticos protegidos', async () => {
  const api = client();
  assert.equal((await api('GET', '/api/health')).body.provider, 'demo');
  assert.equal((await fetch(BASE + '/app.html')).status, 200);
  assert.equal((await fetch(BASE + '/server/index.js')).status, 404);
  assert.equal((await fetch(BASE + '/.env')).status, 404);
  assert.equal((await fetch(BASE + '/data/test.db')).status, 404);
});

test('cadastro, login, sessão e CSRF', async () => {
  const api = client();
  assert.equal((await api('GET', '/api/me')).status, 401);
  assert.equal((await api('POST', '/api/auth/signup', { email: 'a@b.co', password: '123', name: 'Ana' })).status, 400);
  const s = await api('POST', '/api/auth/signup', { email: 'Ana@Exemplo.com', password: 'senha-forte-1', name: 'Ana' });
  assert.equal(s.status, 200);
  assert.equal(s.body.user.email, 'ana@exemplo.com');
  assert.equal((await api('GET', '/api/me')).body.user.name, 'Ana');
  assert.equal((await api('POST', '/api/auth/signup', { email: 'ana@exemplo.com', password: 'outra-senha-1', name: 'X' })).status, 409);
  // sem o cabeçalho X-Finaxis a escrita é bloqueada
  assert.equal((await api('PUT', '/api/state', { doc: {} }, { 'X-Finaxis': '0' })).status, 403);
  await api('POST', '/api/auth/logout');
  assert.equal((await api('GET', '/api/me')).status, 401);
  const other = client();
  assert.equal((await other('POST', '/api/auth/login', { email: 'ana@exemplo.com', password: 'errada-123' })).status, 401);
  assert.equal((await other('POST', '/api/auth/login', { email: 'ana@exemplo.com', password: 'senha-forte-1' })).status, 200);
});

test('estado: salvar, versão e conflito', async () => {
  const api = client();
  await api('POST', '/api/auth/signup', { email: 'bia@exemplo.com', password: 'senha-forte-2', name: 'Bia' });
  let st = (await api('GET', '/api/state')).body;
  assert.equal(st.doc, null);
  const tx = { id: 't1', date: '2026-11-05', desc: 'iFood', amount: -42.5, cat: 'alimentacao', method: 'credito' };
  let r = await api('PUT', '/api/state', { baseVersion: 0, doc: { profile: { name: 'Bia' } }, upserts: [tx, { id: 'ruim', date: 'x' }] });
  assert.equal(r.status, 200);
  assert.equal(r.body.version, 1);
  assert.equal(r.body.rejected, 1);
  st = (await api('GET', '/api/state')).body;
  assert.equal(st.tx.length, 1);
  assert.equal(st.doc.profile.name, 'Bia');
  // versão desatualizada -> 409 com o documento atual (transações são aplicadas mesmo assim)
  r = await api('PUT', '/api/state', { baseVersion: 0, doc: { profile: { name: 'X' } }, upserts: [{ ...tx, id: 't2' }] });
  assert.equal(r.status, 409);
  assert.equal(r.body.doc.profile.name, 'Bia');
  assert.equal((await api('GET', '/api/state')).body.tx.length, 2);
  r = await api('PUT', '/api/state', { baseVersion: 1, doc: { profile: { name: 'Bia S.' } }, deletes: ['t2'] });
  assert.equal(r.body.version, 2);
  st = (await api('GET', '/api/state')).body;
  assert.deepEqual(st.tx.map((t) => t.id), ['t1']);
  // usuários não enxergam dados uns dos outros
  const intruso = client();
  await intruso('POST', '/api/auth/signup', { email: 'eve@exemplo.com', password: 'senha-forte-3', name: 'Eve' });
  assert.equal((await intruso('GET', '/api/state')).body.tx.length, 0);
});

test('open finance demo: conectar, transações ao vivo, desconectar, tombstone', async () => {
  const api = client();
  await api('POST', '/api/auth/signup', { email: 'cris@exemplo.com', password: 'senha-forte-4', name: 'Cris' });
  const cfg = (await api('GET', '/api/openfinance/config')).body;
  assert.equal(cfg.provider, 'demo');
  const c = await api('POST', '/api/openfinance/demo/connect', { bank: 'inter' });
  assert.equal(c.status, 200);
  assert.ok(c.body.imported >= 9);
  let st = (await api('GET', '/api/state')).body;
  assert.equal(st.doc.accounts.length, 1);
  assert.equal(st.doc.cards.length, 1);
  assert.equal(st.doc.accounts[0].connected, true);
  const acc = st.doc.accounts[0];
  const sum = st.tx.filter((t) => t.accountId === acc.id).reduce((s, t) => s + t.amount, 0);
  assert.ok(Math.abs(acc.initial + sum - acc.balance) < 0.01, 'saldo = inicial + transações');
  const n = st.tx.length;
  assert.equal((await api('POST', '/api/openfinance/demo/tick')).status, 200);
  st = (await api('GET', '/api/state')).body;
  assert.equal(st.tx.length, n + 1);
  // excluir uma transação bancária cria tombstone
  const del = st.tx[0].id;
  await api('PUT', '/api/state', { deletes: [del] });
  assert.ok(!(await api('GET', '/api/state')).body.tx.some((t) => t.id === del));
  const conns = (await api('GET', '/api/openfinance/connections')).body.connections;
  assert.equal(conns.length, 1);
  assert.equal((await api('DELETE', `/api/openfinance/connections/${conns[0].id}`)).status, 200);
  st = (await api('GET', '/api/state')).body;
  assert.equal(st.doc.accounts[0].connected, false);
  // a conexão de outro usuário não pode ser removida
  const eve = client();
  await eve('POST', '/api/auth/signup', { email: 'eve2@exemplo.com', password: 'senha-forte-5', name: 'Eve' });
  assert.equal((await eve('DELETE', `/api/openfinance/connections/${conns[0].id}`)).status, 404);
});

test('webhook exige segredo e exclusão de conta apaga tudo', async () => {
  const r = await fetch(BASE + '/api/webhooks/pluggy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"event":"item/updated"}' });
  assert.equal(r.status, 401);
  const api = client();
  await api('POST', '/api/auth/signup', { email: 'del@exemplo.com', password: 'senha-forte-6', name: 'Del' });
  await api('PUT', '/api/state', { baseVersion: 0, doc: { a: 1 }, upserts: [{ id: 'x', date: '2026-01-01', desc: 'a', amount: 1 }] });
  assert.equal((await api('POST', '/api/me/delete', { password: 'errada' })).status, 401);
  assert.equal((await api('POST', '/api/me/delete', { password: 'senha-forte-6' })).status, 200);
  const again = client();
  assert.equal((await again('POST', '/api/auth/login', { email: 'del@exemplo.com', password: 'senha-forte-6' })).status, 401);
});
