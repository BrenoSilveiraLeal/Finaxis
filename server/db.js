'use strict';
const fs = require('fs');
const path = require('path');
const { AsyncLocalStorage } = require('node:async_hooks');

const PG_SCHEMA = `
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, pass_hash TEXT NOT NULL, created_at DOUBLE PRECISION NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at DOUBLE PRECISION NOT NULL, expires_at DOUBLE PRECISION NOT NULL);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS auth_accounts (provider TEXT NOT NULL, subject TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at DOUBLE PRECISION NOT NULL, PRIMARY KEY(provider, subject), UNIQUE(provider, user_id));
CREATE TABLE IF NOT EXISTS docs (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, data TEXT NOT NULL, version INTEGER NOT NULL, updated_at DOUBLE PRECISION NOT NULL);
CREATE TABLE IF NOT EXISTS transactions (user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, id TEXT NOT NULL, date TEXT NOT NULL, data TEXT NOT NULL, updated_at DOUBLE PRECISION NOT NULL, PRIMARY KEY (user_id,id));
CREATE INDEX IF NOT EXISTS tx_user_date ON transactions(user_id,date);
CREATE TABLE IF NOT EXISTS tx_tombstones (user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,id TEXT NOT NULL,deleted_at DOUBLE PRECISION NOT NULL,PRIMARY KEY(user_id,id));
CREATE TABLE IF NOT EXISTS connections (id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,provider TEXT NOT NULL,external_id TEXT NOT NULL,bank_key TEXT,bank_name TEXT,bank_color TEXT,status TEXT NOT NULL DEFAULT 'active',last_sync_at DOUBLE PRECISION,last_error TEXT,created_at DOUBLE PRECISION NOT NULL,UNIQUE(provider,external_id));
CREATE INDEX IF NOT EXISTS conn_user ON connections(user_id);
CREATE TABLE IF NOT EXISTS webhook_events (event_id TEXT PRIMARY KEY,received_at DOUBLE PRECISION NOT NULL);
CREATE TABLE IF NOT EXISTS connection_accounts (external_account_id TEXT PRIMARY KEY,connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE CASCADE);
`;

const SQLITE_SCHEMA = `
PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE,name TEXT NOT NULL,pass_hash TEXT NOT NULL,created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS auth_accounts (provider TEXT NOT NULL,subject TEXT NOT NULL,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,created_at INTEGER NOT NULL,PRIMARY KEY(provider,subject),UNIQUE(provider,user_id));
CREATE TABLE IF NOT EXISTS docs (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,data TEXT NOT NULL,version INTEGER NOT NULL,updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS transactions (user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,id TEXT NOT NULL,date TEXT NOT NULL,data TEXT NOT NULL,updated_at INTEGER NOT NULL,PRIMARY KEY(user_id,id));
CREATE INDEX IF NOT EXISTS tx_user_date ON transactions(user_id,date);
CREATE TABLE IF NOT EXISTS tx_tombstones (user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,id TEXT NOT NULL,deleted_at INTEGER NOT NULL,PRIMARY KEY(user_id,id));
CREATE TABLE IF NOT EXISTS connections (id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,provider TEXT NOT NULL,external_id TEXT NOT NULL,bank_key TEXT,bank_name TEXT,bank_color TEXT,status TEXT NOT NULL DEFAULT 'active',last_sync_at INTEGER,last_error TEXT,created_at INTEGER NOT NULL,UNIQUE(provider,external_id));
CREATE INDEX IF NOT EXISTS conn_user ON connections(user_id);
CREATE TABLE IF NOT EXISTS webhook_events (event_id TEXT PRIMARY KEY,received_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS connection_accounts (external_account_id TEXT PRIMARY KEY,connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE CASCADE);
`;

function pgQueryText(input) {
  let count = 0;
  let sql = input.replace(/\?/g, () => '$' + (++count));
  if (/^\s*INSERT OR IGNORE INTO/i.test(sql)) sql = sql.replace(/^\s*INSERT OR IGNORE INTO/i, 'INSERT INTO') + ' ON CONFLICT DO NOTHING';
  if (/^\s*INSERT OR REPLACE INTO connection_accounts/i.test(sql)) sql = sql.replace(/^\s*INSERT OR REPLACE INTO/i, 'INSERT INTO') + ' ON CONFLICT (external_account_id) DO UPDATE SET connection_id = EXCLUDED.connection_id';
  return sql;
}

function openDb(file) {
  if (process.env.VERCEL && !process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL é obrigatório na Vercel; SQLite local não persiste entre execuções.');
  }
  if (process.env.DATABASE_URL) {
    const { Pool } = require('@neondatabase/serverless');
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const als = new AsyncLocalStorage();
    const ready = pool.query(PG_SCHEMA);
    const execute = async (sql, params = []) => { await ready; return (als.getStore() || pool).query(pgQueryText(sql), params); };
    const db = {
      prepare(sql) {
        return {
          get: async (...params) => (await execute(sql, params)).rows[0],
          all: async (...params) => (await execute(sql, params)).rows,
          run: async (...params) => { const r = await execute(sql, params); return { changes: r.rowCount || 0 }; },
        };
      },
      exec: async (sql) => { await ready; await (als.getStore() || pool).query(sql); },
      atomic: (fn) => ready.then(() => pool.connect()).then(async (client) => {
        try { await client.query('BEGIN'); const result = await als.run(client, fn); await client.query('COMMIT'); return result; }
        catch (e) { await client.query('ROLLBACK'); throw e; }
        finally { client.release(); }
      }),
      close: () => pool.end(),
    };
    return db;
  }
  const { DatabaseSync } = require('node:sqlite');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(SQLITE_SCHEMA);
  db.atomic = async (fn) => { db.exec('BEGIN IMMEDIATE'); try { const r = await fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } };
  return db;
}

module.exports = { openDb };
