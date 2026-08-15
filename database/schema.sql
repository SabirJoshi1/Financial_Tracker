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
-- Transactions
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS transactions (
    id               BIGSERIAL PRIMARY KEY,
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

CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions (type);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions (category);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions (transaction_date);

-- -------------------------------------------------------------
-- Budgets (one budget per category per month/year)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS budgets (
    id            BIGSERIAL PRIMARY KEY,
    category      VARCHAR(50) NOT NULL,
    budget_amount NUMERIC(12,2) NOT NULL,
    month         SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12),
    year          SMALLINT NOT NULL,
    created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_budget_amount_positive CHECK (budget_amount > 0),
    CONSTRAINT uniq_category_month UNIQUE (category, month, year)
);

-- -------------------------------------------------------------
-- Financial goals
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS goals (
    id             BIGSERIAL PRIMARY KEY,
    goal_name      VARCHAR(255) NOT NULL,
    target_amount  NUMERIC(12,2) NOT NULL,
    current_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    target_date    DATE,
    description    TEXT,
    created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_target_positive CHECK (target_amount > 0),
    CONSTRAINT chk_current_not_negative CHECK (current_amount >= 0)
);

-- =============================================================
-- Sample data (relative to the current date so the dashboard is
-- populated on first run).
-- =============================================================

-- Helper pattern: TO_DATE(TO_CHAR(CURRENT_DATE - INTERVAL 'n months', 'YYYY-MM-') || 'DD', 'YYYY-MM-DD')
-- produces a day within the month `n` months ago.

INSERT INTO transactions (type, description, amount, category, transaction_date, payment_method, notes)
VALUES
-- Current month (0 months back)
('income',  'Monthly salary',               5200.00, 'Salary',        TO_DATE(TO_CHAR(CURRENT_DATE - INTERVAL '0 months', 'YYYY-MM-') || '01', 'YYYY-MM-DD'), 'Bank Transfer', 'Monthly pay cheque'),
('income',  'Freelance web project',         800.00, 'Freelance',     TO_DATE(TO_CHAR(CURRENT_DATE - INTERVAL '0 months', 'YYYY-MM-') || '08', 'YYYY-MM-DD'), 'Bank Transfer', NULL),
('income',  'Dividend payment',              150.00, 'Investment',    TO_DATE(TO_CHAR(CURRENT_DATE - INTERVAL '0 months', 'YYYY-MM-') || '15', 'YYYY-MM-DD'), 'Bank Transfer', NULL),
('expense', 'Rent',                         1300.00, 'Housing',       TO_DATE(TO_CHAR(CURRENT_DATE - INTERVAL '0 months', 'YYYY-MM-') || '02', 'YYYY-MM-DD'), 'Bank Transfer', 'Monthly rent'),
('expense', 'Weekly grocery shop',           240.00, 'Groceries',     TO_DATE(TO_CHAR(CURRENT_DATE - INTERVAL '0 months', 'YYYY-MM-') || '04', 'YYYY-MM-DD'), 'Debit Card', NULL),
('expense', 'Weekly grocery shop',           180.00, 'Groceries',     TO_DATE(TO_CHAR(CURRENT_DATE - INTERVAL '0 months', 'YYYY-MM-') || '11', 'YYYY-MM-DD'), 'Debit Card', NULL),
('expense', 'Petrol',                         70.00, 'Transport',     TO_DATE(TO_CHAR(CURRENT_DATE - INTERVAL '0 months', 'YYYY-MM-') || '05', 'YYYY-MM-DD'), 'Credit Card', NULL),
('expense', 'Dinner with friends',           120.00, 'Dining',        TO_DATE(TO_CHAR(CURRENT_DATE - INTERVAL '0 months', 'YYYY-MM-') || '06', 'YYYY-MM-DD'), 'Credit Card', NULL),
('expense', 'Coffee & lunch',                45.00,  'Dining',        TO_DATE(TO_CHAR(CURRENT_DATE - INTERVAL '0 months', 'YYYY-MM-') || '12', 'YYYY-MM-DD'), 'Cash', NULL),
('expense', 'Cinema tickets',                30.00,  'Entertainment', TO_DATE(TO_CHAR(CURRENT_DATE - INTERVAL '0 months', 'YYYY-MM-') || '09', 'YYYY-MM-DD'), 'Debit Card', NULL),
('expense', 'New headphones',                120.00, 'Shopping',      TO_DATE(TO_CHAR(CURRENT_DATE - INTERVAL '0 months', 'YYYY-MM-') || '10', 'YYYY-MM-DD'), 'Credit Card', NULL),
('expense', 'Electricity & water',           210.00, 'Utilities',     TO_DATE(TO_CHAR(CURRENT_DATE - INTERVAL '0 months', 'YYYY-MM-') || '03', 'YYYY-MM-DD'), 'Bank Transfer', NULL),
('expense', 'Health insurance premium',      120.00, 'Insurance',     TO_DATE(TO_CHAR(CURRENT_DATE - INTERVAL '0 months', 'YYYY-MM-') || '07', 'YYYY-MM-DD'), 'Bank Transfer', NULL),
('expense', 'Pharmacy',                       35.00,  'Healthcare',    TO_DATE(TO_CHAR(CURRENT_DATE - INTERVAL '0 months', 'YYYY-MM-') || '13', 'YYYY-MM-DD'), 'Debit Card', NULL),
('expense', 'Streaming services',             45.00,  'Subscriptions', TO_DATE(TO_CHAR(CURRENT_DATE - INTERVAL '0 months', 'YYYY-MM-') || '01', 'YYYY-MM-DD'), 'Credit Card', 'Netflix + Spotify'),

-- 1 month back
('income',  'Monthly salary',               5200.00, 'Salary',        TO_DATE(TO_CHAR(CURRENT_DATE - INTERVAL '1 months', 'YYYY-MM-') || '01', 'YYYY-MM-DD'), 'Bank Transfer', NULL),
('income',  'Freelance logo design',         600.00, 'Freelance',     TO_DATE(TO_CHAR(CURRENT_DATE - INTERVAL '1 months', 'YYYY-MM-') || '10', 'YYYY-MM-DD'), 'Bank Transfer', NULL),
('income',  'Yearly bonus',                 1500.00, 'Bonus',         TO_DATE(TO_CHAR(CURRENT_DATE - INTERVAL '1 months', 'YYYY-MM-') || '20', 'YYYY-MM-DD'), 'Bank Transfer', NULL),
('expense', 'Rent',                         1300.00, 'Housing',       TO_DATE(TO_CHAR(CURRENT_DATE - INTERVAL '1 months', 'YYYY-MM-') || '02', 'YYYY-MM-DD'), 'Bank Transfer', NULL),
('expense', 'Groceries (whole month)',       560.00, 'Groceries',     TO_DATE(TO_CHAR(CURRENT_DATE - INTERVAL '1 months', 'YYYY-MM-') || '15', 'YYYY-MM-DD'), 'Debit Card', NULL),
('expense', 'Train tickets',                 90.00,  'Transport',     TO_DATE(TO_CHAR(CURRENT_DATE - INTERVAL '1 months', 'YYYY-MM-') || '08', 'YYYY-MM-DD'), 'Credit Card', NULL),
('expense', 'Restaurant week',              260.00, 'Dining',        TO_DATE(TO_CHAR(CURRENT_DATE - INTERVAL '1 months', 'YYYY-MM-') || '18', 'YYYY-MM-DD'), 'Credit Card', NULL),
('expense', 'Concert tickets',               90.00,  'Entertainment', TO_DATE(TO_CHAR(CURRENT_DATE - INTERVAL '1 months', 'YYYY-MM-') || '12', 'YYYY-MM-DD'), 'Credit Card', NULL),
('expense', 'Clothes shopping',              350.00, 'Shopping',      TO_DATE(TO_CHAR(CURRENT_DATE - INTERVAL '1 months', 'YYYY-MM-') || '21', 'YYYY-MM-DD'), 'Credit Card', NULL),
('expense', 'Gas & internet',                190.00, 'Utilities',     TO_DATE(TO_CHAR(CURRENT_DATE - INTERVAL '1 months', 'YYYY-MM-') || '03', 'YYYY-MM-DD'), 'Bank Transfer', NULL),
('expense', 'Car insurance',                 150.00, 'Insurance',     TO_DATE(TO_CHAR(CURRENT_DATE - INTERVAL '1 months', 'YYYY-MM-') || '06', 'YYYY-MM-DD'), 'Bank Transfer', NULL),
('expense', 'Online course',                 120.00, 'Education',     TO_DATE(TO_CHAR(CURRENT_DATE - INTERVAL '1 months', 'YYYY-MM-') || '09', 'YYYY-MM-DD'), 'Debit Card', NULL),
('expense', 'Streaming services',             45.00,  'Subscriptions', TO_DATE(TO_CHAR(CURRENT_DATE - INTERVAL '1 months', 'YYYY-MM-') || '01', 'YYYY-MM-DD'), 'Credit Card', NULL),
('expense', 'Weekend trip',                  400.00, 'Travel',        TO_DATE(TO_CHAR(CURRENT_DATE - INTERVAL '1 months', 'YYYY-MM-') || '25', 'YYYY-MM-DD'), 'Credit Card', NULL),

-- 2 months back
('income',  'Monthly salary',               5200.00, 'Salary',        TO_DATE(TO_CHAR(CURRENT_DATE - INTERVAL '2 months', 'YYYY-MM-') || '01', 'YYYY-MM-DD'), 'Bank Transfer', NULL),
('income',  'Freelance consulting',          900.00, 'Freelance',     TO_DATE(TO_CHAR(CURRENT_DATE - INTERVAL '2 months', 'YYYY-MM-') || '14', 'YYYY-MM-DD'), 'Bank Transfer', NULL),
('expense', 'Rent',                         1300.00, 'Housing',       TO_DATE(TO_CHAR(CURRENT_DATE - INTERVAL '2 months', 'YYYY-MM-') || '02', 'YYYY-MM-DD'), 'Bank Transfer', NULL),
('expense', 'Groceries',                     520.00, 'Groceries',     TO_DATE(TO_CHAR(CURRENT_DATE - INTERVAL '2 months', 'YYYY-MM-') || '12', 'YYYY-MM-DD'), 'Debit Card', NULL),
('expense', 'Fuel',                          130.00, 'Transport',     TO_DATE(TO_CHAR(CURRENT_DATE - INTERVAL '2 months', 'YYYY-MM-') || '07', 'YYYY-MM-DD'), 'Credit Card', NULL),
('expense', 'Takeaways',                     180.00, 'Dining',        TO_DATE(TO_CHAR(CURRENT_DATE - INTERVAL '2 months', 'YYYY-MM-') || '16', 'YYYY-MM-DD'), 'Debit Card', NULL),
('expense', 'Video games',                   60.00,  'Entertainment', TO_DATE(TO_CHAR(CURRENT_DATE - INTERVAL '2 months', 'YYYY-MM-') || '10', 'YYYY-MM-DD'), 'Credit Card', NULL),
('expense', 'Home goods',                    200.00, 'Shopping',      TO_DATE(TO_CHAR(CURRENT_DATE - INTERVAL '2 months', 'YYYY-MM-') || '19', 'YYYY-MM-DD'), 'Debit Card', NULL),
('expense', 'Utilities',                     205.00, 'Utilities',     TO_DATE(TO_CHAR(CURRENT_DATE - INTERVAL '2 months', 'YYYY-MM-') || '03', 'YYYY-MM-DD'), 'Bank Transfer', NULL),
('expense', 'Dentist',                       140.00, 'Healthcare',    TO_DATE(TO_CHAR(CURRENT_DATE - INTERVAL '2 months', 'YYYY-MM-') || '22', 'YYYY-MM-DD'), 'Debit Card', NULL),
('expense', 'Streaming services',             45.00,  'Subscriptions', TO_DATE(TO_CHAR(CURRENT_DATE - INTERVAL '2 months', 'YYYY-MM-') || '01', 'YYYY-MM-DD'), 'Credit Card', NULL),

-- 3 months back
('income',  'Monthly salary',               5000.00, 'Salary',        TO_DATE(TO_CHAR(CURRENT_DATE - INTERVAL '3 months', 'YYYY-MM-') || '01', 'YYYY-MM-DD'), 'Bank Transfer', NULL),
('income',  'Small business sale',          1500.00, 'Business',      TO_DATE(TO_CHAR(CURRENT_DATE - INTERVAL '3 months', 'YYYY-MM-') || '18', 'YYYY-MM-DD'), 'Bank Transfer', NULL),
('expense', 'Rent',                         1250.00, 'Housing',       TO_DATE(TO_CHAR(CURRENT_DATE - INTERVAL '3 months', 'YYYY-MM-') || '02', 'YYYY-MM-DD'), 'Bank Transfer', NULL),
('expense', 'Groceries',                     490.00, 'Groceries',     TO_DATE(TO_CHAR(CURRENT_DATE - INTERVAL '3 months', 'YYYY-MM-') || '11', 'YYYY-MM-DD'), 'Debit Card', NULL),
('expense', 'Monthly travel pass',            80.00,  'Transport',    TO_DATE(TO_CHAR(CURRENT_DATE - INTERVAL '3 months', 'YYYY-MM-') || '01', 'YYYY-MM-DD'), 'Debit Card', NULL),
('expense', 'Family dinner',                  95.00,  'Dining',       TO_DATE(TO_CHAR(CURRENT_DATE - INTERVAL '3 months', 'YYYY-MM-') || '14', 'YYYY-MM-DD'), 'Cash', NULL),
('expense', 'Board games',                    50.00,  'Entertainment', TO_DATE(TO_CHAR(CURRENT_DATE - INTERVAL '3 months', 'YYYY-MM-') || '09', 'YYYY-MM-DD'), 'Credit Card', NULL),
('expense', 'Shoes',                         130.00, 'Shopping',      TO_DATE(TO_CHAR(CURRENT_DATE - INTERVAL '3 months', 'YYYY-MM-') || '20', 'YYYY-MM-DD'), 'Credit Card', NULL),
('expense', 'Utilities',                     195.00, 'Utilities',     TO_DATE(TO_CHAR(CURRENT_DATE - INTERVAL '3 months', 'YYYY-MM-') || '03', 'YYYY-MM-DD'), 'Bank Transfer', NULL),
('expense', 'Gym membership',                 40.00,  'Subscriptions', TO_DATE(TO_CHAR(CURRENT_DATE - INTERVAL '3 months', 'YYYY-MM-') || '05', 'YYYY-MM-DD'), 'Credit Card', NULL),

-- 4 months back
('income',  'Monthly salary',               5000.00, 'Salary',        TO_DATE(TO_CHAR(CURRENT_DATE - INTERVAL '4 months', 'YYYY-MM-') || '01', 'YYYY-MM-DD'), 'Bank Transfer', NULL),
('income',  'Freelance photography',         450.00, 'Freelance',     TO_DATE(TO_CHAR(CURRENT_DATE - INTERVAL '4 months', 'YYYY-MM-') || '12', 'YYYY-MM-DD'), 'Bank Transfer', NULL),
('expense', 'Rent',                         1250.00, 'Housing',       TO_DATE(TO_CHAR(CURRENT_DATE - INTERVAL '4 months', 'YYYY-MM-') || '02', 'YYYY-MM-DD'), 'Bank Transfer', NULL),
('expense', 'Groceries',                     470.00, 'Groceries',     TO_DATE(TO_CHAR(CURRENT_DATE - INTERVAL '4 months', 'YYYY-MM-') || '10', 'YYYY-MM-DD'), 'Debit Card', NULL),
('expense', 'Car service',                   250.00, 'Transport',     TO_DATE(TO_CHAR(CURRENT_DATE - INTERVAL '4 months', 'YYYY-MM-') || '15', 'YYYY-MM-DD'), 'Debit Card', NULL),
('expense', 'Cafe & brunch',                 110.00, 'Dining',        TO_DATE(TO_CHAR(CURRENT_DATE - INTERVAL '4 months', 'YYYY-MM-') || '08', 'YYYY-MM-DD'), 'Cash', NULL),
('expense', 'Museum tickets',                 45.00,  'Entertainment', TO_DATE(TO_CHAR(CURRENT_DATE - INTERVAL '4 months', 'YYYY-MM-') || '17', 'YYYY-MM-DD'), 'Debit Card', NULL),
('expense', 'Utilities',                     190.00, 'Utilities',     TO_DATE(TO_CHAR(CURRENT_DATE - INTERVAL '4 months', 'YYYY-MM-') || '03', 'YYYY-MM-DD'), 'Bank Transfer', NULL),
('expense', 'Insurance',                     120.00, 'Insurance',     TO_DATE(TO_CHAR(CURRENT_DATE - INTERVAL '4 months', 'YYYY-MM-') || '06', 'YYYY-MM-DD'), 'Bank Transfer', NULL),
('expense', 'Streaming',                      45.00,  'Subscriptions', TO_DATE(TO_CHAR(CURRENT_DATE - INTERVAL '4 months', 'YYYY-MM-') || '01', 'YYYY-MM-DD'), 'Credit Card', NULL),

-- 5 months back
('income',  'Monthly salary',               4800.00, 'Salary',        TO_DATE(TO_CHAR(CURRENT_DATE - INTERVAL '5 months', 'YYYY-MM-') || '01', 'YYYY-MM-DD'), 'Bank Transfer', NULL),
('income',  'Misc income',                   300.00, 'Other Income',  TO_DATE(TO_CHAR(CURRENT_DATE - INTERVAL '5 months', 'YYYY-MM-') || '22', 'YYYY-MM-DD'), 'Cash', NULL),
('expense', 'Rent',                         1200.00, 'Housing',       TO_DATE(TO_CHAR(CURRENT_DATE - INTERVAL '5 months', 'YYYY-MM-') || '02', 'YYYY-MM-DD'), 'Bank Transfer', NULL),
('expense', 'Groceries',                     440.00, 'Groceries',     TO_DATE(TO_CHAR(CURRENT_DATE - INTERVAL '5 months', 'YYYY-MM-') || '09', 'YYYY-MM-DD'), 'Debit Card', NULL),
('expense', 'Fuel',                          120.00, 'Transport',     TO_DATE(TO_CHAR(CURRENT_DATE - INTERVAL '5 months', 'YYYY-MM-') || '06', 'YYYY-MM-DD'), 'Credit Card', NULL),
('expense', 'Fast food',                      75.00,  'Dining',       TO_DATE(TO_CHAR(CURRENT_DATE - INTERVAL '5 months', 'YYYY-MM-') || '13', 'YYYY-MM-DD'), 'Cash', NULL),
('expense', 'Books',                          65.00,  'Shopping',      TO_DATE(TO_CHAR(CURRENT_DATE - INTERVAL '5 months', 'YYYY-MM-') || '19', 'YYYY-MM-DD'), 'Debit Card', NULL),
('expense', 'Utilities',                     185.00, 'Utilities',     TO_DATE(TO_CHAR(CURRENT_DATE - INTERVAL '5 months', 'YYYY-MM-') || '03', 'YYYY-MM-DD'), 'Bank Transfer', NULL),
('expense', 'Streaming',                      45.00,  'Subscriptions', TO_DATE(TO_CHAR(CURRENT_DATE - INTERVAL '5 months', 'YYYY-MM-') || '01', 'YYYY-MM-DD'), 'Credit Card', NULL);

-- Sample budgets for the current month and the previous month
INSERT INTO budgets (category, budget_amount, month, year)
SELECT 'Groceries',      600.00, EXTRACT(MONTH FROM CURRENT_DATE - INTERVAL '0 months')::SMALLINT, EXTRACT(YEAR FROM CURRENT_DATE - INTERVAL '0 months')::SMALLINT
UNION ALL SELECT 'Dining',        300.00, EXTRACT(MONTH FROM CURRENT_DATE - INTERVAL '0 months')::SMALLINT, EXTRACT(YEAR FROM CURRENT_DATE - INTERVAL '0 months')::SMALLINT
UNION ALL SELECT 'Transport',     200.00, EXTRACT(MONTH FROM CURRENT_DATE - INTERVAL '0 months')::SMALLINT, EXTRACT(YEAR FROM CURRENT_DATE - INTERVAL '0 months')::SMALLINT
UNION ALL SELECT 'Entertainment', 150.00, EXTRACT(MONTH FROM CURRENT_DATE - INTERVAL '0 months')::SMALLINT, EXTRACT(YEAR FROM CURRENT_DATE - INTERVAL '0 months')::SMALLINT
UNION ALL SELECT 'Shopping',      400.00, EXTRACT(MONTH FROM CURRENT_DATE - INTERVAL '0 months')::SMALLINT, EXTRACT(YEAR FROM CURRENT_DATE - INTERVAL '0 months')::SMALLINT
UNION ALL SELECT 'Subscriptions', 100.00, EXTRACT(MONTH FROM CURRENT_DATE - INTERVAL '0 months')::SMALLINT, EXTRACT(YEAR FROM CURRENT_DATE - INTERVAL '0 months')::SMALLINT
UNION ALL SELECT 'Groceries',      650.00, EXTRACT(MONTH FROM CURRENT_DATE - INTERVAL '1 months')::SMALLINT, EXTRACT(YEAR FROM CURRENT_DATE - INTERVAL '1 months')::SMALLINT
UNION ALL SELECT 'Dining',         300.00, EXTRACT(MONTH FROM CURRENT_DATE - INTERVAL '1 months')::SMALLINT, EXTRACT(YEAR FROM CURRENT_DATE - INTERVAL '1 months')::SMALLINT
UNION ALL SELECT 'Entertainment',  150.00, EXTRACT(MONTH FROM CURRENT_DATE - INTERVAL '1 months')::SMALLINT, EXTRACT(YEAR FROM CURRENT_DATE - INTERVAL '1 months')::SMALLINT
UNION ALL SELECT 'Travel',         500.00, EXTRACT(MONTH FROM CURRENT_DATE - INTERVAL '1 months')::SMALLINT, EXTRACT(YEAR FROM CURRENT_DATE - INTERVAL '1 months')::SMALLINT;

-- Sample savings goals
INSERT INTO goals (goal_name, target_amount, current_amount, target_date, description)
VALUES
    ('Emergency Fund', 10000.00, 6000.00, CURRENT_DATE + INTERVAL '8 months', 'Six months of living expenses saved for peace of mind.'),
    ('New Car',        25000.00, 8500.00, CURRENT_DATE + INTERVAL '14 months', 'Saving for a reliable second-hand car.'),
    ('Holiday',         5000.00, 2200.00, CURRENT_DATE + INTERVAL '5 months', 'Two-week trip to Japan.');
