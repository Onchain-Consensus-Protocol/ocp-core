CREATE TABLE IF NOT EXISTS ocp_paper_users (
  id text PRIMARY KEY,
  subject text NOT NULL UNIQUE,
  email text NOT NULL,
  name text NOT NULL,
  balance_micros bigint NOT NULL DEFAULT 0 CHECK (balance_micros >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ocp_paper_grants (
  user_id text NOT NULL REFERENCES ocp_paper_users(id),
  grant_type text NOT NULL,
  amount_micros bigint NOT NULL CHECK (amount_micros > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, grant_type)
);
CREATE TABLE IF NOT EXISTS ocp_paper_markets (
  id text PRIMARY KEY,
  creator_id text NOT NULL REFERENCES ocp_paper_users(id),
  revision bigint NOT NULL CHECK (revision >= 0),
  document jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ocp_paper_requests (
  user_id text NOT NULL REFERENCES ocp_paper_users(id),
  request_id text NOT NULL,
  payload_hash text NOT NULL,
  market_id text NOT NULL REFERENCES ocp_paper_markets(id),
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, request_id)
);
CREATE TABLE IF NOT EXISTS ocp_paper_journal (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES ocp_paper_users(id),
  request_id text,
  market_id text REFERENCES ocp_paper_markets(id),
  kind text NOT NULL CHECK (kind IN ('INITIAL_GRANT', 'MUTATION')),
  delta_micros bigint NOT NULL,
  balance_before_micros bigint NOT NULL,
  balance_after_micros bigint NOT NULL CHECK (balance_after_micros >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (balance_after_micros = balance_before_micros + delta_micros),
  UNIQUE (user_id, request_id)
);
CREATE INDEX IF NOT EXISTS ocp_paper_markets_created_idx ON ocp_paper_markets(created_at DESC, id);
CREATE TABLE IF NOT EXISTS ocp_paper_share_snapshots (
  id uuid PRIMARY KEY,
  user_id text NOT NULL REFERENCES ocp_paper_users(id),
  request_id text NOT NULL,
  market_id text NOT NULL REFERENCES ocp_paper_markets(id),
  theme text NOT NULL CHECK (theme IN ('light','dark')),
  document jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,request_id)
);
CREATE INDEX IF NOT EXISTS ocp_paper_share_user_created_idx ON ocp_paper_share_snapshots(user_id,created_at);
