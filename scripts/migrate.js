const fs = require('fs');
const path = require('path');
const { query, run, close } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

async function runMigrations() {
  try {
    console.log('🚀 מתחיל הרצת מיגרציות SQLite...');
    
    // Create migrations table if it doesn't exist
    await run(`
      CREATE TABLE IF NOT EXISTS migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT NOT NULL UNIQUE,
        executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    console.log('📝 יוצר מיגרציה ראשונית...');
    
    // Create all tables
    const initialMigration = `
-- Initial migration: Create complete database schema
-- תאריך: ${new Date().toISOString().split('T')[0]}

-- טבלת משתמשים
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- טבלת שנות תקציב
CREATE TABLE IF NOT EXISTS budget_years (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    is_active BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- טבלת קופות
CREATE TABLE IF NOT EXISTS funds (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('monthly', 'annual', 'savings')),
    level INTEGER NOT NULL CHECK (level IN (1, 2, 3)),
    include_in_budget BOOLEAN DEFAULT 1,
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, name)
);

-- טבלת תקציבי קופות
CREATE TABLE IF NOT EXISTS fund_budgets (
    id TEXT PRIMARY KEY,
    fund_id TEXT NOT NULL,
    budget_year_id TEXT NOT NULL,
    amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    amount_given DECIMAL(12,2) DEFAULT 0,
    spent DECIMAL(12,2) DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (fund_id) REFERENCES funds(id) ON DELETE CASCADE,
    FOREIGN KEY (budget_year_id) REFERENCES budget_years(id) ON DELETE CASCADE,
    UNIQUE(fund_id, budget_year_id)
);

-- טבלת קטגוריות
CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    fund_id TEXT NOT NULL,
    color_class TEXT,
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (fund_id) REFERENCES funds(id) ON DELETE CASCADE,
    UNIQUE(user_id, name)
);

-- טבלת הכנסות
CREATE TABLE IF NOT EXISTS incomes (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    budget_year_id TEXT NOT NULL,
    name TEXT NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    source TEXT,
    date DATE NOT NULL,
    month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
    year INTEGER NOT NULL,
    note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (budget_year_id) REFERENCES budget_years(id) ON DELETE CASCADE
);

-- טבלת הוצאות
CREATE TABLE IF NOT EXISTS expenses (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    budget_year_id TEXT NOT NULL,
    category_id TEXT NOT NULL,
    fund_id TEXT NOT NULL,
    name TEXT NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    date DATE NOT NULL,
    note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (budget_year_id) REFERENCES budget_years(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT,
    FOREIGN KEY (fund_id) REFERENCES funds(id) ON DELETE RESTRICT
);

-- טבלת מעשרות
CREATE TABLE IF NOT EXISTS tithe_given (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    description TEXT NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    date DATE NOT NULL,
    note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- טבלת חובות
CREATE TABLE IF NOT EXISTS debts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    description TEXT NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('owed_to_me', 'i_owe')),
    note TEXT,
    is_paid BOOLEAN DEFAULT 0,
    paid_date DATE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- טבלת משימות
CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    description TEXT NOT NULL,
    completed BOOLEAN DEFAULT 0,
    important BOOLEAN DEFAULT 0,
    completed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- טבלת תמונות מצב נכסים
CREATE TABLE IF NOT EXISTS asset_snapshots (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    date DATE NOT NULL,
    note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- טבלת פירוט נכסים
CREATE TABLE IF NOT EXISTS asset_details (
    id TEXT PRIMARY KEY,
    snapshot_id TEXT NOT NULL,
    asset_type TEXT NOT NULL,
    asset_name TEXT NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('asset', 'liability')),
    FOREIGN KEY (snapshot_id) REFERENCES asset_snapshots(id) ON DELETE CASCADE,
    UNIQUE(snapshot_id, asset_type)
);

-- טבלת הגדרות מערכת
CREATE TABLE IF NOT EXISTS system_settings (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    setting_key TEXT NOT NULL,
    setting_value TEXT NOT NULL,
    data_type TEXT DEFAULT 'string' CHECK (data_type IN ('string', 'number', 'boolean', 'json')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, setting_key)
);

-- יצירת אינדקסים
CREATE INDEX IF NOT EXISTS idx_budget_years_user_id ON budget_years(user_id);
CREATE INDEX IF NOT EXISTS idx_budget_years_dates ON budget_years(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_funds_user_id ON funds(user_id);
CREATE INDEX IF NOT EXISTS idx_fund_budgets_fund_id ON fund_budgets(fund_id);
CREATE INDEX IF NOT EXISTS idx_fund_budgets_budget_year_id ON fund_budgets(budget_year_id);
CREATE INDEX IF NOT EXISTS idx_categories_user_id ON categories(user_id);
CREATE INDEX IF NOT EXISTS idx_categories_fund_id ON categories(fund_id);
CREATE INDEX IF NOT EXISTS idx_incomes_user_id ON incomes(user_id);
CREATE INDEX IF NOT EXISTS idx_incomes_budget_year_id ON incomes(budget_year_id);
CREATE INDEX IF NOT EXISTS idx_incomes_date ON incomes(date);
CREATE INDEX IF NOT EXISTS idx_expenses_user_id ON expenses(user_id);
CREATE INDEX IF NOT EXISTS idx_expenses_budget_year_id ON expenses(budget_year_id);
CREATE INDEX IF NOT EXISTS idx_expenses_category_id ON expenses(category_id);
CREATE INDEX IF NOT EXISTS idx_expenses_fund_id ON expenses(fund_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
CREATE INDEX IF NOT EXISTS idx_tithe_given_user_id ON tithe_given(user_id);
CREATE INDEX IF NOT EXISTS idx_tithe_given_date ON tithe_given(date);
CREATE INDEX IF NOT EXISTS idx_debts_user_id ON debts(user_id);
CREATE INDEX IF NOT EXISTS idx_debts_type ON debts(type);
CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_completed ON tasks(completed);
CREATE INDEX IF NOT EXISTS idx_asset_snapshots_user_id ON asset_snapshots(user_id);
CREATE INDEX IF NOT EXISTS idx_asset_snapshots_date ON asset_snapshots(date);
CREATE INDEX IF NOT EXISTS idx_asset_details_snapshot_id ON asset_details(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_system_settings_user_id ON system_settings(user_id);
    `;
    
    // Execute the migration
    const statements = initialMigration.split(';').filter(stmt => stmt.trim());
    
    for (const statement of statements) {
      if (statement.trim()) {
        await run(statement.trim());
      }
    }
    
    // Mark migration as executed
    await run(
      'INSERT OR IGNORE INTO migrations (filename) VALUES (?)',
      ['001_initial_schema.sql']
    );
    
    console.log('✅ מיגרציה ראשונית הושלמה בהצלחה');
    console.log('🎉 כל המיגרציות הושלמו בהצלחה!');
    
  } catch (error) {
    console.error('❌ שגיאה בהרצת מיגרציות:', error);
    process.exit(1);
  }
}

// Run migrations if this file is executed directly
if (require.main === module) {
  runMigrations().then(() => {
    console.log('✅ מיגרציות הושלמו');
    process.exit(0);
  });
}

module.exports = { runMigrations };