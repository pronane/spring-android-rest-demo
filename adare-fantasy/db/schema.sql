-- Twenty-Eight — Postgres schema.
--
-- Applied by `npm run db:migrate` (scripts/db-migrate.mjs), which the installer
-- runs for you when you choose the Postgres store. Every statement is idempotent,
-- so re-running the migration on an existing database is safe.
--
-- The store is a document with seven collections and one singleton, so each
-- collection is a table: the fields the app filters or sorts on are real
-- columns, and the nested parts of an entry (squad, predictions, transfers,
-- armband) stay jsonb. That keeps the Postgres and file backends byte-identical
-- from the app's point of view — `lib/server/db.ts` is the only reader of either.

BEGIN;

-- Players. One row per account; `identities` holds the social sign-ins attached
-- to it (see lib/server/oauth.ts), one per provider.
CREATE TABLE IF NOT EXISTS users (
  id          text PRIMARY KEY,
  email       text NOT NULL,
  manager     text NOT NULL,
  team_name   text NOT NULL DEFAULT 'My card',
  created_at  timestamptz NOT NULL,
  entry       jsonb,
  identities  jsonb NOT NULL DEFAULT '[]'::jsonb
);

-- Emails are compared lower-cased everywhere in the app, so the index matches.
CREATE UNIQUE INDEX IF NOT EXISTS users_email_key ON users (lower(email));
CREATE INDEX IF NOT EXISTS users_entry_ref_idx ON users ((entry ->> 'ref'));

-- Private leagues shared between accounts.
CREATE TABLE IF NOT EXISTS leagues (
  id          text PRIMARY KEY,
  name        text NOT NULL,
  code        text NOT NULL UNIQUE,
  owner_id    text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  buy_in      integer NOT NULL DEFAULT 0,
  member_ids  jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at  timestamptz NOT NULL
);

-- Payment attempts. An entry exists only once its order is `paid`.
CREATE TABLE IF NOT EXISTS orders (
  ref              text PRIMARY KEY,
  user_id          text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  email            text NOT NULL,
  plan_id          text NOT NULL,
  plan_name        text NOT NULL,
  amount_cents     bigint NOT NULL,
  currency         text NOT NULL DEFAULT 'EUR',
  edition_id       text NOT NULL,
  prize_eligible   boolean NOT NULL DEFAULT false,
  status           text NOT NULL CHECK (status IN ('pending', 'paid', 'failed', 'refunded')),
  provider         text NOT NULL CHECK (provider IN ('demo', 'stripe')),
  referral_code    text,
  provider_ref     text,
  created_at       timestamptz NOT NULL,
  paid_at          timestamptz,
  refunded_at      timestamptz,
  note             text
);

CREATE INDEX IF NOT EXISTS orders_user_idx ON orders (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS orders_provider_ref_key
  ON orders (provider_ref) WHERE provider_ref IS NOT NULL;

-- Every movement of money, in cents. One payment writes three rows.
CREATE TABLE IF NOT EXISTS ledger (
  id            text PRIMARY KEY,
  at            timestamptz NOT NULL,
  kind          text NOT NULL CHECK (kind IN ('entry_fee', 'platform_fee', 'prize_pool', 'refund', 'prize_payout')),
  amount_cents  bigint NOT NULL,
  edition_id    text NOT NULL,
  order_ref     text REFERENCES orders (ref) ON DELETE SET NULL,
  user_id       text REFERENCES users (id) ON DELETE SET NULL,
  memo          text NOT NULL
);

CREATE INDEX IF NOT EXISTS ledger_at_idx ON ledger (at);
CREATE INDEX IF NOT EXISTS ledger_order_idx ON ledger (order_ref);

-- A settled prize position, per edition and per pot (league or global).
CREATE TABLE IF NOT EXISTS prizes (
  id            text PRIMARY KEY,
  edition_id    text NOT NULL,
  league_id     text,
  pot_cents     bigint NOT NULL,
  user_id       text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  team_name     text NOT NULL,
  place         integer NOT NULL,
  label         text NOT NULL,
  amount_cents  bigint NOT NULL,
  status        text NOT NULL CHECK (status IN ('awarded', 'paid')),
  settled_at    timestamptz NOT NULL,
  paid_at       timestamptz
);

CREATE INDEX IF NOT EXISTS prizes_pot_idx ON prizes (edition_id, league_id);

-- One-time email sign-in links. Only the SHA-256 of the token is stored.
CREATE TABLE IF NOT EXISTS login_tokens (
  hash        text PRIMARY KEY,
  user_id     text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at  timestamptz NOT NULL,
  used        boolean NOT NULL DEFAULT false
);

-- Provider webhook ids already applied, so a retried delivery is a no-op.
CREATE TABLE IF NOT EXISTS webhook_events (
  id           text PRIMARY KEY,
  received_at  timestamptz NOT NULL DEFAULT now()
);

-- Operator corrections to match results and awards. One row.
CREATE TABLE IF NOT EXISTS results (
  id    text PRIMARY KEY DEFAULT 'current',
  data  jsonb NOT NULL
);

COMMIT;
