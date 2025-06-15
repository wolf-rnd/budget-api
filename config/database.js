const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// יצירת תיקיית database אם לא קיימת
const dbDir = path.join(__dirname, '../database');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = process.env.DB_PATH || path.join(__dirname, '../database/family_budget.db');

// יצירת חיבור למסד הנתונים
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ שגיאה בחיבור למסד הנתונים:', err.message);
    process.exit(-1);
  } else {
    console.log('✅ התחברות למסד הנתונים הצליחה');
    
    // הפעלת foreign keys
    db.run('PRAGMA foreign_keys = ON');
  }
});

// פונקציה לביצוע שאילתות עם Promise
const query = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve({ rows });
      }
    });
  });
};

// פונקציה לביצוע שאילתות INSERT/UPDATE/DELETE
const run = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) {
        reject(err);
      } else {
        resolve({ 
          lastID: this.lastID, 
          changes: this.changes,
          rows: [{ id: this.lastID }] // תאימות עם PostgreSQL
        });
      }
    });
  });
};

// פונקציה לביצוע טרנזקציות
const transaction = async (callback) => {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run('BEGIN TRANSACTION');
      
      const client = {
        query: async (sql, params) => {
          try {
            if (sql.toLowerCase().includes('insert') || 
                sql.toLowerCase().includes('update') || 
                sql.toLowerCase().includes('delete')) {
              return await run(sql, params);
            } else {
              return await query(sql, params);
            }
          } catch (error) {
            db.run('ROLLBACK');
            throw error;
          }
        }
      };
      
      callback(client)
        .then(result => {
          db.run('COMMIT', (err) => {
            if (err) {
              reject(err);
            } else {
              resolve(result);
            }
          });
        })
        .catch(error => {
          db.run('ROLLBACK');
          reject(error);
        });
    });
  });
};

// פונקציה לסגירת החיבור
const close = () => {
  return new Promise((resolve) => {
    db.close((err) => {
      if (err) {
        console.error('שגיאה בסגירת מסד הנתונים:', err.message);
      } else {
        console.log('חיבור מסד הנתונים נסגר');
      }
      resolve();
    });
  });
};

module.exports = {
  query,
  run,
  transaction,
  close,
  db
};