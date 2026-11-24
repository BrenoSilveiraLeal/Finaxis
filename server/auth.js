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
    accountBySubject: db.prepare('SELECT user_id FROM auth_accounts WHERE provider = ? AND subject = ?'),
    insAccount: db.prepare('INSERT INTO auth_accounts (provider, subject, user_id, created_at) VALUES (?, ?, ?, ?)'),
  };
  const ipLimit = rateLimiter(30, 15 * 60 * 1000);
  const emailLimit = rateLimiter(8, 15 * 60 * 1000);
  if (!process.env.VERCEL) setInterval(() => Promise.resolve(q.purge.run(Date.now())).catch(() => {}), 60 * 60 * 1000).unref();

  const secureCookie = (req) => process.env.COOKIE_SECURE === 'true' || process.env.VERCEL === '1' || (process.env.TRUST_PROXY === 'true' && req.headers['x-forwarded-proto'] === 'https');

  function sessionCookie(req, token, maxAgeSec) {
    return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secureCookie(req) ? '; Secure' : ''}`;
  }

  async function createSession(req, userId) {
    const token = randomId(32);
    const now = Date.now();
    await q.insSess.run(sha256(token), userId, now, now + SESSION_DAYS * 86400000);
    return sessionCookie(req, token, SESSION_DAYS * 86400);
  }

  async function currentUser(req) {
    const token = parseCookies(req)[COOKIE];
    if (!token) return null;
    const s = await q.getSess.get(sha256(token));
    if (!s || s.expires_at < Date.now()) return null;
    return await q.userById.get(s.user_id) || null;
  }

  async function requireUser(req) {
    const u = await currentUser(req);
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
    if (await q.userByEmail.get(email)) throw new HttpError(409, 'Já existe uma conta com este e-mail');
    const id = 'u_' + randomId(12);
    const hash = await hashPassword(password);
    if (await q.userByEmail.get(email)) throw new HttpError(409, 'Já existe uma conta com este e-mail');
    await q.insUser.run(id, email, name, hash, Date.now());
    return { user: await q.userById.get(id), cookie: await createSession(req, id) };
  }

  async function login(req, { email, password }) {
    email = normEmail(email);
    if (!ipLimit(clientIp(req)) || !emailLimit(email)) throw new HttpError(429, 'Muitas tentativas. Aguarde alguns minutos.');
    const u = await q.userByEmail.get(email);
    const ok = await verifyPassword(String(password || ''), u ? u.pass_hash : DUMMY_HASH);
    if (!u || !ok) throw new HttpError(401, 'E-mail ou senha incorretos');
    return { user: await q.userById.get(u.id), cookie: await createSession(req, u.id) };
  }

  async function loginWithGoogle(req, { subject, email, name }) {
    email = normEmail(email);
    if (!subject || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new HttpError(401, 'A conta Google não retornou um e-mail válido.');
    let account = await q.accountBySubject.get('google', subject);
    let user;
    if (account) {
      user = await q.userById.get(account.user_id);
      if (!user) throw new HttpError(401, 'Não foi possível localizar sua conta.');
    } else {
      user = await q.userByEmail.get(email);
      if (!user) {
        const id = 'u_' + randomId(12);
        const hash = await hashPassword(randomId(48));
        try { await q.insUser.run(id, email, String(name || email.split('@')[0]).trim().slice(0, 60) || 'Usuário', hash, Date.now()); }
        catch (e) {
          if (!await q.userByEmail.get(email)) throw e;
        }
        user = await q.userByEmail.get(email);
      }
      try { await q.insAccount.run('google', subject, user.id, Date.now()); }
      catch (e) {
        account = await q.accountBySubject.get('google', subject);
        if (!account || account.user_id !== user.id) throw new HttpError(409, 'Esta conta Google já está vinculada a outro perfil.');
      }
    }
    return { user, cookie: await createSession(req, user.id) };
  }

  async function logout(req) {
    const token = parseCookies(req)[COOKIE];
    if (token) await q.delSess.run(sha256(token));
    return sessionCookie(req, '', 0);
  }

  async function deleteUser(req, userId, password) {
    const u = await db.prepare('SELECT pass_hash FROM users WHERE id = ?').get(userId);
    if (!u || !(await verifyPassword(String(password || ''), u.pass_hash))) throw new HttpError(401, 'Senha incorreta');
    await q.delUser.run(userId); // cascade: sessões, documento, transações, conexões
    return sessionCookie(req, '', 0);
  }

  return { currentUser, requireUser, signup, login, loginWithGoogle, logout, deleteUser };
}

module.exports = { createAuth, hashPassword, verifyPassword };
