'use strict';
const crypto = require('crypto');
const { HttpError, parseCookies, sha256, randomId, rateLimiter, clientIp } = require('./util');

const COOKIE = 'fx_sid';
const SESSION_DAYS = 30;
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

const scrypt = (pw, salt, len, opts) => new Promise((ok, fail) => crypto.scrypt(pw, salt, len, opts, (e, k) => (e ? fail(e) : ok(k))));

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

async function verifyPassword(password, stored) {
  const [alg, N, r, p, salt, hash] = String(stored).split('$');
  if (alg !== 'scrypt') return false;
  const expected = Buffer.from(hash, 'base64');
  const got = await scrypt(password, Buffer.from(salt, 'base64'), expected.length, { N: +N, r: +r, p: +p });
  return crypto.timingSafeEqual(expected, got);
}

// Hash fixo para comparar quando o e-mail não existe (tempo de resposta igual)
const DUMMY_SALT = crypto.randomBytes(16);
const DUMMY_HASH = `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${DUMMY_SALT.toString('base64')}$${crypto.scryptSync(randomId(16), DUMMY_SALT, 64).toString('base64')}`;

function createAuth(db) {
  const q = {
    userByEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
    userById: db.prepare('SELECT id, email, name, created_at FROM users WHERE id = ?'),
    insUser: db.prepare('INSERT INTO users (id, email, name, pass_hash, created_at) VALUES (?, ?, ?, ?, ?)'),
    insSess: db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'),
    getSess: db.prepare('SELECT user_id, expires_at FROM sessions WHERE token_hash = ?'),
    delSess: db.prepare('DELETE FROM sessions WHERE token_hash = ?'),
    purge: db.prepare('DELETE FROM sessions WHERE expires_at < ?'),
    delUser: db.prepare('DELETE FROM users WHERE id = ?'),
  };
  const ipLimit = rateLimiter(30, 15 * 60 * 1000);
  const emailLimit = rateLimiter(8, 15 * 60 * 1000);
  setInterval(() => q.purge.run(Date.now()), 60 * 60 * 1000).unref();

  const secureCookie = (req) => process.env.COOKIE_SECURE === 'true' || (process.env.TRUST_PROXY === 'true' && req.headers['x-forwarded-proto'] === 'https');

  function sessionCookie(req, token, maxAgeSec) {
    return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secureCookie(req) ? '; Secure' : ''}`;
  }

  function createSession(req, userId) {
    const token = randomId(32);
    const now = Date.now();
    q.insSess.run(sha256(token), userId, now, now + SESSION_DAYS * 86400000);
    return sessionCookie(req, token, SESSION_DAYS * 86400);
  }

  function currentUser(req) {
    const token = parseCookies(req)[COOKIE];
    if (!token) return null;
    const s = q.getSess.get(sha256(token));
    if (!s || s.expires_at < Date.now()) return null;
    return q.userById.get(s.user_id) || null;
  }

  function requireUser(req) {
    const u = currentUser(req);
    if (!u) throw new HttpError(401, 'Faça login para continuar');
    return u;
  }

  const normEmail = (e) => String(e || '').trim().toLowerCase();

  async function signup(req, { email, password, name }) {
    email = normEmail(email);
    name = String(name || '').trim().slice(0, 60);
    if (!ipLimit(clientIp(req))) throw new HttpError(429, 'Muitas tentativas. Aguarde alguns minutos.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 160) throw new HttpError(400, 'E-mail inválido');
    if (typeof password !== 'string' || password.length < 8 || password.length > 200) throw new HttpError(400, 'A senha precisa ter pelo menos 8 caracteres');
    if (!name) throw new HttpError(400, 'Informe seu nome');
    if (q.userByEmail.get(email)) throw new HttpError(409, 'Já existe uma conta com este e-mail');
    const id = 'u_' + randomId(12);
    const hash = await hashPassword(password);
    if (q.userByEmail.get(email)) throw new HttpError(409, 'Já existe uma conta com este e-mail');
    q.insUser.run(id, email, name, hash, Date.now());
    return { user: q.userById.get(id), cookie: createSession(req, id) };
  }

  async function login(req, { email, password }) {
    email = normEmail(email);
    if (!ipLimit(clientIp(req)) || !emailLimit(email)) throw new HttpError(429, 'Muitas tentativas. Aguarde alguns minutos.');
    const u = q.userByEmail.get(email);
    const ok = await verifyPassword(String(password || ''), u ? u.pass_hash : DUMMY_HASH);
    if (!u || !ok) throw new HttpError(401, 'E-mail ou senha incorretos');
    return { user: q.userById.get(u.id), cookie: createSession(req, u.id) };
  }

  function logout(req) {
    const token = parseCookies(req)[COOKIE];
    if (token) q.delSess.run(sha256(token));
    return sessionCookie(req, '', 0);
  }

  async function deleteUser(req, userId, password) {
    const u = db.prepare('SELECT pass_hash FROM users WHERE id = ?').get(userId);
    if (!u || !(await verifyPassword(String(password || ''), u.pass_hash))) throw new HttpError(401, 'Senha incorreta');
    q.delUser.run(userId); // cascade: sessões, documento, transações, conexões
    return sessionCookie(req, '', 0);
  }

  return { currentUser, requireUser, signup, login, logout, deleteUser };
}

module.exports = { createAuth, hashPassword, verifyPassword };
