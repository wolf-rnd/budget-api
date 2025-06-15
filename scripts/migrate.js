const { pool } = require('./db');

async function runMigrations() {
  let client;

  try {
    console.log('🚀 מתחיל הרצת מיגרציות PostgreSQL/Supabase...');
    client = await pool.connect();
    console.log('✅ התחברות למסד הנתונים הצליחה!');

    // Create migrations table if not exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        filename TEXT NOT NULL UNIQUE,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Check if initial migration already executed
    const existingMigration = await client.query(
      'SELECT filename FROM migrations WHERE filename = $1',
      ['001_initial_schema.sql']
    );

    if (existingMigration.rows.length > 0) {
      console.log('✅ מיגרציה ראשונית כבר קיימת, מדלג...');
      return;
    }

    console.log('📝 יוצר מיגרציה ראשונית...');

    const initialMigration = `
    -- כאן תשים את כל הסכמת ה־SQL שלך כמו שהיתה בקוד המקורי
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

    -- יתר הטבלאות ואינדקסים...
    `;

    await client.query(initialMigration);

    // סימון המיגרציה כמבוצעת
    await client.query(
      'INSERT INTO migrations (filename) VALUES ($1)',
      ['001_initial_schema.sql']
    );

    console.log('✅ מיגרציה ראשונית הושלמה בהצלחה');

  } catch (error) {
    console.error('❌ שגיאה בהרצת מיגרציות:', error);
    throw error;
  } finally {
    if (client) client.release();
  }
}

// להריץ את המיגרציה ישירות מקובץ זה
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
