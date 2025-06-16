require('dotenv').config();
const { Pool } = require('pg');

// הדפסת משתני הסביבה החיוניים (בצורה בטוחה)
console.log('🔍 הגדרות חיבור למסד נתונים:');
console.log('DB_HOST:', process.env.DB_HOST);
console.log('DB_PORT:', process.env.DB_PORT);
console.log('DB_NAME:', process.env.DB_NAME);
console.log('DB_USER:', process.env.DB_USER);
// אל תדפיסי סיסמה בלוג אם זה פומבי
console.log('SSL:', process.env.NODE_ENV === 'production' ? 'Enabled (Production Mode)' : 'Disabled');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 5000, // חיבור יפול אחרי 5 שניות אם לא מצליח
});

// האזנה לשגיאות גלובליות ב־pool
pool.on('error', (err) => {
  console.error('❌ שגיאה כללית מה־pool:', err);
});

module.exports = { pool };
