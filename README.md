# 🏦 Family Budget API

API מלא למערכת ניהול תקציב משפחתי עם כל הפיצ'רים הנדרשים.

## 🚀 התקנה והרצה

### דרישות מוקדמות
- Node.js 16+
- PostgreSQL 12+
- npm או yarn

### התקנה
```bash
# התקנת תלויות
npm install

# העתקת קובץ הגדרות
cp .env.example .env

# עריכת קובץ ההגדרות
nano .env
```

### הגדרת מסד נתונים
```bash
# יצירת מסד נתונים
createdb family_budget

# הרצת מיגרציות
npm run migrate

# זריעת נתוני דמו (אופציונלי)
npm run seed
```

### הרצת השרת
```bash
# פיתוח
npm run dev

# ייצור
npm start
```

## 📊 מבנה מסד הנתונים

### טבלאות עיקריות
- **users** - משתמשים
- **budget_years** - שנות תקציב
- **funds** - קופות
- **fund_budgets** - תקציבי קופות לכל שנה
- **categories** - קטגוריות הוצאות
- **incomes** - הכנסות
- **expenses** - הוצאות
- **tithe_given** - מעשרות שניתנו
- **debts** - חובות
- **tasks** - משימות
- **asset_snapshots** - תמונות מצב נכסים
- **asset_details** - פירוט נכסים
- **system_settings** - הגדרות מערכת

## 🔌 API Endpoints

### אימות
- `POST /api/auth/register` - רישום משתמש חדש
- `POST /api/auth/login` - התחברות
- `GET /api/auth/me` - פרטי המשתמש הנוכחי

### דשבורד
- `GET /api/dashboard/summary` - סיכום כללי

### שנות תקציב
- `GET /api/budget-years` - כל שנות התקציב
- `GET /api/budget-years/active` - שנת התקציב הפעילה
- `POST /api/budget-years` - יצירת שנת תקציב חדשה
- `PUT /api/budget-years/:id` - עדכון שנת תקציב
- `PUT /api/budget-years/:id/activate` - הפעלת שנת תקציב
- `DELETE /api/budget-years/:id` - מחיקת שנת תקציב

### קופות
- `GET /api/funds` - כל הקופות
- `GET /api/funds/:id` - קופה ספציפית
- `POST /api/funds` - יצירת קופה חדשה
- `PUT /api/funds/:id` - עדכון קופה
- `PUT /api/funds/:id/budget/:budgetYearId` - עדכון תקציב קופה
- `PUT /api/funds/:id/deactivate` - השבתת קופה
- `PUT /api/funds/:id/activate` - הפעלת קופה
- `DELETE /api/funds/:id` - מחיקת קופה

### קטגוריות
- `GET /api/categories` - כל הקטגוריות
- `GET /api/categories/fund/:fundId` - קטגוריות לפי קופה
- `POST /api/categories` - יצירת קטגוריה חדשה
- `PUT /api/categories/:id` - עדכון קטגוריה
- `DELETE /api/categories/:id` - מחיקת קטגוריה

### הכנסות
- `GET /api/incomes` - כל ההכנסות (עם פילטרים)
- `GET /api/incomes/:id` - הכנסה ספציפית
- `GET /api/incomes/stats/summary` - סטטיסטיקות הכנסות
- `POST /api/incomes` - יצירת הכנסה חדשה
- `PUT /api/incomes/:id` - עדכון הכנסה
- `DELETE /api/incomes/:id` - מחיקת הכנסה

### הוצאות
- `GET /api/expenses` - כל ההוצאות (עם פילטרים)
- `GET /api/expenses/:id` - הוצאה ספציפית
- `GET /api/expenses/stats/summary` - סטטיסטיקות הוצאות
- `POST /api/expenses` - יצירת הוצאה חדשה
- `PUT /api/expenses/:id` - עדכון הוצאה
- `DELETE /api/expenses/:id` - מחיקת הוצאה

### מעשרות
- `GET /api/tithe` - כל המעשרות
- `GET /api/tithe/summary` - סיכום מעשרות
- `POST /api/tithe` - הוספת מעשר
- `PUT /api/tithe/:id` - עדכון מעשר
- `DELETE /api/tithe/:id` - מחיקת מעשר

### חובות
- `GET /api/debts` - כל החובות
- `GET /api/debts/summary` - סיכום חובות
- `POST /api/debts` - הוספת חוב
- `PUT /api/debts/:id` - עדכון חוב
- `PUT /api/debts/:id/pay` - סימון חוב כשולם
- `PUT /api/debts/:id/unpay` - ביטול סימון שולם
- `DELETE /api/debts/:id` - מחיקת חוב

### משימות
- `GET /api/tasks` - כל המשימות
- `GET /api/tasks/summary` - סיכום משימות
- `POST /api/tasks` - יצירת משימה
- `PUT /api/tasks/:id` - עדכון משימה
- `PUT /api/tasks/:id/toggle` - שינוי סטטוס השלמה
- `DELETE /api/tasks/:id` - מחיקת משימה
- `DELETE /api/tasks/completed/all` - מחיקת כל המשימות שהושלמו

### נכסים
- `GET /api/assets` - כל תמונות המצב
- `GET /api/assets/latest` - תמונת המצב האחרונה
- `GET /api/assets/trends/summary` - מגמות נכסים
- `POST /api/assets` - יצירת תמונת מצב חדשה
- `PUT /api/assets/:id` - עדכון תמונת מצב
- `DELETE /api/assets/:id` - מחיקת תמונת מצב

## 🔒 אבטחה

- **JWT Authentication** - כל הנתיבים מוגנים (חוץ מאימות)
- **Rate Limiting** - הגבלת קצב בקשות
- **Input Validation** - ולידציה מלאה עם Joi
- **SQL Injection Protection** - שימוש ב-parameterized queries
- **Password Hashing** - הצפנת סיסמאות עם bcrypt

## 📝 דוגמאות שימוש

### התחברות
```javascript
const response = await fetch('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'demo@example.com',
    password: 'demo123'
  })
});

const { token, user } = await response.json();
```

### קבלת סיכום דשבורד
```javascript
const response = await fetch('/api/dashboard/summary', {
  headers: { 'Authorization': `Bearer ${token}` }
});

const summary = await response.json();
```

### הוספת הוצאה
```javascript
const response = await fetch('/api/expenses', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    name: 'קניות במכולת',
    amount: 250,
    categoryId: 'category-uuid',
    date: '2024-05-15',
    note: 'קניות שבועיות'
  })
});
```

## 🛠️ פיתוח

### הוספת מיגרציה חדשה
```bash
# יצירת קובץ מיגרציה חדש
touch api/migrations/002_add_new_feature.sql

# הרצת מיגרציות
npm run migrate
```

### הרצת בדיקות
```bash
npm test
```

## 📦 פריסה

### Docker
```bash
# בניית image
docker build -t family-budget-api .

# הרצה
docker run -p 3001:3001 family-budget-api
```

### Heroku
```bash
# התקנת Heroku CLI
heroku create family-budget-api

# הגדרת משתני סביבה
heroku config:set NODE_ENV=production
heroku config:set JWT_SECRET=your-secret

# פריסה
git push heroku main
```

## 🔧 משתני סביבה

```env
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=family_budget
DB_USER=postgres
DB_PASSWORD=your_password

# JWT
JWT_SECRET=your_super_secret_jwt_key
JWT_EXPIRES_IN=7d

# Server
PORT=3001
NODE_ENV=development

# CORS
ALLOWED_ORIGINS=http://localhost:5173

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

## 📞 תמיכה

לשאלות ותמיכה, פנה אל המפתח או צור issue ב-GitHub.

---

**נבנה עם ❤️ למשפחת מסינג**