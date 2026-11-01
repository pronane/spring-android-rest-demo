-- Twenty-Eight —- SQLite schema (local file, or Turso over libSQL).
--
-- Applied by `npm run db:migrate` (scripts/db-migrate.mjs) when the URL is a
-- `file:` or `libsql:` one. Every statement is idempotent, so re-running it is
-- safe.
--
-- The same eight tables as db/schema.sql, with the types SQLite actually has:
-- timestamps are ISO-8601 TEXT, money is INTEGER cents, booleans are INTEGER 0/1,
-- and the nested parts of an entry (squad, predictions, transfers, armband) are
-- JSON kept in TEXT. `lib/server/store-shape.ts` normalises the difference, so
-- the rules in db.ts never learn which database is underneath.

PRAGMA foreign_keys = ON;

-- Players. One row per account; `identities` holds the social sign-ins attached
-- to it (see lib/server/oauth.ts), one per provider.
CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  email       TEXT NOT NULL,
  manager     TEXT NOT NULL,
  team_name   TEXT NOT NULL DEFAULT 'My card',
  created_at  TEXT NOT NULL,
  entry       TEXT,
  identities  TEXT NOT NULL DEFAULT '[]'
);

-- Emails are compared lower-cased everywhere in the app, so the index matches.
CREATE UNIQUE INDEX IF NOT EXISTS users_email_key ON users (lower(email));
CREATE INDEX IF NOT EXISTS users_entry_ref_idx ON users (json_extract(entry, '$.ref'));

-- Private leagues shared between accounts.
CREATE TABLE IF NOT EXISTS leagues (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  code        TEXT NOT NULL UNIQUE,
  owner_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  buy_in      INTEGER NOT NULL DEFAULT 0,
  member_ids  TEXT NOT NULL DEFAULT '[]',
  created_at  TEXT NOT NULL
);

-- Payment attempts. An entry exists only once its order is `paid`.
CREATE TABLE IF NOT EXISTS orders (
  ref              TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  email            TEXT NOT NULL,
  plan_id          TEXT NOT NULL,
  plan_name        TEXT NOT NULL,
  amount_cents     INTEGER NOT NULL,
  currency         TEXT NOT NULL DEFAULT 'EUR',
  edition_id       TEXT NOT NULL,
  prize_eligible   INTEGER NOT NULL DEFAULT 0,
  status           TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'failed', 'refunded')),
  provider         TEXT NOT NULL CHECK (provider IN ('demo', 'stripe')),
  referral_code    TEXT,
  provider_ref     TEXT,
  created_at       TEXT NOT NULL,
  paid_at          TEXT,
  refunded_at      TEXT,
  note             TEXT
);

CREATE INDEX IF NOT EXISTS orders_user_idx ON orders (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS orders_provider_ref_key
  ON orders (provider_ref) WHERE provider_ref IS NOT NULL;

-- Every movement of money, in cents. One payment writes three rows.
CREATE TABLE IF NOT EXISTS ledger (
  id            TEXT PRIMARY KEY,
  at            TEXT NOT NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('entry_fee', 'platform_fee', 'prize_pool', 'refund', 'prize_payout')),
  amount_cents  INTEGER NOT NULL,
  edition_id    TEXT NOT NULL,
  order_ref     TEXT REFERENCES orders (ref) ON DELETE SET NULL,
  user_id       TEXT REFERENCES users (id) ON DELETE SET NULL,
  memo          TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS ledger_at_idx ON ledger (at);
CREATE INDEX IF NOT EXISTS ledger_order_idx ON ledger (order_ref);

-- A settled prize position, per edition and per pot (league or global).
CREATE TABLE IF NOT EXISTS prizes (
  id            TEXT PRIMARY KEY,
  edition_id    TEXT NOT NULL,
  league_id     TEXT,
  pot_cents     INTEGER NOT NULL,
  user_id       TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  team_name     TEXT NOT NULL,
  place         INTEGER NOT NULL,
  label         TEXT NOT NULL,
  amount_cents  INTEGER NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('awarded', 'paid')),
  settled_at    TEXT NOT NULL,
  paid_at       TEXT
);

CREATE INDEX IF NOT EXISTS prizes_pot_idx ON prizes (edition_id, league_id);

-- One-time email sign-in links. Only the SHA-256 of the token is stored.
CREATE TABLE IF NOT EXISTS login_tokens (
  hash        TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at  TEXT NOT NULL,
  used        INTEGER NOT NULL DEFAULT 0
);

-- Provider webhook ids already applied, so a retried delivery is a no-op.
CREATE TABLE IF NOT EXISTS webhook_events (
  id           TEXT PRIMARY KEY,
  received_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Operator corrections to match results and awards. One row.
CREATE TABLE IF NOT EXISTS results (
  id    TEXT PRIMARY KEY DEFAULT 'current',
  data  TEXT NOT NULL
);
