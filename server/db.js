'use strict';
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  email       TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  pass_hash   TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash  TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);

-- Documento do usuário: perfil, ajustes, contas, cartões, caixinhas, orçamentos, recorrentes...
CREATE TABLE IF NOT EXISTS docs (
  user_id     TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data        TEXT NOT NULL,
  version     INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

-- Transações ficam em tabela própria (volume alto, escritas por sync bancário e pelo app)
CREATE TABLE IF NOT EXISTS transactions (
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id          TEXT NOT NULL,
  date        TEXT NOT NULL,
  data        TEXT NOT NULL,
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS tx_user_date ON transactions(user_id, date);

-- Transações bancárias que o usuário excluiu não voltam no próximo sync
CREATE TABLE IF NOT EXISTS tx_tombstones (
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id          TEXT NOT NULL,
  deleted_at  INTEGER NOT NULL,
  PRIMARY KEY (user_id, id)
);

-- Conexões Open Finance (um "item" do agregador = um banco autorizado)
CREATE TABLE IF NOT EXISTS connections (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider      TEXT NOT NULL,
  external_id   TEXT NOT NULL,
  bank_key      TEXT,
  bank_name     TEXT,
  bank_color    TEXT,
  status        TEXT NOT NULL DEFAULT 'active',
  last_sync_at  INTEGER,
  last_error    TEXT,
  created_at    INTEGER NOT NULL,
  UNIQUE (provider, external_id)
);
CREATE INDEX IF NOT EXISTS conn_user ON connections(user_id);

CREATE TABLE IF NOT EXISTS webhook_events (
  event_id     TEXT PRIMARY KEY,
  received_at  INTEGER NOT NULL
);
`;

function openDb(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(SCHEMA);
  db.atomic = (fn) => {
    db.exec('BEGIN IMMEDIATE');
    try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
  };
  return db;
}

module.exports = { openDb };
