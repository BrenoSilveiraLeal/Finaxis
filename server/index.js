'use strict';
/**
 * Finaxis — servidor (Node 22.13+ / 24+, sem dependências externas)
 *   node server/index.js
 * Configuração em .env (veja .env.example).
 */
const http = require('http');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const util = require('./util');
util.loadEnv(path.join(ROOT, '.env'));

const { HttpError, readJson, sendJson, serveStatic } = util;
const { openDb } = require('./db');
const { createStore } = require('./store');
const { createAuth } = require('./auth');
const { createEvents } = require('./events');
const { createOpenFinance } = require('./openfinance/service');

const PORT = Number(process.env.PORT) || 5173;
const HOST = process.env.HOST || '127.0.0.1';
const db = openDb(path.resolve(ROOT, process.env.DB_FILE || 'data/finaxis.db'));
const store = createStore(db);
const auth = createAuth(db);
const events = createEvents();
const of = createOpenFinance({ db, store, events });

const CSP = [
  "default-src 'self'",
  "script-src 'self' https://cdn.pluggy.ai",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: https:",
  "connect-src 'self' https://*.pluggy.ai",
  'frame-src https://*.pluggy.ai',
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

function securityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', CSP);
}

/** CSRF: toda escrita na API precisa do cabeçalho X-Finaxis (formulários de outros sites não conseguem enviá-lo). */
function checkCsrf(req) {
  if (req.headers['x-finaxis'] !== '1') throw new HttpError(403, 'Requisição bloqueada');
  const origin = req.headers.origin;
  if (origin && new URL(origin).host !== req.headers.host) throw new HttpError(403, 'Origem não permitida');
}

const routes = [];
const route = (method, pattern, handler, opts = {}) => routes.push({ method, re: new RegExp(`^${pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)')}$`), handler, opts });

/* ------------------------------------------------------------------ rotas */
route('GET', '/api/health', () => ({ ok: true, provider: of.provider }), { public: true });

route('POST', '/api/auth/signup', async (req, res, { body }) => {
  const { user, cookie } = await auth.signup(req, body);
  res.setHeader('Set-Cookie', cookie);
  return { user };
}, { public: true });

route('POST', '/api/auth/login', async (req, res, { body }) => {
  const { user, cookie } = await auth.login(req, body);
  res.setHeader('Set-Cookie', cookie);
  return { user };
}, { public: true });

route('POST', '/api/auth/logout', (req, res) => { res.setHeader('Set-Cookie', auth.logout(req)); return { ok: true }; }, { public: true });

route('GET', '/api/me', (req, res, { user }) => ({ user }));

route('POST', '/api/me/delete', async (req, res, { user, body }) => {
  for (const c of of.list(user)) await of.disconnect(user, c.id).catch(() => {});
  res.setHeader('Set-Cookie', await auth.deleteUser(req, user.id, body.password));
  return { ok: true };
});

route('GET', '/api/state', (req, res, { user }) => store.getState(user.id));

route('PUT', '/api/state', (req, res, { user, body }) => {
  const r = store.applyClientChanges(user.id, body);
  const clientId = String(req.headers['x-client-id'] || '');
  if (r.ok) events.emit(user.id, { type: 'client-save', version: r.version }, clientId);
  if (r.conflict) res.statusCode = 409;
  return r;
});

route('GET', '/api/events', (req, res, { user, url }) => {
  events.subscribe(req, res, user.id, url.searchParams.get('client') || '');
  return undefined; // resposta mantida aberta (SSE)
});

route('GET', '/api/openfinance/config', () => of.config());
route('GET', '/api/openfinance/connections', (req, res, { user }) => ({ connections: of.list(user) }));
route('POST', '/api/openfinance/connect-token', async (req, res, { user }) => ({ accessToken: await of.connectToken(user) }));
route('POST', '/api/openfinance/items', async (req, res, { user, body }) => of.registerItem(user, body.itemId));
route('POST', '/api/openfinance/sync', async (req, res, { user, body }) => of.syncUser(user, body.connectionId));
route('DELETE', '/api/openfinance/connections/:id', async (req, res, { user, params }) => of.disconnect(user, params.id));
route('POST', '/api/openfinance/demo/connect', (req, res, { user, body }) => {
  if (of.provider !== 'demo') throw new HttpError(400, 'Modo demonstração desativado: use o Pluggy');
  return of.demoConnect(user, String(body.bank || ''));
});
route('POST', '/api/openfinance/demo/tick', (req, res, { user }) => {
  const r = of.demoTick(user.id);
  if (!r) throw new HttpError(400, 'Conecte um banco de demonstração primeiro');
  return r;
});

// Webhook do Pluggy: sem sessão/CSRF, autenticado pelo cabeçalho secreto; responde 200 em seguida e processa depois
route('POST', '/api/webhooks/pluggy', (req, res, { body }) => {
  if (!of.webhookAuthorized(req, body)) throw new HttpError(401, 'Não autorizado');
  setImmediate(() => of.handleWebhook(body).catch((e) => console.error('[webhook]', e.message)));
  return { ok: true };
}, { public: true, noCsrf: true });

/* --------------------------------------------------------------- servidor */
const server = http.createServer(async (req, res) => {
  securityHeaders(res);
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (!url.pathname.startsWith('/api/')) {
      if ((req.method === 'GET' || req.method === 'HEAD') && serveStatic(ROOT, req, res)) return;
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Não encontrado');
    }
    let match = null, params = {};
    for (const r of routes) {
      if (r.method !== req.method) continue;
      const m = url.pathname.match(r.re);
      if (m) { match = r; params = m.groups || {}; break; }
    }
    if (!match) throw new HttpError(404, 'Rota não encontrada');
    if (req.method !== 'GET' && !match.opts.noCsrf) checkCsrf(req);
    const user = match.opts.public ? null : auth.requireUser(req);
    const body = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) ? await readJson(req) : {};
    const out = await match.handler(req, res, { user, body, params, url });
    if (out !== undefined && !res.headersSent) sendJson(res, res.statusCode && res.statusCode !== 200 ? res.statusCode : 200, out);
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    if (status === 500) console.error('[erro]', req.method, url.pathname, e);
    if (!res.headersSent) sendJson(res, status, { error: status === 500 ? 'Erro interno. Tente de novo.' : e.message, ...(e.extra || {}) });
    else res.end();
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Finaxis rodando em http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  console.log(`Open Finance: ${of.provider === 'pluggy' ? 'Pluggy' + (of.config().sandbox ? ' (sandbox visível)' : '') : 'modo demonstração (defina PLUGGY_CLIENT_ID/SECRET no .env para usar bancos reais)'}`);
  of.start();
});

const shutdown = () => { server.close(); try { db.close(); } catch { /* ignore */ } process.exit(0); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
