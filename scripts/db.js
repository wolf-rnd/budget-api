require('dotenv').config();
const { Pool } = require('pg');

// הדפסת משתני הסביבה החיוניים (בצורה בטוחה)
console.log('🔍 הגדרות חיבור למסד נתונים:');
console.log('DB_HOST:', process.env.DB_HOST);
console.log('DB_PORT:', process.env.DB_PORT);
console.log('DB_NAME:', process.env.DB_NAME);
console.log('DB_USER:', process.env.DB_USER);
console.log('Password set:', process.env.DB_PASSWORD ? 'Yes' : 'No');

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
  connectionTimeoutMillis: 10000, // 10 שניות
  idleTimeoutMillis: 30000,
  max: 10,
  statement_timeout: 30000,
  query_timeout: 30000,
});

// האזנה לשגיאות גלובליות ב־pool
pool.on('error', (err) => {
  console.error('❌ שגיאה כללית מה־pool:', err);
});

pool.on('connect', (client) => {
  console.log('✅ חיבור חדש נוצר למסד הנתונים');
});

module.exports = { pool };