const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');

// יצירת חיבור ישיר למסד הנתונים
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function runMigrations() {
  const client = await pool.connect();
  
  try {
    console.log('🚀 מתחיל הרצת מיגרציות PostgreSQL/Supabase...');
    
    // Create migrations table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        filename TEXT NOT NULL UNIQUE,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Check if initial migration already exists
    const existingMigration = await client.query(
      'SELECT filename FROM migrations WHERE filename = $1',
      ['001_initial_schema.sql']
    );
    
    if (existingMigration.rows.length > 0) {
      console.log('✅ מיגרציה ראשונית כבר קיימת, מדלג...');
      return;
    }
    
    console.log('📝 יוצר מיגרציה ראשונית...');
    
    // Create all tables with PostgreSQL syntax
    const initialMigration = `
-- Initial migration: Create complete database schema for PostgreSQL/Supabase
-- תאריך: ${new Date().toISOString().split('T')[0]}

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- טבלת משתמשים
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- טבלת שנות תקציב
CREATE TABLE IF NOT EXISTS budget_years (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    is_active BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- טבלת קופות
CREATE TABLE IF NOT EXISTS funds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('monthly', 'annual', 'savings')),
    level INTEGER NOT NULL CHECK (level IN (1, 2, 3)),
    include_in_budget BOOLEAN DEFAULT TRUE,
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, name)
);

-- טבלת תקציבי קופות
CREATE TABLE IF NOT EXISTS fund_budgets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    fund_id UUID NOT NULL REFERENCES funds(id) ON DELETE CASCADE,
    budget_year_id UUID NOT NULL REFERENCES budget_years(id) ON DELETE CASCADE,
    amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    amount_given DECIMAL(12,2) DEFAULT 0,
    spent DECIMAL(12,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(fund_id, budget_year_id)
);

-- טבלת קטגוריות
CREATE TABLE IF NOT EXISTS categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    fund_id UUID NOT NULL REFERENCES funds(id) ON DELETE CASCADE,
    color_class TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, name)
);

-- טבלת הכנסות
CREATE TABLE IF NOT EXISTS incomes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    budget_year_id UUID NOT NULL REFERENCES budget_years(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    source TEXT,
    date DATE NOT NULL,
    month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
    year INTEGER NOT NULL,
    note TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- טבלת הוצאות
CREATE TABLE IF NOT EXISTS expenses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    budget_year_id UUID NOT NULL REFERENCES budget_years(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    fund_id UUID NOT NULL REFERENCES funds(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    date DATE NOT NULL,
    note TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- טבלת מעשרות
CREATE TABLE IF NOT EXISTS tithe_given (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    date DATE NOT NULL,
    note TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- טבלת חובות
CREATE TABLE IF NOT EXISTS debts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('owed_to_me', 'i_owe')),
    note TEXT,
    is_paid BOOLEAN DEFAULT FALSE,
    paid_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- טבלת משימות
CREATE TABLE IF NOT EXISTS tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    completed BOOLEAN DEFAULT FALSE,
    important BOOLEAN DEFAULT FALSE,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- טבלת תמונות מצב נכסים
CREATE TABLE IF NOT EXISTS asset_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    note TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- טבלת פירוט נכסים
CREATE TABLE IF NOT EXISTS asset_details (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    snapshot_id UUID NOT NULL REFERENCES asset_snapshots(id) ON DELETE CASCADE,
    asset_type TEXT NOT NULL,
    asset_name TEXT NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('asset', 'liability')),
    UNIQUE(snapshot_id, asset_type)
);

-- טבלת הגדרות מערכת
CREATE TABLE IF NOT EXISTS system_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    setting_key TEXT NOT NULL,
    setting_value TEXT NOT NULL,
    data_type TEXT DEFAULT 'string' CHECK (data_type IN ('string', 'number', 'boolean', 'json')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
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
    await client.query(initialMigration);
    
    // Mark migration as executed
    await client.query(
      'INSERT INTO migrations (filename) VALUES ($1)',
      ['001_initial_schema.sql']
    );
    
    console.log('✅ מיגרציה ראשונית הושלמה בהצלחה');
    console.log('🎉 כל המיגרציות הושלמו בהצלחה!');
    
  } catch (error) {
    console.error('❌ שגיאה בהרצת מיגרציות:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Run migrations if this file is executed directly
if (require.main === module) {
  runMigrations()
    .then(() => {
      console.log('✅ מיגרציות הושלמו');
      pool.end();
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ שגיאה במיגרציות:', error);
      pool.end();
      process.exit(1);
    });
}

module.exports = { runMigrations };