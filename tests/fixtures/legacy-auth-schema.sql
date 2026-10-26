
    CREATE TABLE IF NOT EXISTS auth_accounts (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      name TEXT NOT NULL,
      employee_id TEXT NOT NULL,
      portal TEXT NOT NULL CHECK(portal IN ('powervision','ubl','technician')),
      role TEXT NOT NULL CHECK(role IN ('ho','vendor','technician','client_ho','branch')),
      vendor TEXT NOT NULL DEFAULT '',
      client TEXT NOT NULL DEFAULT '',
      branch_code TEXT NOT NULL DEFAULT '',
      admin INTEGER NOT NULL DEFAULT 0 CHECK(admin IN (0,1)),
      status TEXT NOT NULL CHECK(status IN ('invited','active','disabled')),
      password_hash TEXT,
      created_at TEXT NOT NULL,
      created_by TEXT NOT NULL,
      activated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS auth_sessions (
      token_hash TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES auth_accounts(id),
      portal TEXT NOT NULL CHECK(portal IN ('powervision','ubl','technician')),
      expires_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS auth_sessions_account ON auth_sessions(account_id);
    CREATE TABLE IF NOT EXISTS auth_tokens (
      token_hash TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES auth_accounts(id),
      purpose TEXT NOT NULL CHECK(purpose IN ('activate','reset')),
      expires_at TEXT NOT NULL,
      used_at TEXT
    );
    CREATE INDEX IF NOT EXISTS auth_tokens_account ON auth_tokens(account_id);
    CREATE TABLE IF NOT EXISTS auth_login_limits (
      bucket TEXT PRIMARY KEY,
      attempts INTEGER NOT NULL CHECK(attempts BETWEEN 1 AND 5),
      window_started_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS auth_audit (
      id INTEGER PRIMARY KEY,
      actor_id TEXT NOT NULL,
      action TEXT NOT NULL,
      account_id TEXT NOT NULL,
      at TEXT NOT NULL,
      payload TEXT NOT NULL
    );
    CREATE TRIGGER IF NOT EXISTS auth_audit_no_update BEFORE UPDATE ON auth_audit BEGIN SELECT RAISE(ABORT,'Account audit history is immutable'); END;
    CREATE TRIGGER IF NOT EXISTS auth_audit_no_delete BEFORE DELETE ON auth_audit BEGIN SELECT RAISE(ABORT,'Account audit history is immutable'); END;
  