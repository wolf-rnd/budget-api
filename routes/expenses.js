const express = require('express');
const Joi = require('joi');
const pool = require('../config/database');
const { validateRequest, validateQuery } = require('../middleware/validation');

const router = express.Router();

// Validation schemas
const expenseSchema = Joi.object({
  name: Joi.string().min(2).max(255).required().messages({
    'string.min': 'שם ההוצאה חייב להכיל לפחות 2 תווים',
    'string.max': 'שם ההוצאה לא יכול להכיל יותר מ-255 תווים',
    'any.required': 'שם ההוצאה נדרש'
  }),
  amount: Joi.number().positive().required().messages({
    'number.positive': 'סכום ההוצאה חייב להיות חיובי',
    'any.required': 'סכום ההוצאה נדרש'
  }),
  categoryId: Joi.string().uuid().required().messages({
    'string.uuid': 'מזהה קטגוריה לא תקין',
    'any.required': 'קטגוריה נדרשת'
  }),
  date: Joi.date().required().messages({
    'any.required': 'תאריך ההוצאה נדרש'
  }),
  note: Joi.string().max(1000).optional().messages({
    'string.max': 'הערה לא יכולה להכיל יותר מ-1000 תווים'
  })
});

const querySchema = Joi.object({
  budgetYearId: Joi.string().uuid().optional(),
  categoryId: Joi.string().uuid().optional(),
  fundId: Joi.string().uuid().optional(),
  startDate: Joi.date().optional(),
  endDate: Joi.date().optional(),
  minAmount: Joi.number().positive().optional(),
  maxAmount: Joi.number().positive().optional(),
  search: Joi.string().optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10)
});

// Get all expenses
router.get('/', validateQuery(querySchema), async (req, res) => {
  try {
    const userId = req.user.id;
    const { 
      budgetYearId, categoryId, fundId, startDate, endDate, 
      minAmount, maxAmount, search, page, limit 
    } = req.query;
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT 
        e.id,
        e.name,
        e.amount,
        e.date,
        e.note,
        e.created_at,
        c.name as category_name,
        c.color_class,
        f.name as fund_name,
        f.type as fund_type,
        by.name as budget_year_name
      FROM expenses e
      JOIN categories c ON e.category_id = c.id
      JOIN funds f ON e.fund_id = f.id
      JOIN budget_years by ON e.budget_year_id = by.id
      WHERE e.user_id = $1
    `;
    
    const params = [userId];
    let paramIndex = 2;
    
    if (budgetYearId) {
      query += ` AND e.budget_year_id = $${paramIndex}`;
      params.push(budgetYearId);
      paramIndex++;
    }
    
    if (categoryId) {
      query += ` AND e.category_id = $${paramIndex}`;
      params.push(categoryId);
      paramIndex++;
    }
    
    if (fundId) {
      query += ` AND e.fund_id = $${paramIndex}`;
      params.push(fundId);
      paramIndex++;
    }
    
    if (startDate) {
      query += ` AND e.date >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }
    
    if (endDate) {
      query += ` AND e.date <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }
    
    if (minAmount) {
      query += ` AND e.amount >= $${paramIndex}`;
      params.push(minAmount);
      paramIndex++;
    }
    
    if (maxAmount) {
      query += ` AND e.amount <= $${paramIndex}`;
      params.push(maxAmount);
      paramIndex++;
    }
    
    if (search) {
      query += ` AND (e.name ILIKE $${paramIndex} OR e.note ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }
    
    query += ` ORDER BY e.date DESC, e.created_at DESC`;
    query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);
    
    const result = await pool.query(query, params);
    
    // Get total count for pagination
    let countQuery = `
      SELECT COUNT(*) as total
      FROM expenses e
      WHERE e.user_id = $1
    `;
    
    const countParams = [userId];
    let countParamIndex = 2;
    
    if (budgetYearId) {
      countQuery += ` AND e.budget_year_id = $${countParamIndex}`;
      countParams.push(budgetYearId);
      countParamIndex++;
    }
    
    if (categoryId) {
      countQuery += ` AND e.category_id = $${countParamIndex}`;
      countParams.push(categoryId);
      countParamIndex++;
    }
    
    if (fundId) {
      countQuery += ` AND e.fund_id = $${countParamIndex}`;
      countParams.push(fundId);
      countParamIndex++;
    }
    
    if (startDate) {
      countQuery += ` AND e.date >= $${countParamIndex}`;
      countParams.push(startDate);
      countParamIndex++;
    }
    
    if (endDate) {
      countQuery += ` AND e.date <= $${countParamIndex}`;
      countParams.push(endDate);
      countParamIndex++;
    }
    
    if (minAmount) {
      countQuery += ` AND e.amount >= $${countParamIndex}`;
      countParams.push(minAmount);
      countParamIndex++;
    }
    
    if (maxAmount) {
      countQuery += ` AND e.amount <= $${countParamIndex}`;
      countParams.push(maxAmount);
      countParamIndex++;
    }
    
    if (search) {
      countQuery += ` AND (e.name ILIKE $${countParamIndex} OR e.note ILIKE $${countParamIndex})`;
      countParams.push(`%${search}%`);
    }
    
    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].total);
    
    res.json({
      expenses: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
    
  } catch (error) {
    console.error('שגיאה בקבלת הוצאות:', error);
    res.status(500).json({
      error: 'שגיאת שרת',
      message: 'אירעה שגיאה בקבלת ההוצאות'
    });
  }
});

// Get expense by ID
router.get('/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    
    const result = await pool.query(
      `SELECT 
        e.id,
        e.name,
        e.amount,
        e.date,
        e.note,
        e.created_at,
        e.updated_at,
        c.id as category_id,
        c.name as category_name,
        c.color_class,
        f.id as fund_id,
        f.name as fund_name,
        f.type as fund_type,
        by.name as budget_year_name
      FROM expenses e
      JOIN categories c ON e.category_id = c.id
      JOIN funds f ON e.fund_id = f.id
      JOIN budget_years by ON e.budget_year_id = by.id
      WHERE e.id = $1 AND e.user_id = $2`,
      [id, userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'הוצאה לא נמצאה',
        message: 'ההוצאה המבוקשת לא נמצאה'
      });
    }
    
    res.json(result.rows[0]);
    
  } catch (error) {
    console.error('שגיאה בקבלת הוצאה:', error);
    res.status(500).json({
      error: 'שגיאת שרת',
      message: 'אירעה שגיאה בקבלת ההוצאה'
    });
  }
});

// Create new expense
router.post('/', validateRequest(expenseSchema), async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const userId = req.user.id;
    const { name, amount, categoryId, date, note } = req.body;
    
    // Verify category belongs to user and get fund_id
    const categoryResult = await client.query(
      'SELECT id, fund_id FROM categories WHERE id = $1 AND user_id = $2',
      [categoryId, userId]
    );
    
    if (categoryResult.rows.length === 0) {
      return res.status(400).json({
        error: 'קטגוריה לא נמצאה',
        message: 'הקטגוריה המבוקשת לא נמצאה או אינה שייכת למשתמש'
      });
    }
    
    const fundId = categoryResult.rows[0].fund_id;
    
    // Find budget year for this date
    const budgetYearResult = await client.query(
      'SELECT id FROM budget_years WHERE user_id = $1 AND $2 BETWEEN start_date AND end_date',
      [userId, date]
    );
    
    if (budgetYearResult.rows.length === 0) {
      return res.status(400).json({
        error: 'שנת תקציב לא נמצאה',
        message: 'לא נמצאה שנת תקציב מתאימה לתאריך זה'
      });
    }
    
    const budgetYearId = budgetYearResult.rows[0].id;
    
    // Insert expense
    const expenseResult = await client.query(
      `INSERT INTO expenses (user_id, budget_year_id, category_id, fund_id, name, amount, date, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [userId, budgetYearId, categoryId, fundId, name, amount, date, note]
    );
    
    // Update fund budget spent amount
    await client.query(
      `UPDATE fund_budgets 
       SET spent = COALESCE(spent, 0) + $1, updated_at = CURRENT_TIMESTAMP
       WHERE fund_id = $2 AND budget_year_id = $3`,
      [amount, fundId, budgetYearId]
    );
    
    await client.query('COMMIT');
    
    res.status(201).json({
      message: 'הוצאה נוספה בהצלחה',
      expense: expenseResult.rows[0]
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('שגיאה בהוספת הוצאה:', error);
    res.status(500).json({
      error: 'שגיאת שרת',
      message: 'אירעה שגיאה בהוספת ההוצאה'
    });
  } finally {
    client.release();
  }
});

// Update expense
router.put('/:id', validateRequest(expenseSchema), async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const userId = req.user.id;
    const { id } = req.params;
    const { name, amount, categoryId, date, note } = req.body;
    
    // Get existing expense
    const existingResult = await client.query(
      'SELECT amount, fund_id, budget_year_id FROM expenses WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    
    if (existingResult.rows.length === 0) {
      return res.status(404).json({
        error: 'הוצאה לא נמצאה',
        message: 'ההוצאה המבוקשת לא נמצאה'
      });
    }
    
    const existingExpense = existingResult.rows[0];
    
    // Verify new category belongs to user and get fund_id
    const categoryResult = await client.query(
      'SELECT id, fund_id FROM categories WHERE id = $1 AND user_id = $2',
      [categoryId, userId]
    );
    
    if (categoryResult.rows.length === 0) {
      return res.status(400).json({
        error: 'קטגוריה לא נמצאה',
        message: 'הקטגוריה המבוקשת לא נמצאה או אינה שייכת למשתמש'
      });
    }
    
    const newFundId = categoryResult.rows[0].fund_id;
    
    // Find budget year for new date
    const budgetYearResult = await client.query(
      'SELECT id FROM budget_years WHERE user_id = $1 AND $2 BETWEEN start_date AND end_date',
      [userId, date]
    );
    
    if (budgetYearResult.rows.length === 0) {
      return res.status(400).json({
        error: 'שנת תקציב לא נמצאה',
        message: 'לא נמצאה שנת תקציב מתאימה לתאריך זה'
      });
    }
    
    const newBudgetYearId = budgetYearResult.rows[0].id;
    
    // Revert old fund budget
    await client.query(
      `UPDATE fund_budgets 
       SET spent = COALESCE(spent, 0) - $1, updated_at = CURRENT_TIMESTAMP
       WHERE fund_id = $2 AND budget_year_id = $3`,
      [existingExpense.amount, existingExpense.fund_id, existingExpense.budget_year_id]
    );
    
    // Update expense
    const result = await client.query(
      `UPDATE expenses 
       SET budget_year_id = $1, category_id = $2, fund_id = $3, name = $4, 
           amount = $5, date = $6, note = $7, updated_at = CURRENT_TIMESTAMP
       WHERE id = $8 AND user_id = $9
       RETURNING *`,
      [newBudgetYearId, categoryId, newFundId, name, amount, date, note, id, userId]
    );
    
    // Update new fund budget
    await client.query(
      `UPDATE fund_budgets 
       SET spent = COALESCE(spent, 0) + $1, updated_at = CURRENT_TIMESTAMP
       WHERE fund_id = $2 AND budget_year_id = $3`,
      [amount, newFundId, newBudgetYearId]
    );
    
    await client.query('COMMIT');
    
    res.json({
      message: 'הוצאה עודכנה בהצלחה',
      expense: result.rows[0]
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('שגיאה בעדכון הוצאה:', error);
    res.status(500).json({
      error: 'שגיאת שרת',
      message: 'אירעה שגיאה בעדכון ההוצאה'
    });
  } finally {
    client.release();
  }
});

// Delete expense
router.delete('/:id', async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const userId = req.user.id;
    const { id } = req.params;
    
    // Get expense details before deletion
    const expenseResult = await client.query(
      'SELECT amount, fund_id, budget_year_id FROM expenses WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    
    if (expenseResult.rows.length === 0) {
      return res.status(404).json({
        error: 'הוצאה לא נמצאה',
        message: 'ההוצאה המבוקשת לא נמצאה'
      });
    }
    
    const expense = expenseResult.rows[0];
    
    // Delete expense
    await client.query(
      'DELETE FROM expenses WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    
    // Revert fund budget
    await client.query(
      `UPDATE fund_budgets 
       SET spent = COALESCE(spent, 0) - $1, updated_at = CURRENT_TIMESTAMP
       WHERE fund_id = $2 AND budget_year_id = $3`,
      [expense.amount, expense.fund_id, expense.budget_year_id]
    );
    
    await client.query('COMMIT');
    
    res.json({
      message: 'הוצאה נמחקה בהצלחה'
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('שגיאה במחיקת הוצאה:', error);
    res.status(500).json({
      error: 'שגיאת שרת',
      message: 'אירעה שגיאה במחיקת ההוצאה'
    });
  } finally {
    client.release();
  }
});

// Get expense statistics
router.get('/stats/summary', async (req, res) => {
  try {
    const userId = req.user.id;
    const { budgetYearId } = req.query;
    
    let query = `
      SELECT 
        COUNT(*) as total_count,
        SUM(amount) as total_amount,
        AVG(amount) as average_amount,
        MIN(amount) as min_amount,
        MAX(amount) as max_amount,
        MIN(date) as earliest_date,
        MAX(date) as latest_date
      FROM expenses
      WHERE user_id = $1
    `;
    
    const params = [userId];
    
    if (budgetYearId) {
      query += ' AND budget_year_id = $2';
      params.push(budgetYearId);
    }
    
    const result = await pool.query(query, params);
    
    // Get by category
    let categoryQuery = `
      SELECT 
        c.name as category_name,
        c.color_class,
        COUNT(e.id) as count,
        SUM(e.amount) as total
      FROM categories c
      LEFT JOIN expenses e ON c.id = e.category_id AND e.user_id = $1
    `;
    
    if (budgetYearId) {
      categoryQuery += ' AND e.budget_year_id = $2';
    }
    
    categoryQuery += ' WHERE c.user_id = $1 GROUP BY c.id, c.name, c.color_class ORDER BY total DESC';
    
    const categoryResult = await pool.query(categoryQuery, params);
    
    res.json({
      summary: result.rows[0],
      byCategory: categoryResult.rows
    });
    
  } catch (error) {
    console.error('שגיאה בקבלת סטטיסטיקות הוצאות:', error);
    res.status(500).json({
      error: 'שגיאת שרת',
      message: 'אירעה שגיאה בקבלת הסטטיסטיקות'
    });
  }
});

module.exports = router;