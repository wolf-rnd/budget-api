const { Pool } = require('pg');

// יצירת מאגר חיבורים ל-PostgreSQL/Supabase
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20, // מספר מקסימלי של חיבורים במאגר
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// בדיקת חיבור ראשונית
pool.on('connect', () => {
  console.log('✅ התחברות למסד הנתונים הצליחה');
});

pool.on('error', (err) => {
  console.error('❌ שגיאה בחיבור למסד הנתונים:', err);
  process.exit(-1);
});

// פונקציה לביצוע שאילתות עם Promise
const query = async (text, params = []) => {
  try {
    const result = await pool.query(text, params);
    return { rows: result.rows };
  } catch (error) {
    console.error('שגיאה בביצוע שאילתה:', error);
    throw error;
  }
};

// פונקציה לביצוע שאילתות INSERT/UPDATE/DELETE
const run = async (text, params = []) => {
  try {
    const result = await pool.query(text, params);
    return { 
      lastID: result.rows[0]?.id || null,
      changes: result.rowCount,
      rows: result.rows
    };
  } catch (error) {
    console.error('שגיאה בביצוע פקודה:', error);
    throw error;
  }
};

// פונקציה לביצוע טרנזקציות
const transaction = async (callback) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const clientWrapper = {
      query: async (text, params) => {
        const result = await client.query(text, params);
        return { rows: result.rows };
      }
    };
    
    const result = await callback(clientWrapper);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

// פונקציה לסגירת החיבור
const close = async () => {
  try {
    await pool.end();
    console.log('חיבור מסד הנתונים נסגר');
  } catch (error) {
    console.error('שגיאה בסגירת מסד הנתונים:', error);
  }
};

// פונקציה לקבלת חיבור ישיר (עבור routes שמשתמשים ב-pool.connect())
const connect = () => pool.connect();

module.exports = {
  query,
  run,
  transaction,
  close,
  connect,
  pool
};