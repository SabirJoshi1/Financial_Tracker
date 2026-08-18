-- =============================================================
-- Financial Tracker - PostgreSQL / Supabase schema
--
-- Run this in the Supabase SQL editor, or with psql:
--   psql "postgresql://postgres:YOUR_PASSWORD@db.xxxx.supabase.co:5432/postgres" -f database/schema.sql
--
-- Tables are created in the connected database's public schema.
-- Amounts use NUMERIC/DECIMAL (never FLOAT/REAL) for money.
-- =============================================================

-- -------------------------------------------------------------
-- Users (authentication)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id               BIGSERIAL PRIMARY KEY,
    email            VARCHAR(255) NOT NULL UNIQUE,
    full_name        VARCHAR(255) NOT NULL,
    username         VARCHAR(100) NOT NULL UNIQUE,
    password_hash    VARCHAR(255) NOT NULL,
    email_confirmed  BOOLEAN NOT NULL DEFAULT FALSE,
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users (username);

-- -------------------------------------------------------------
-- Transactions
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS transactions (
    id               BIGSERIAL PRIMARY KEY,
    user_id          BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type             VARCHAR(20) NOT NULL CHECK (type IN ('income', 'expense')),
    description      VARCHAR(255) NOT NULL,
    amount           NUMERIC(12,2) NOT NULL,
    category         VARCHAR(50) NOT NULL,
    transaction_date DATE NOT NULL,
    payment_method   VARCHAR(50) NOT NULL DEFAULT 'Cash',
    notes            TEXT,
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_amount_positive CHECK (amount > 0)
);

CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions (user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions (type);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions (category);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions (transaction_date);

-- -------------------------------------------------------------
-- Budgets (one budget per category per month/year)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS budgets (
    id            BIGSERIAL PRIMARY KEY,
    user_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category      VARCHAR(50) NOT NULL,
    budget_amount NUMERIC(12,2) NOT NULL,
    month         SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12),
    year          SMALLINT NOT NULL,
    created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_budget_amount_positive CHECK (budget_amount > 0),
    CONSTRAINT uniq_user_category_month UNIQUE (user_id, category, month, year)
);

CREATE INDEX IF NOT EXISTS idx_budgets_user ON budgets (user_id);

-- -------------------------------------------------------------
-- Financial goals
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS goals (
    id             BIGSERIAL PRIMARY KEY,
    user_id        BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    goal_name      VARCHAR(255) NOT NULL,
    target_amount  NUMERIC(12,2) NOT NULL,
    current_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    target_date    DATE,
    description    TEXT,
    created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_target_positive CHECK (target_amount > 0),
    CONSTRAINT chk_current_not_negative CHECK (current_amount >= 0)
);

CREATE INDEX IF NOT EXISTS idx_goals_user ON goals (user_id);
