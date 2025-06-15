const express = require('express');
const Joi = require('joi');
const pool = require('../config/database');
const { validateRequest } = require('../middleware/validation');

const router = express.Router();

// Validation schema
const budgetYearSchema = Joi.object({
  startDate: Joi.date().required().messages({
    'any.required': 'תאריך התחלה נדרש'
  }),
  endDate: Joi.date().greater(Joi.ref('startDate')).required().messages({
    'date.greater': 'תאריך סיום חייב להיות אחרי תאריך ההתחלה',
    'any.required': 'תאריך סיום נדרש'
  }),
  name: Joi.string().max(50).optional().messages({
    'string.max': 'שם שנת התקציב לא יכול להכיל יותר מ-50 תווים'
  })
});

// Get all budget years
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;
    
    const result = await pool.query(
      `SELECT 
        id,
        name,
        start_date,
        end_date,
        is_active,
        created_at,
        updated_at
      FROM budget_years 
      WHERE user_id = $1 
      ORDER BY start_date DESC`,
      [userId]
    );
    
    res.json(result.rows);
    
  } catch (error) {
    console.error('שגיאה בקבלת שנות תקציב:', error);
    res.status(500).json({
      error: 'שגיאת שרת',
      message: 'אירעה שגיאה בקבלת שנות התקציב'
    });
  }
});

// Get active budget year
router.get('/active', async (req, res) => {
  try {
    const userId = req.user.id;
    
    const result = await pool.query(
      `SELECT 
        id,
        name,
        start_date,
        end_date,
        is_active,
        created_at,
        updated_at
      FROM budget_years 
      WHERE user_id = $1 AND is_active = TRUE`,
      [userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'שנת תקציב פעילה לא נמצאה',
        message: 'לא נמצאה שנת תקציב פעילה'
      });
    }
    
    res.json(result.rows[0]);
    
  } catch (error) {
    console.error('שגיאה בקבלת שנת תקציב פעילה:', error);
    res.status(500).json({
      error: 'שגיאת שרת',
      message: 'אירעה שגיאה בקבלת שנת התקציב הפעילה'
    });
  }
});

// Get budget year by ID
router.get('/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    
    const result = await pool.query(
      `SELECT 
        id,
        name,
        start_date,
        end_date,
        is_active,
        created_at,
        updated_at
      FROM budget_years 
      WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'שנת תקציב לא נמצאה',
        message: 'שנת התקציב המבוקשת לא נמצאה'
      });
    }
    
    res.json(result.rows[0]);
    
  } catch (error) {
    console.error('שגיאה בקבלת שנת תקציב:', error);
    res.status(500).json({
      error: 'שגיאת שרת',
      message: 'אירעה שגיאה בקבלת שנת התקציב'
    });
  }
});

// Create new budget year
router.post('/', validateRequest(budgetYearSchema), async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const userId = req.user.id;
    const { startDate, endDate, name } = req.body;
    
    // Generate name if not provided
    let budgetYearName = name;
    if (!budgetYearName) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      const startMonth = String(start.getMonth() + 1).padStart(2, '0');
      const startYear = String(start.getFullYear()).slice(-2);
      const endMonth = String(end.getMonth() + 1).padStart(2, '0');
      const endYear = String(end.getFullYear()).slice(-2);
      budgetYearName = `${startMonth}/${startYear} - ${endMonth}/${endYear}`;
    }
    
    // Check for overlapping budget years
    const overlapResult = await client.query(
      `SELECT id FROM budget_years 
       WHERE user_id = $1 
       AND (
         (start_date <= $2 AND end_date >= $2) OR
         (start_date <= $3 AND end_date >= $3) OR
         (start_date >= $2 AND end_date <= $3)
       )`,
      [userId, startDate, endDate]
    );
    
    if (overlapResult.rows.length > 0) {
      return res.status(409).json({
        error: 'חפיפה בתאריכים',
        message: 'קיימת שנת תקציב אחרת שחופפת לתאריכים אלה'
      });
    }
    
    // Create budget year
    const budgetYearResult = await client.query(
      `INSERT INTO budget_years (user_id, name, start_date, end_date, is_active)
       VALUES ($1, $2, $3, $4, FALSE)
       RETURNING *`,
      [userId, budgetYearName, startDate, endDate]
    );
    
    const budgetYear = budgetYearResult.rows[0];
    
    // Copy funds from active budget year or create default funds
    const activeFundsResult = await client.query(
      `SELECT f.id, fb.amount 
       FROM funds f
       LEFT JOIN fund_budgets fb ON f.id = fb.fund_id
       LEFT JOIN budget_years by ON fb.budget_year_id = by.id AND by.is_active = TRUE
       WHERE f.user_id = $1 AND f.is_active = TRUE`,
      [userId]
    );
    
    if (activeFundsResult.rows.length > 0) {
      // Copy existing funds
      for (const fund of activeFundsResult.rows) {
        await client.query(
          `INSERT INTO fund_budgets (fund_id, budget_year_id, amount)
           VALUES ($1, $2, $3)`,
          [fund.id, budgetYear.id, fund.amount || 0]
        );
      }
    } else {
      // Create default funds if none exist
      const defaultFunds = [
        { name: 'קופת שוטף', type: 'monthly', level: 1, include_in_budget: true },
        { name: 'תקציב שנתי', type: 'annual', level: 2, include_in_budget: true },
        { name: 'תקציב מורחב', type: 'annual', level: 2, include_in_budget: true },
        { name: 'בונוסים', type: 'savings', level: 3, include_in_budget: false },
        { name: 'עודפים', type: 'savings', level: 3, include_in_budget: false }
      ];
      
      for (const fund of defaultFunds) {
        const fundResult = await client.query(
          `INSERT INTO funds (user_id, name, type, level, include_in_budget)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id`,
          [userId, fund.name, fund.type, fund.level, fund.include_in_budget]
        );
        
        await client.query(
          `INSERT INTO fund_budgets (fund_id, budget_year_id, amount)
           VALUES ($1, $2, $3)`,
          [fundResult.rows[0].id, budgetYear.id, 0]
        );
      }
    }
    
    await client.query('COMMIT');
    
    res.status(201).json({
      message: 'שנת תקציב נוצרה בהצלחה',
      budgetYear
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('שגיאה ביצירת שנת תקציב:', error);
    res.status(500).json({
      error: 'שגיאת שרת',
      message: 'אירעה שגיאה ביצירת שנת התקציב'
    });
  } finally {
    client.release();
  }
});

// Update budget year
router.put('/:id', validateRequest(budgetYearSchema), async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { startDate, endDate, name } = req.body;
    
    // Generate name if not provided
    let budgetYearName = name;
    if (!budgetYearName) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      const startMonth = String(start.getMonth() + 1).padStart(2, '0');
      const startYear = String(start.getFullYear()).slice(-2);
      const endMonth = String(end.getMonth() + 1).padStart(2, '0');
      const endYear = String(end.getFullYear()).slice(-2);
      budgetYearName = `${startMonth}/${startYear} - ${endMonth}/${endYear}`;
    }
    
    // Check if budget year exists and belongs to user
    const existingResult = await pool.query(
      'SELECT id FROM budget_years WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    
    if (existingResult.rows.length === 0) {
      return res.status(404).json({
        error: 'שנת תקציב לא נמצאה',
        message: 'שנת התקציב המבוקשת לא נמצאה'
      });
    }
    
    // Check for overlapping budget years (excluding current one)
    const overlapResult = await pool.query(
      `SELECT id FROM budget_years 
       WHERE user_id = $1 AND id != $2
       AND (
         (start_date <= $3 AND end_date >= $3) OR
         (start_date <= $4 AND end_date >= $4) OR
         (start_date >= $3 AND end_date <= $4)
       )`,
      [userId, id, startDate, endDate]
    );
    
    if (overlapResult.rows.length > 0) {
      return res.status(409).json({
        error: 'חפיפה בתאריכים',
        message: 'קיימת שנת תקציב אחרת שחופפת לתאריכים אלה'
      });
    }
    
    // Update budget year
    const result = await pool.query(
      `UPDATE budget_years 
       SET name = $1, start_date = $2, end_date = $3, updated_at = CURRENT_TIMESTAMP
       WHERE id = $4 AND user_id = $5
       RETURNING *`,
      [budgetYearName, startDate, endDate, id, userId]
    );
    
    res.json({
      message: 'שנת תקציב עודכנה בהצלחה',
      budgetYear: result.rows[0]
    });
    
  } catch (error) {
    console.error('שגיאה בעדכון שנת תקציב:', error);
    res.status(500).json({
      error: 'שגיאת שרת',
      message: 'אירעה שגיאה בעדכון שנת התקציב'
    });
  }
});

// Set active budget year
router.put('/:id/activate', async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const userId = req.user.id;
    const { id } = req.params;
    
    // Check if budget year exists and belongs to user
    const existingResult = await client.query(
      'SELECT id FROM budget_years WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    
    if (existingResult.rows.length === 0) {
      return res.status(404).json({
        error: 'שנת תקציב לא נמצאה',
        message: 'שנת התקציב המבוקשת לא נמצאה'
      });
    }
    
    // Deactivate all other budget years
    await client.query(
      'UPDATE budget_years SET is_active = FALSE WHERE user_id = $1',
      [userId]
    );
    
    // Activate the requested budget year
    const result = await client.query(
      `UPDATE budget_years 
       SET is_active = TRUE, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [id, userId]
    );
    
    await client.query('COMMIT');
    
    res.json({
      message: 'שנת תקציב הופעלה בהצלחה',
      budgetYear: result.rows[0]
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('שגיאה בהפעלת שנת תקציב:', error);
    res.status(500).json({
      error: 'שגיאת שרת',
      message: 'אירעה שגיאה בהפעלת שנת התקציב'
    });
  } finally {
    client.release();
  }
});

// Delete budget year
router.delete('/:id', async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const userId = req.user.id;
    const { id } = req.params;
    
    // Check if budget year exists and belongs to user
    const existingResult = await client.query(
      'SELECT id, is_active FROM budget_years WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    
    if (existingResult.rows.length === 0) {
      return res.status(404).json({
        error: 'שנת תקציב לא נמצאה',
        message: 'שנת התקציב המבוקשת לא נמצאה'
      });
    }
    
    const budgetYear = existingResult.rows[0];
    
    // Check if there are any incomes or expenses
    const dataResult = await client.query(
      `SELECT 
        (SELECT COUNT(*) FROM incomes WHERE budget_year_id = $1) as income_count,
        (SELECT COUNT(*) FROM expenses WHERE budget_year_id = $1) as expense_count`,
      [id]
    );
    
    const { income_count, expense_count } = dataResult.rows[0];
    
    if (parseInt(income_count) > 0 || parseInt(expense_count) > 0) {
      return res.status(409).json({
        error: 'לא ניתן למחוק',
        message: 'לא ניתן למחוק שנת תקציב שמכילה הכנסות או הוצאות'
      });
    }
    
    // Delete fund budgets first
    await client.query(
      'DELETE FROM fund_budgets WHERE budget_year_id = $1',
      [id]
    );
    
    // Delete budget year
    await client.query(
      'DELETE FROM budget_years WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    
    // If this was the active budget year, activate the most recent one
    if (budgetYear.is_active) {
      await client.query(
        `UPDATE budget_years 
         SET is_active = TRUE 
         WHERE user_id = $1 
         AND id = (
           SELECT id FROM budget_years 
           WHERE user_id = $1 
           ORDER BY start_date DESC 
           LIMIT 1
         )`,
        [userId]
      );
    }
    
    await client.query('COMMIT');
    
    res.json({
      message: 'שנת תקציב נמחקה בהצלחה'
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('שגיאה במחיקת שנת תקציב:', error);
    res.status(500).json({
      error: 'שגיאת שרת',
      message: 'אירעה שגיאה במחיקת שנת התקציב'
    });
  } finally {
    client.release();
  }
});

module.exports = router;