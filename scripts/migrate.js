require('dotenv').config();
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');

console.log('🔍 הגדרות חיבור למסד נתונים:');
console.log('DB_HOST:', process.env.DB_HOST);
console.log('DB_PORT:', process.env.DB_PORT);
console.log('DB_NAME:', process.env.DB_NAME);
console.log('DB_USER:', process.env.DB_USER);
console.log('Password set:', process.env.DB_PASSWORD);

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: { 
    rejectUnauthorized: false,
    mode: 'require'
  },
  connectionTimeoutMillis: 15000, // 15 שניות
  idleTimeoutMillis: 30000,
  max: 5,
  statement_timeout: 60000,
  query_timeout: 60000,
});

async function runMigrations() {
  let client;

  try {
    console.log('🚀 מתחיל הרצת מיגרציות PostgreSQL/Supabase...');
    
    console.log('🔌 מנסה להתחבר ל־DB...');
    client = await pool.connect();
    console.log('✅ התחברות הצליחה!');

    // Create migrations table if not exists
    console.log('📋 יוצר טבלת מיגרציות...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        filename TEXT NOT NULL UNIQUE,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Check if initial migration already executed
    console.log('🔍 בודק אם מיגרציה ראשונית כבר קיימת...');
    const existingMigration = await client.query(
      'SELECT filename FROM migrations WHERE filename = $1',
      ['001_initial_schema.sql']
    );

    if (existingMigration.rows.length > 0) {
      console.log('✅ מיגרציה ראשונית כבר קיימת, מדלג...');
      return;
    }

    console.log('📝 יוצר מיגרציה ראשונית...');

    // Enable UUID extension
    await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    console.log('✅ הרחבת UUID הופעלה');

    // Create all tables
    const createTablesQueries = [
      // Users table
      `CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,

      // Budget years table
      `CREATE TABLE IF NOT EXISTS budget_years (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        is_active BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,

      // Funds table
      `CREATE TABLE IF NOT EXISTS funds (
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
      )`,

      // Fund budgets table
      `CREATE TABLE IF NOT EXISTS fund_budgets (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        fund_id UUID NOT NULL REFERENCES funds(id) ON DELETE CASCADE,
        budget_year_id UUID NOT NULL REFERENCES budget_years(id) ON DELETE CASCADE,
        amount DECIMAL(12,2) NOT NULL DEFAULT 0,
        amount_given DECIMAL(12,2) DEFAULT 0,
        spent DECIMAL(12,2) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(fund_id, budget_year_id)
      )`,

      // Categories table
      `CREATE TABLE IF NOT EXISTS categories (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        fund_id UUID NOT NULL REFERENCES funds(id) ON DELETE CASCADE,
        color_class TEXT,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, name)
      )`,

      // Incomes table
      `CREATE TABLE IF NOT EXISTS incomes (
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
      )`,

      // Expenses table
      `CREATE TABLE IF NOT EXISTS expenses (
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
      )`,

      // Tithe given table
      `CREATE TABLE IF NOT EXISTS tithe_given (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        description TEXT NOT NULL,
        amount DECIMAL(12,2) NOT NULL,
        date DATE NOT NULL,
        note TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,

      // Debts table
      `CREATE TABLE IF NOT EXISTS debts (
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
      )`,

      // Tasks table
      `CREATE TABLE IF NOT EXISTS tasks (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        description TEXT NOT NULL,
        completed BOOLEAN DEFAULT FALSE,
        important BOOLEAN DEFAULT FALSE,
        completed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,

      // Asset snapshots table
      `CREATE TABLE IF NOT EXISTS asset_snapshots (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        date DATE NOT NULL,
        note TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,

      // Asset details table
      `CREATE TABLE IF NOT EXISTS asset_details (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        snapshot_id UUID NOT NULL REFERENCES asset_snapshots(id) ON DELETE CASCADE,
        asset_type TEXT NOT NULL,
        asset_name TEXT NOT NULL,
        amount DECIMAL(12,2) NOT NULL,
        category TEXT NOT NULL CHECK (category IN ('asset', 'liability')),
        UNIQUE(snapshot_id, asset_type)
      )`,

      // System settings table
      `CREATE TABLE IF NOT EXISTS system_settings (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        setting_key TEXT NOT NULL,
        setting_value TEXT NOT NULL,
        data_type TEXT DEFAULT 'string' CHECK (data_type IN ('string', 'number', 'boolean', 'json')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, setting_key)
      )`
    ];

    // Execute table creation queries
    for (let i = 0; i < createTablesQueries.length; i++) {
      console.log(`📋 יוצר טבלה ${i + 1}/${createTablesQueries.length}...`);
      await client.query(createTablesQueries[i]);
    }

    console.log('✅ כל הטבלאות נוצרו בהצלחה');

    // Create indexes
    console.log('🔍 יוצר אינדקסים...');
    const indexQueries = [
      'CREATE INDEX IF NOT EXISTS idx_budget_years_user_id ON budget_years(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_budget_years_dates ON budget_years(start_date, end_date)',
      'CREATE INDEX IF NOT EXISTS idx_funds_user_id ON funds(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_fund_budgets_fund_id ON fund_budgets(fund_id)',
      'CREATE INDEX IF NOT EXISTS idx_fund_budgets_budget_year_id ON fund_budgets(budget_year_id)',
      'CREATE INDEX IF NOT EXISTS idx_categories_user_id ON categories(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_categories_fund_id ON categories(fund_id)',
      'CREATE INDEX IF NOT EXISTS idx_incomes_user_id ON incomes(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_incomes_budget_year_id ON incomes(budget_year_id)',
      'CREATE INDEX IF NOT EXISTS idx_incomes_date ON incomes(date)',
      'CREATE INDEX IF NOT EXISTS idx_expenses_user_id ON expenses(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_expenses_budget_year_id ON expenses(budget_year_id)',
      'CREATE INDEX IF NOT EXISTS idx_expenses_category_id ON expenses(category_id)',
      'CREATE INDEX IF NOT EXISTS idx_expenses_fund_id ON expenses(fund_id)',
      'CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date)',
      'CREATE INDEX IF NOT EXISTS idx_tithe_given_user_id ON tithe_given(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_tithe_given_date ON tithe_given(date)',
      'CREATE INDEX IF NOT EXISTS idx_debts_user_id ON debts(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_debts_type ON debts(type)',
      'CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_tasks_completed ON tasks(completed)',
      'CREATE INDEX IF NOT EXISTS idx_asset_snapshots_user_id ON asset_snapshots(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_asset_snapshots_date ON asset_snapshots(date)',
      'CREATE INDEX IF NOT EXISTS idx_asset_details_snapshot_id ON asset_details(snapshot_id)',
      'CREATE INDEX IF NOT EXISTS idx_system_settings_user_id ON system_settings(user_id)'
    ];

    for (const indexQuery of indexQueries) {
      await client.query(indexQuery);
    }

    console.log('✅ כל האינדקסים נוצרו בהצלחה');

    // Mark migration as executed
    await client.query(
      'INSERT INTO migrations (filename) VALUES ($1)',
      ['001_initial_schema.sql']
    );

    console.log('✅ מיגרציה ראשונית הושלמה בהצלחה');

  } catch (error) {
    console.error('❌ שגיאה בהרצת מיגרציות:', error);
    throw error;
  } finally {
    if (client) {
      client.release();
      console.log('🔌 חיבור למסד נתונים נסגר');
    }
  }
}

// להריץ את המיגרציה ישירות מקובץ זה
if (require.main === module) {
  runMigrations()
    .then(() => {
      console.log('🎉 כל המיגרציות הושלמו בהצלחה!');
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