const bcrypt = require('bcryptjs');
const { query, run, close } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

async function seedDatabase() {
  try {
    console.log('🌱 מתחיל זריעת נתוני דמו...');
    
    // Check if demo user already exists
    const existingUser = await query(
      'SELECT id FROM users WHERE email = ?',
      ['demo@example.com']
    );
    
    if (existingUser.rows.length > 0) {
      console.log('👤 משתמש דמו כבר קיים, מדלג על זריעה');
      return;
    }
    
    // Create demo user
    const passwordHash = await bcrypt.hash('demo123', 12);
    const userId = uuidv4();
    
    await run(
      `INSERT INTO users (id, email, password_hash, first_name, last_name) 
       VALUES (?, ?, ?, ?, ?)`,
      [userId, 'demo@example.com', passwordHash, 'נעמי', 'מסינג']
    );
    
    console.log('👤 משתמש דמו נוצר:', userId);
    
    // Create budget year
    const currentYear = new Date().getFullYear();
    const budgetYearId = uuidv4();
    
    await run(
      `INSERT INTO budget_years (id, user_id, name, start_date, end_date, is_active)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [budgetYearId, userId, `01/${currentYear.toString().slice(-2)} - 12/${currentYear.toString().slice(-2)}`, 
       `${currentYear}-01-01`, `${currentYear}-12-31`, 1]
    );
    
    console.log('📅 שנת תקציב נוצרה:', budgetYearId);
    
    // Create funds
    const funds = [
      { name: 'קופת שוטף', type: 'monthly', level: 1, include_in_budget: 1, amount: 3000, amount_given: 2500 },
      { name: 'תקציב שנתי', type: 'annual', level: 2, include_in_budget: 1, amount: 50000, spent: 20000 },
      { name: 'תקציב מורחב', type: 'annual', level: 2, include_in_budget: 1, amount: 30000, spent: 15000 },
      { name: 'בונוסים', type: 'savings', level: 3, include_in_budget: 0, amount: 12000 },
      { name: 'עודפים', type: 'savings', level: 3, include_in_budget: 0, amount: 8500 }
    ];
    
    const fundIds = {};
    for (const fund of funds) {
      const fundId = uuidv4();
      fundIds[fund.name] = fundId;
      
      await run(
        `INSERT INTO funds (id, user_id, name, type, level, include_in_budget)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [fundId, userId, fund.name, fund.type, fund.level, fund.include_in_budget]
      );
      
      // Create fund budget
      await run(
        `INSERT INTO fund_budgets (id, fund_id, budget_year_id, amount, amount_given, spent)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [uuidv4(), fundId, budgetYearId, fund.amount, fund.amount_given || null, fund.spent || null]
      );
    }
    
    console.log('💰 קופות נוצרו:', Object.keys(fundIds).length);
    
    // Create categories
    const categories = [
      { name: 'מזון', fund: 'קופת שוטף', color: 'bg-green-100 text-green-800 border-green-300' },
      { name: 'תחבורה', fund: 'קופת שוטף', color: 'bg-blue-100 text-blue-800 border-blue-300' },
      { name: 'בילויים קטנים', fund: 'קופת שוטף', color: 'bg-purple-100 text-purple-800 border-purple-300' },
      { name: 'שירותים', fund: 'קופת שוטף', color: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
      { name: 'תקשורת', fund: 'קופת שוטף', color: 'bg-indigo-100 text-indigo-800 border-indigo-300' },
      { name: 'ביגוד', fund: 'תקציב שנתי', color: 'bg-pink-100 text-pink-800 border-pink-300' },
      { name: 'ריהוט', fund: 'תקציב שנתי', color: 'bg-gray-100 text-gray-800 border-gray-300' },
      { name: 'מתנות', fund: 'תקציב שנתי', color: 'bg-red-100 text-red-800 border-red-300' },
      { name: 'דיור', fund: 'תקציב שנתי', color: 'bg-orange-100 text-orange-800 border-orange-300' },
      { name: 'ביטוח', fund: 'תקציב שנתי', color: 'bg-teal-100 text-teal-800 border-teal-300' },
      { name: 'בריאות', fund: 'תקציב שנתי', color: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
      { name: 'חינוך', fund: 'תקציב שנתי', color: 'bg-cyan-100 text-cyan-800 border-cyan-300' },
      { name: 'נופש', fund: 'תקציב מורחב', color: 'bg-lime-100 text-lime-800 border-lime-300' },
      { name: 'תחזוקה', fund: 'תקציב מורחב', color: 'bg-amber-100 text-amber-800 border-amber-300' },
      { name: 'השקעות קטנות', fund: 'תקציב מורחב', color: 'bg-violet-100 text-violet-800 border-violet-300' },
      { name: 'שונות', fund: 'קופת שוטף', color: 'bg-slate-100 text-slate-800 border-slate-300' }
    ];
    
    const categoryIds = {};
    for (const category of categories) {
      const fundId = fundIds[category.fund];
      if (fundId) {
        const categoryId = uuidv4();
        categoryIds[category.name] = categoryId;
        
        await run(
          `INSERT INTO categories (id, user_id, name, fund_id, color_class)
           VALUES (?, ?, ?, ?, ?)`,
          [categoryId, userId, category.name, fundId, category.color]
        );
      }
    }
    
    console.log('🏷️  קטגוריות נוצרו:', Object.keys(categoryIds).length);
    
    // Create sample incomes
    const incomes = [
      { name: 'משכורת ראשית', amount: 12000, source: 'חברה ראשית', date: `${currentYear}-05-01`, month: 5 },
      { name: 'משכורת שנייה', amount: 6000, source: 'חברה שנייה', date: `${currentYear}-05-01`, month: 5 },
      { name: 'פרילנס', amount: 3000, source: 'לקוח פרטי', date: `${currentYear}-04-15`, month: 4 },
      { name: 'בונוס', amount: 5000, source: 'חברה ראשית', date: `${currentYear}-03-01`, month: 3 }
    ];
    
    for (const income of incomes) {
      await run(
        `INSERT INTO incomes (id, user_id, budget_year_id, name, amount, source, date, month, year)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [uuidv4(), userId, budgetYearId, income.name, income.amount, income.source, income.date, income.month, currentYear]
      );
    }
    
    console.log('💵 הכנסות דמו נוצרו:', incomes.length);
    
    // Create sample expenses
    const expenses = [
      { name: 'קניות במכולת', amount: 2500, category: 'מזון', date: `${currentYear}-05-15` },
      { name: 'דלק לרכב', amount: 1200, category: 'תחבורה', date: `${currentYear}-05-10` },
      { name: 'בגדים לילדים', amount: 3500, category: 'ביגוד', date: `${currentYear}-05-05` },
      { name: 'תשלום משכנתא', amount: 8500, category: 'דיור', date: `${currentYear}-05-01` },
      { name: 'חשמל ומים', amount: 1800, category: 'שירותים', date: `${currentYear}-05-03` },
      { name: 'ביטוח רכב', amount: 2200, category: 'ביטוח', date: `${currentYear}-04-28` },
      { name: 'קניות בסופר', amount: 1800, category: 'מזון', date: `${currentYear}-04-25` },
      { name: 'תחזוקת רכב', amount: 2500, category: 'תחזוקה', date: `${currentYear}-04-20` }
    ];
    
    for (const expense of expenses) {
      const categoryId = categoryIds[expense.category];
      const category = categories.find(c => c.name === expense.category);
      const fundId = fundIds[category.fund];
      
      if (categoryId && fundId) {
        await run(
          `INSERT INTO expenses (id, user_id, budget_year_id, category_id, fund_id, name, amount, date)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [uuidv4(), userId, budgetYearId, categoryId, fundId, expense.name, expense.amount, expense.date]
        );
      }
    }
    
    console.log('💸 הוצאות דמו נוצרו:', expenses.length);
    
    // Create sample tithe
    const tithes = [
      { description: 'תרומה למוסד חינוך', amount: 1000, date: `${currentYear}-05-01`, note: 'תרומה חודשית' },
      { description: 'עזרה למשפחה', amount: 500, date: `${currentYear}-04-20`, note: 'עזרה חד פעמית' }
    ];
    
    for (const tithe of tithes) {
      await run(
        `INSERT INTO tithe_given (id, user_id, description, amount, date, note)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [uuidv4(), userId, tithe.description, tithe.amount, tithe.date, tithe.note]
      );
    }
    
    console.log('💝 מעשרות דמו נוצרו:', tithes.length);
    
    // Create sample debts
    const debts = [
      { description: 'הלוואה מההורים', amount: 15000, type: 'i_owe', note: 'החזר חודשי של 1000 ש"ח' },
      { description: 'כרטיס אשראי', amount: 3500, type: 'i_owe', note: 'יתרה חובה נוכחית' },
      { description: 'הלוואה לחבר', amount: 2000, type: 'owed_to_me', note: 'החזר בתשלומים' }
    ];
    
    for (const debt of debts) {
      await run(
        `INSERT INTO debts (id, user_id, description, amount, type, note)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [uuidv4(), userId, debt.description, debt.amount, debt.type, debt.note]
      );
    }
    
    console.log('💳 חובות דמו נוצרו:', debts.length);
    
    // Create sample tasks
    const tasks = [
      { description: 'לבדוק ביטוח רכב', important: 1 },
      { description: 'לתזמן פגישה עם רואה חשבון', important: 0 },
      { description: 'לעדכן פרטי בנק', important: 0 },
      { description: 'לשלם ארנונה', important: 1 }
    ];
    
    for (const task of tasks) {
      await run(
        `INSERT INTO tasks (id, user_id, description, important)
         VALUES (?, ?, ?, ?)`,
        [uuidv4(), userId, task.description, task.important]
      );
    }
    
    console.log('✅ משימות דמו נוצרו:', tasks.length);
    
    // Create sample asset snapshot
    const snapshotId = uuidv4();
    await run(
      `INSERT INTO asset_snapshots (id, user_id, date, note)
       VALUES (?, ?, ?, ?)`,
      [snapshotId, userId, `${currentYear}-05-01`, 'תמונת מצב ראשונית']
    );
    
    // Add asset details
    const assetDetails = [
      { type: 'compensation', name: 'פיצויים', amount: 85000, category: 'asset' },
      { type: 'pension_naomi', name: 'קה״ש נעמי שכירה', amount: 120000, category: 'asset' },
      { type: 'pension_yossi', name: 'קה״ש יוסי', amount: 95000, category: 'asset' },
      { type: 'savings_children', name: 'חסכון לכל ילד', amount: 45000, category: 'asset' },
      { type: 'anchor', name: 'עוגן', amount: 250000, category: 'liability' },
      { type: 'gmach_glik', name: 'גמ״ח גליק', amount: 50000, category: 'liability' },
      { type: 'mortgage', name: 'משכנתא', amount: 150000, category: 'liability' }
    ];
    
    for (const detail of assetDetails) {
      await run(
        `INSERT INTO asset_details (id, snapshot_id, asset_type, asset_name, amount, category)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [uuidv4(), snapshotId, detail.type, detail.name, detail.amount, detail.category]
      );
    }
    
    console.log('🏠 תמונת מצב נכסים נוצרה');
    
    // Create system settings
    const settings = [
      { key: 'tithe_percentage', value: '10', type: 'number' },
      { key: 'default_currency', value: 'ILS', type: 'string' }
    ];
    
    for (const setting of settings) {
      await run(
        `INSERT INTO system_settings (id, user_id, setting_key, setting_value, data_type)
         VALUES (?, ?, ?, ?, ?)`,
        [uuidv4(), userId, setting.key, setting.value, setting.type]
      );
    }
    
    console.log('⚙️  הגדרות מערכת נוצרו:', settings.length);
    
    console.log('🎉 זריעת נתוני דמו הושלמה בהצלחה!');
    console.log('📧 פרטי התחברות:');
    console.log('   אימייל: demo@example.com');
    console.log('   סיסמה: demo123');
    
  } catch (error) {
    console.error('❌ שגיאה בזריעת נתונים:', error);
    throw error;
  }
}

// Run seeding if this file is executed directly
if (require.main === module) {
  seedDatabase()
    .then(() => {
      console.log('✅ זריעה הושלמה');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ שגיאה בזריעה:', error);
      process.exit(1);
    });
}

module.exports = { seedDatabase };