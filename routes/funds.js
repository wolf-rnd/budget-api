const express = require('express');
const Joi = require('joi');
const pool = require('../config/database');
const { validateRequest } = require('../middleware/validation');

const router = express.Router();

// Validation schema
const fundSchema = Joi.object({
  name: Joi.string().min(2).max(100).required().messages({
    'string.min': 'שם הקופה חייב להכיל לפחות 2 תווים',
    'string.max': 'שם הקופה לא יכול להכיל יותר מ-100 תווים',
    'any.required': 'שם הקופה נדרש'
  }),
  type: Joi.string().valid('monthly', 'annual', 'savings').required().messages({
    'any.only': 'סוג הקופה חייב להיות: monthly, annual או savings',
    'any.required': 'סוג הקופה נדרש'
  }),
  level: Joi.number().integer().valid(1, 2, 3).required().messages({
    'any.only': 'רמת הקופה חייבת להיות 1, 2 או 3',
    'any.required': 'רמת הקופה נדרשת'
  }),
  includeInBudget: Joi.boolean().default(true),
  displayOrder: Joi.number().integer().min(0).default(0)
});

const fundBudgetSchema = Joi.object({
  amount: Joi.number().min(0).required().messages({
    'number.min': 'סכום התקציב חייב להיות חיובי או אפס',
    'any.required': 'סכום התקציב נדרש'
  }),
  amountGiven: Joi.number().min(0).optional().messages({
    'number.min': 'סכום שניתן חייב להיות חיובי או אפס'
  }),
  spent: Joi.number().min(0).optional().messages({
    'number.min': 'סכום שהוצא חייב להיות חיובי או אפס'
  })
});

// Get all funds
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const { budgetYearId } = req.query;
    
    let query = `
      SELECT 
        f.id,
        f.name,
        f.type,
        f.level,
        f.include_in_budget,
        f.display_order,
        f.is_active,
        f.created_at,
        f.updated_at
    `;
    
    const params = [userId];
    
    if (budgetYearId) {
      query += `,
        fb.amount as budget_amount,
        fb.amount_given,
        fb.spent,
        CASE 
          WHEN f.type = 'monthly' THEN fb.amount - COALESCE(fb.amount_given, 0)
          ELSE fb.amount - COALESCE(fb.spent, 0)
        END as remaining_amount
      FROM funds f
      LEFT JOIN fund_budgets fb ON f.id = fb.fund_id AND fb.budget_year_id = $2
      WHERE f.user_id = $1 AND f.is_active = TRUE`;
      params.push(budgetYearId);
    } else {
      query += `
      FROM funds f
      WHERE f.user_id = $1 AND f.is_active = TRUE`;
    }
    
    query += ' ORDER BY f.level, f.display_order, f.name';
    
    const result = await pool.query(query, params);
    
    res.json(result.rows);
    
  } catch (error) {
    console.error('שגיאה בקבלת קופות:', error);
    res.status(500).json({
      error: 'שגיאת שרת',
      message: 'אירעה שגיאה בקבלת הקופות'
    });
  }
});

// Get fund by ID
router.get('/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { budgetYearId } = req.query;
    
    let query = `
      SELECT 
        f.id,
        f.name,
        f.type,
        f.level,
        f.include_in_budget,
        f.display_order,
        f.is_active,
        f.created_at,
        f.updated_at
    `;
    
    const params = [id, userId];
    
    if (budgetYearId) {
      query += `,
        fb.amount as budget_amount,
        fb.amount_given,
        fb.spent,
        CASE 
          WHEN f.type = 'monthly' THEN fb.amount - COALESCE(fb.amount_given, 0)
          ELSE fb.amount - COALESCE(fb.spent, 0)
        END as remaining_amount
      FROM funds f
      LEFT JOIN fund_budgets fb ON f.id = fb.fund_id AND fb.budget_year_id = $3
      WHERE f.id = $1 AND f.user_id = $2`;
      params.push(budgetYearId);
    } else {
      query += `
      FROM funds f
      WHERE f.id = $1 AND f.user_id = $2`;
    }
    
    const result = await pool.query(query, params);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'קופה לא נמצאה',
        message: 'הקופה המבוקשת לא נמצאה'
      });
    }
    
    res.json(result.rows[0]);
    
  } catch (error) {
    console.error('שגיאה בקבלת קופה:', error);
    res.status(500).json({
      error: 'שגיאת שרת',
      message: 'אירעה שגיאה בקבלת הקופה'
    });
  }
});

// Create new fund
router.post('/', validateRequest(fundSchema), async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const userId = req.user.id;
    const { name, type, level, includeInBudget, displayOrder } = req.body;
    
    // Check if fund name already exists for user
    const existingResult = await client.query(
      'SELECT id FROM funds WHERE user_id = $1 AND name = $2',
      [userId, name]
    );
    
    if (existingResult.rows.length > 0) {
      return res.status(409).json({
        error: 'שם קופה קיים',
        message: 'קופה עם שם זה כבר קיימת'
      });
    }
    
    // Create fund
    const fundResult = await client.query(
      `INSERT INTO funds (user_id, name, type, level, include_in_budget, display_order)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [userId, name, type, level, includeInBudget, displayOrder]
    );
    
    const fund = fundResult.rows[0];
    
    // Create fund budgets for all existing budget years
    const budgetYearsResult = await client.query(
      'SELECT id FROM budget_years WHERE user_id = $1',
      [userId]
    );
    
    for (const budgetYear of budgetYearsResult.rows) {
      await client.query(
        `INSERT INTO fund_budgets (fund_id, budget_year_id, amount)
         VALUES ($1, $2, $3)`,
        [fund.id, budgetYear.id, 0]
      );
    }
    
    await client.query('COMMIT');
    
    res.status(201).json({
      message: 'קופה נוצרה בהצלחה',
      fund
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('שגיאה ביצירת קופה:', error);
    res.status(500).json({
      error: 'שגיאת שרת',
      message: 'אירעה שגיאה ביצירת הקופה'
    });
  } finally {
    client.release();
  }
});

// Update fund
router.put('/:id', validateRequest(fundSchema), async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { name, type, level, includeInBudget, displayOrder } = req.body;
    
    // Check if fund exists and belongs to user
    const existingResult = await pool.query(
      'SELECT id FROM funds WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    
    if (existingResult.rows.length === 0) {
      return res.status(404).json({
        error: 'קופה לא נמצאה',
        message: 'הקופה המבוקשת לא נמצאה'
      });
    }
    
    // Check if new name conflicts with existing fund (excluding current one)
    const nameConflictResult = await pool.query(
      'SELECT id FROM funds WHERE user_id = $1 AND name = $2 AND id != $3',
      [userId, name, id]
    );
    
    if (nameConflictResult.rows.length > 0) {
      return res.status(409).json({
        error: 'שם קופה קיים',
        message: 'קופה אחרת עם שם זה כבר קיימת'
      });
    }
    
    // Update fund
    const result = await pool.query(
      `UPDATE funds 
       SET name = $1, type = $2, level = $3, include_in_budget = $4, 
           display_order = $5, updated_at = CURRENT_TIMESTAMP
       WHERE id = $6 AND user_id = $7
       RETURNING *`,
      [name, type, level, includeInBudget, displayOrder, id, userId]
    );
    
    res.json({
      message: 'קופה עודכנה בהצלחה',
      fund: result.rows[0]
    });
    
  } catch (error) {
    console.error('שגיאה בעדכון קופה:', error);
    res.status(500).json({
      error: 'שגיאת שרת',
      message: 'אירעה שגיאה בעדכון הקופה'
    });
  }
});

// Update fund budget for specific budget year
router.put('/:id/budget/:budgetYearId', validateRequest(fundBudgetSchema), async (req, res) => {
  try {
    const userId = req.user.id;
    const { id, budgetYearId } = req.params;
    const { amount, amountGiven, spent } = req.body;
    
    // Verify fund belongs to user
    const fundResult = await pool.query(
      'SELECT id FROM funds WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    
    if (fundResult.rows.length === 0) {
      return res.status(404).json({
        error: 'קופה לא נמצאה',
        message: 'הקופה המבוקשת לא נמצאה'
      });
    }
    
    // Verify budget year belongs to user
    const budgetYearResult = await pool.query(
      'SELECT id FROM budget_years WHERE id = $1 AND user_id = $2',
      [budgetYearId, userId]
    );
    
    if (budgetYearResult.rows.length === 0) {
      return res.status(404).json({
        error: 'שנת תקציב לא נמצאה',
        message: 'שנת התקציב המבוקשת לא נמצאה'
      });
    }
    
    // Update or create fund budget
    const result = await pool.query(
      `INSERT INTO fund_budgets (fund_id, budget_year_id, amount, amount_given, spent)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (fund_id, budget_year_id)
       DO UPDATE SET 
         amount = EXCLUDED.amount,
         amount_given = EXCLUDED.amount_given,
         spent = EXCLUDED.spent,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [id, budgetYearId, amount, amountGiven, spent]
    );
    
    res.json({
      message: 'תקציב קופה עודכן בהצלחה',
      fundBudget: result.rows[0]
    });
    
  } catch (error) {
    console.error('שגיאה בעדכון תקציב קופה:', error);
    res.status(500).json({
      error: 'שגיאת שרת',
      message: 'אירעה שגיאה בעדכון תקציב הקופה'
    });
  }
});

// Delete fund (soft delete)
router.delete('/:id', async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const userId = req.user.id;
    const { id } = req.params;
    
    // Check if fund exists and belongs to user
    const existingResult = await client.query(
      'SELECT id FROM funds WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    
    if (existingResult.rows.length === 0) {
      return res.status(404).json({
        error: 'קופה לא נמצאה',
        message: 'הקופה המבוקשת לא נמצאה'
      });
    }
    
    // Check if fund has any expenses
    const expensesResult = await client.query(
      'SELECT COUNT(*) as count FROM expenses WHERE fund_id = $1',
      [id]
    );
    
    if (parseInt(expensesResult.rows[0].count) > 0) {
      return res.status(409).json({
        error: 'לא ניתן למחוק',
        message: 'לא ניתן למחוק קופה שמכילה הוצאות. ניתן להפוך אותה ללא פעילה.'
      });
    }
    
    // Check if fund has any categories
    const categoriesResult = await client.query(
      'SELECT COUNT(*) as count FROM categories WHERE fund_id = $1',
      [id]
    );
    
    if (parseInt(categoriesResult.rows[0].count) > 0) {
      return res.status(409).json({
        error: 'לא ניתן למחוק',
        message: 'לא ניתן למחוק קופה שמכילה קטגוריות. נא למחוק תחילה את הקטגוריות.'
      });
    }
    
    // Delete fund budgets
    await client.query(
      'DELETE FROM fund_budgets WHERE fund_id = $1',
      [id]
    );
    
    // Delete fund
    await client.query(
      'DELETE FROM funds WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    
    await client.query('COMMIT');
    
    res.json({
      message: 'קופה נמחקה בהצלחה'
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('שגיאה במחיקת קופה:', error);
    res.status(500).json({
      error: 'שגיאת שרת',
      message: 'אירעה שגיאה במחיקת הקופה'
    });
  } finally {
    client.release();
  }
});

// Deactivate fund (soft delete alternative)
router.put('/:id/deactivate', async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    
    // Check if fund exists and belongs to user
    const existingResult = await pool.query(
      'SELECT id FROM funds WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    
    if (existingResult.rows.length === 0) {
      return res.status(404).json({
        error: 'קופה לא נמצאה',
        message: 'הקופה המבוקשת לא נמצאה'
      });
    }
    
    // Deactivate fund
    const result = await pool.query(
      `UPDATE funds 
       SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [id, userId]
    );
    
    res.json({
      message: 'קופה הופכה ללא פעילה בהצלחה',
      fund: result.rows[0]
    });
    
  } catch (error) {
    console.error('שגיאה בהפיכת קופה ללא פעילה:', error);
    res.status(500).json({
      error: 'שגיאת שרת',
      message: 'אירעה שגיאה בהפיכת הקופה ללא פעילה'
    });
  }
});

// Reactivate fund
router.put('/:id/activate', async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    
    // Check if fund exists and belongs to user
    const existingResult = await pool.query(
      'SELECT id FROM funds WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    
    if (existingResult.rows.length === 0) {
      return res.status(404).json({
        error: 'קופה לא נמצאה',
        message: 'הקופה המבוקשת לא נמצאה'
      });
    }
    
    // Activate fund
    const result = await pool.query(
      `UPDATE funds 
       SET is_active = TRUE, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [id, userId]
    );
    
    res.json({
      message: 'קופה הופעלה בהצלחה',
      fund: result.rows[0]
    });
    
  } catch (error) {
    console.error('שגיאה בהפעלת קופה:', error);
    res.status(500).json({
      error: 'שגיאת שרת',
      message: 'אירעה שגיאה בהפעלת הקופה'
    });
  }
});

module.exports = router;