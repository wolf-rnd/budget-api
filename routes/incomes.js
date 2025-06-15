const express = require('express');
const Joi = require('joi');
const pool = require('../config/database');
const { validateRequest, validateQuery } = require('../middleware/validation');

const router = express.Router();

// Validation schemas
const incomeSchema = Joi.object({
  name: Joi.string().min(2).max(255).required().messages({
    'string.min': 'שם ההכנסה חייב להכיל לפחות 2 תווים',
    'string.max': 'שם ההכנסה לא יכול להכיל יותר מ-255 תווים',
    'any.required': 'שם ההכנסה נדרש'
  }),
  amount: Joi.number().positive().required().messages({
    'number.positive': 'סכום ההכנסה חייב להיות חיובי',
    'any.required': 'סכום ההכנסה נדרש'
  }),
  source: Joi.string().max(255).optional().messages({
    'string.max': 'מקור ההכנסה לא יכול להכיל יותר מ-255 תווים'
  }),
  date: Joi.date().required().messages({
    'any.required': 'תאריך ההכנסה נדרש'
  }),
  note: Joi.string().max(1000).optional().messages({
    'string.max': 'הערה לא יכולה להכיל יותר מ-1000 תווים'
  })
});

const querySchema = Joi.object({
  budgetYearId: Joi.string().uuid().optional(),
  month: Joi.number().integer().min(1).max(12).optional(),
  year: Joi.number().integer().min(2020).max(2030).optional(),
  source: Joi.string().optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10)
});

// Get all incomes
router.get('/', validateQuery(querySchema), async (req, res) => {
  try {
    const userId = req.user.id;
    const { budgetYearId, month, year, source, page, limit } = req.query;
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT 
        i.id,
        i.name,
        i.amount,
        i.source,
        i.date,
        i.month,
        i.year,
        i.note,
        i.created_at,
        by.name as budget_year_name
      FROM incomes i
      JOIN budget_years by ON i.budget_year_id = by.id
      WHERE i.user_id = $1
    `;
    
    const params = [userId];
    let paramIndex = 2;
    
    if (budgetYearId) {
      query += ` AND i.budget_year_id = $${paramIndex}`;
      params.push(budgetYearId);
      paramIndex++;
    }
    
    if (month) {
      query += ` AND i.month = $${paramIndex}`;
      params.push(month);
      paramIndex++;
    }
    
    if (year) {
      query += ` AND i.year = $${paramIndex}`;
      params.push(year);
      paramIndex++;
    }
    
    if (source) {
      query += ` AND i.source ILIKE $${paramIndex}`;
      params.push(`%${source}%`);
      paramIndex++;
    }
    
    query += ` ORDER BY i.date DESC, i.created_at DESC`;
    query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);
    
    const result = await pool.query(query, params);
    
    // Get total count for pagination
    let countQuery = `
      SELECT COUNT(*) as total
      FROM incomes i
      WHERE i.user_id = $1
    `;
    
    const countParams = [userId];
    let countParamIndex = 2;
    
    if (budgetYearId) {
      countQuery += ` AND i.budget_year_id = $${countParamIndex}`;
      countParams.push(budgetYearId);
      countParamIndex++;
    }
    
    if (month) {
      countQuery += ` AND i.month = $${countParamIndex}`;
      countParams.push(month);
      countParamIndex++;
    }
    
    if (year) {
      countQuery += ` AND i.year = $${countParamIndex}`;
      countParams.push(year);
      countParamIndex++;
    }
    
    if (source) {
      countQuery += ` AND i.source ILIKE $${countParamIndex}`;
      countParams.push(`%${source}%`);
    }
    
    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].total);
    
    res.json({
      incomes: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
    
  } catch (error) {
    console.error('שגיאה בקבלת הכנסות:', error);
    res.status(500).json({
      error: 'שגיאת שרת',
      message: 'אירעה שגיאה בקבלת ההכנסות'
    });
  }
});

// Get income by ID
router.get('/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    
    const result = await pool.query(
      `SELECT 
        i.id,
        i.name,
        i.amount,
        i.source,
        i.date,
        i.month,
        i.year,
        i.note,
        i.created_at,
        i.updated_at,
        by.name as budget_year_name
      FROM incomes i
      JOIN budget_years by ON i.budget_year_id = by.id
      WHERE i.id = $1 AND i.user_id = $2`,
      [id, userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'הכנסה לא נמצאה',
        message: 'ההכנסה המבוקשת לא נמצאה'
      });
    }
    
    res.json(result.rows[0]);
    
  } catch (error) {
    console.error('שגיאה בקבלת הכנסה:', error);
    res.status(500).json({
      error: 'שגיאת שרת',
      message: 'אירעה שגיאה בקבלת ההכנסה'
    });
  }
});

// Create new income
router.post('/', validateRequest(incomeSchema), async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const userId = req.user.id;
    const { name, amount, source, date, note } = req.body;
    
    const incomeDate = new Date(date);
    const month = incomeDate.getMonth() + 1;
    const year = incomeDate.getFullYear();
    
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
    
    // Insert income
    const result = await client.query(
      `INSERT INTO incomes (user_id, budget_year_id, name, amount, source, date, month, year, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [userId, budgetYearId, name, amount, source, date, month, year, note]
    );
    
    await client.query('COMMIT');
    
    res.status(201).json({
      message: 'הכנסה נוספה בהצלחה',
      income: result.rows[0]
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('שגיאה בהוספת הכנסה:', error);
    res.status(500).json({
      error: 'שגיאת שרת',
      message: 'אירעה שגיאה בהוספת ההכנסה'
    });
  } finally {
    client.release();
  }
});

// Update income
router.put('/:id', validateRequest(incomeSchema), async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const userId = req.user.id;
    const { id } = req.params;
    const { name, amount, source, date, note } = req.body;
    
    const incomeDate = new Date(date);
    const month = incomeDate.getMonth() + 1;
    const year = incomeDate.getFullYear();
    
    // Check if income exists and belongs to user
    const existingResult = await client.query(
      'SELECT id FROM incomes WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    
    if (existingResult.rows.length === 0) {
      return res.status(404).json({
        error: 'הכנסה לא נמצאה',
        message: 'ההכנסה המבוקשת לא נמצאה'
      });
    }
    
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
    
    const budgetYearId = budgetYearResult.rows[0].id;
    
    // Update income
    const result = await client.query(
      `UPDATE incomes 
       SET budget_year_id = $1, name = $2, amount = $3, source = $4, date = $5, 
           month = $6, year = $7, note = $8, updated_at = CURRENT_TIMESTAMP
       WHERE id = $9 AND user_id = $10
       RETURNING *`,
      [budgetYearId, name, amount, source, date, month, year, note, id, userId]
    );
    
    await client.query('COMMIT');
    
    res.json({
      message: 'הכנסה עודכנה בהצלחה',
      income: result.rows[0]
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('שגיאה בעדכון הכנסה:', error);
    res.status(500).json({
      error: 'שגיאת שרת',
      message: 'אירעה שגיאה בעדכון ההכנסה'
    });
  } finally {
    client.release();
  }
});

// Delete income
router.delete('/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    
    const result = await pool.query(
      'DELETE FROM incomes WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'הכנסה לא נמצאה',
        message: 'ההכנסה המבוקשת לא נמצאה'
      });
    }
    
    res.json({
      message: 'הכנסה נמחקה בהצלחה'
    });
    
  } catch (error) {
    console.error('שגיאה במחיקת הכנסה:', error);
    res.status(500).json({
      error: 'שגיאת שרת',
      message: 'אירעה שגיאה במחיקת ההכנסה'
    });
  }
});

// Get income statistics
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
      FROM incomes
      WHERE user_id = $1
    `;
    
    const params = [userId];
    
    if (budgetYearId) {
      query += ' AND budget_year_id = $2';
      params.push(budgetYearId);
    }
    
    const result = await pool.query(query, params);
    
    // Get monthly breakdown
    let monthlyQuery = `
      SELECT 
        month,
        year,
        COUNT(*) as count,
        SUM(amount) as total
      FROM incomes
      WHERE user_id = $1
    `;
    
    if (budgetYearId) {
      monthlyQuery += ' AND budget_year_id = $2';
    }
    
    monthlyQuery += ' GROUP BY month, year ORDER BY year, month';
    
    const monthlyResult = await pool.query(monthlyQuery, params);
    
    res.json({
      summary: result.rows[0],
      monthly: monthlyResult.rows
    });
    
  } catch (error) {
    console.error('שגיאה בקבלת סטטיסטיקות הכנסות:', error);
    res.status(500).json({
      error: 'שגיאת שרת',
      message: 'אירעה שגיאה בקבלת הסטטיסטיקות'
    });
  }
});

module.exports = router;