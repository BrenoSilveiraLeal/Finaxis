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
const crypto = require('crypto');

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

route('POST', '/api/auth/logout', async (req, res) => { res.setHeader('Set-Cookie', await auth.logout(req)); return { ok: true }; }, { public: true });

const googleConfigured = () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REDIRECT_URI);
const oauthCookie = (req, name, value, maxAge) => `${name}=${value}; Path=/api/auth/google; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${process.env.COOKIE_SECURE === 'true' || process.env.VERCEL === '1' ? '; Secure' : ''}`;
route('GET', '/api/auth/providers', () => ({ google: googleConfigured() }), { public: true });
route('GET', '/api/auth/google', (req, res) => {
  if (!googleConfigured()) throw new HttpError(503, 'Login com Google ainda não foi configurado.');
  const state = crypto.randomBytes(32).toString('base64url');
  const nonce = crypto.randomBytes(32).toString('base64url');
  const verifier = crypto.randomBytes(48).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const cookies = [
    oauthCookie(req, 'fx_g_state', state, 600),
    oauthCookie(req, 'fx_g_nonce', nonce, 600),
    oauthCookie(req, 'fx_g_verifier', verifier, 600),
  ];
  const target = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  for (const [k, v] of Object.entries({ client_id: process.env.GOOGLE_CLIENT_ID, redirect_uri: process.env.GOOGLE_REDIRECT_URI, response_type: 'code', scope: 'openid email profile', state, nonce, code_challenge: challenge, code_challenge_method: 'S256', prompt: 'select_account' })) target.searchParams.set(k, v);
  res.writeHead(302, { Location: target.toString(), 'Set-Cookie': cookies, 'Cache-Control': 'no-store' });
  res.end();
}, { public: true });
route('GET', '/api/auth/google/callback', async (req, res, { url }) => {
  const clear = ['fx_g_state', 'fx_g_nonce', 'fx_g_verifier'].map((n) => oauthCookie(req, n, '', 0));
  const fail = (reason) => { res.writeHead(302, { Location: `/app.html?google_error=${encodeURIComponent(reason)}`, 'Set-Cookie': clear, 'Cache-Control': 'no-store' }); res.end(); };
  try {
    if (!googleConfigured()) return fail('not_configured');
    if (url.searchParams.has('error')) return fail('cancelled');
    const cookies = util.parseCookies(req);
    const state = url.searchParams.get('state');
    const code = url.searchParams.get('code');
    if (!state || !code || !cookies.fx_g_state || state !== cookies.fx_g_state || !cookies.fx_g_nonce || !cookies.fx_g_verifier) return fail('invalid_state');
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, redirect_uri: process.env.GOOGLE_REDIRECT_URI, grant_type: 'authorization_code', code_verifier: cookies.fx_g_verifier }) });
    const tokens = await tokenResponse.json();
    if (!tokenResponse.ok || !tokens.id_token) return fail('token_exchange');
    const infoResponse = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(tokens.id_token)}`);
    const info = await infoResponse.json();
    const issuerOk = ['accounts.google.com', 'https://accounts.google.com'].includes(info.iss);
    if (!infoResponse.ok || info.aud !== process.env.GOOGLE_CLIENT_ID || !issuerOk || Number(info.exp) * 1000 <= Date.now() || info.nonce !== cookies.fx_g_nonce || ![true, 'true'].includes(info.email_verified)) return fail('invalid_identity');
    const { cookie } = await auth.loginWithGoogle(req, { subject: info.sub, email: info.email, name: info.name });
    res.writeHead(302, { Location: '/app.html?auth=google', 'Set-Cookie': [...clear, cookie], 'Cache-Control': 'no-store' });
    res.end();
  } catch (error) {
    console.error('[google oauth]', error.message);
    fail('authentication_failed');
  }
}, { public: true });

route('GET', '/api/me', (req, res, { user }) => ({ user }));

route('POST', '/api/me/delete', async (req, res, { user, body }) => {
  for (const c of await of.list(user)) await of.disconnect(user, c.id).catch(() => {});
  res.setHeader('Set-Cookie', await auth.deleteUser(req, user.id, body.password));
  return { ok: true };
});

route('GET', '/api/state', async (req, res, { user }) => store.getState(user.id));

route('PUT', '/api/state', async (req, res, { user, body }) => {
  const r = await store.applyClientChanges(user.id, body);
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
route('GET', '/api/openfinance/connections', async (req, res, { user }) => ({ connections: await of.list(user) }));
route('POST', '/api/openfinance/connect-token', async (req, res, { user }) => ({ accessToken: await of.connectToken(user) }));
route('POST', '/api/openfinance/items', async (req, res, { user, body }) => of.registerItem(user, body.itemId));
route('POST', '/api/openfinance/sync', async (req, res, { user, body }) => of.syncUser(user, body.connectionId));
route('DELETE', '/api/openfinance/connections/:id', async (req, res, { user, params }) => of.disconnect(user, params.id));
route('POST', '/api/openfinance/demo/connect', async (req, res, { user, body }) => {
  if (of.provider !== 'demo') throw new HttpError(400, 'Modo demonstração desativado: use o Pluggy');
  return of.demoConnect(user, String(body.bank || ''));
});
route('POST', '/api/openfinance/demo/tick', async (req, res, { user }) => {
  const r = await of.demoTick(user.id);
  if (!r) throw new HttpError(400, 'Conecte um banco de demonstração primeiro');
  return r;
});

// Webhook do Pluggy: sem sessão/CSRF, autenticado pelo cabeçalho secreto; responde 200 em seguida e processa depois
route('POST', '/api/webhooks/pluggy', async (req, res, { body }) => {
  if (!of.webhookAuthorized(req, body)) throw new HttpError(401, 'Não autorizado');
  const processing = of.handleWebhook(body).catch((e) => console.error('[webhook]', e.message));
  if (process.env.VERCEL) {
    require('@vercel/functions').waitUntil(processing);
    return { received: true };
  }
  await processing;
  return { received: true };
}, { public: true, noCsrf: true });

/* --------------------------------------------------------------- servidor */
async function handle(req, res) {
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
    const user = match.opts.public ? null : await auth.requireUser(req);
    const body = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) ? await readJson(req) : {};
    const out = await match.handler(req, res, { user, body, params, url });
    if (out !== undefined && !res.headersSent) sendJson(res, res.statusCode && res.statusCode !== 200 ? res.statusCode : 200, out);
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    if (status === 500) console.error('[erro]', req.method, url.pathname, e);
    if (!res.headersSent) sendJson(res, status, { error: status === 500 ? 'Erro interno. Tente de novo.' : e.message, ...(e.extra || {}) });
    else res.end();
  }
}

module.exports = handle;
const server = http.createServer(handle);

if (!process.env.VERCEL) server.listen(PORT, HOST, () => {
  console.log(`Finaxis rodando em http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  console.log(`Open Finance: ${of.provider === 'pluggy' ? 'Pluggy' + (of.config().sandbox ? ' (sandbox visível)' : '') : 'modo demonstração (defina PLUGGY_CLIENT_ID/SECRET no .env para usar bancos reais)'}`);
  of.start();
});

if (!process.env.VERCEL) {
  const shutdown = () => { server.close(); try { db.close(); } catch { /* ignore */ } process.exit(0); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
