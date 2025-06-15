const express = require('express');
const Joi = require('joi');
const pool = require('../config/database');
const { validateRequest, validateQuery } = require('../middleware/validation');

const router = express.Router();

// Validation schemas
const titheSchema = Joi.object({
  description: Joi.string().min(2).max(255).required().messages({
    'string.min': 'תיאור המעשר חייב להכיל לפחות 2 תווים',
    'string.max': 'תיאור המעשר לא יכול להכיל יותר מ-255 תווים',
    'any.required': 'תיאור המעשר נדרש'
  }),
  amount: Joi.number().positive().required().messages({
    'number.positive': 'סכום המעשר חייב להיות חיובי',
    'any.required': 'סכום המעשר נדרש'
  }),
  date: Joi.date().required().messages({
    'any.required': 'תאריך המעשר נדרש'
  }),
  note: Joi.string().max(1000).optional().messages({
    'string.max': 'הערה לא יכולה להכיל יותר מ-1000 תווים'
  })
});

const querySchema = Joi.object({
  startDate: Joi.date().optional(),
  endDate: Joi.date().optional(),
  search: Joi.string().optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10)
});

// Get all tithe given
router.get('/', validateQuery(querySchema), async (req, res) => {
  try {
    const userId = req.user.id;
    const { startDate, endDate, search, page, limit } = req.query;
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT 
        id,
        description,
        amount,
        date,
        note,
        created_at,
        updated_at
      FROM tithe_given
      WHERE user_id = $1
    `;
    
    const params = [userId];
    let paramIndex = 2;
    
    if (startDate) {
      query += ` AND date >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }
    
    if (endDate) {
      query += ` AND date <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }
    
    if (search) {
      query += ` AND (description ILIKE $${paramIndex} OR note ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }
    
    query += ` ORDER BY date DESC, created_at DESC`;
    query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);
    
    const result = await pool.query(query, params);
    
    // Get total count for pagination
    let countQuery = `
      SELECT COUNT(*) as total
      FROM tithe_given
      WHERE user_id = $1
    `;
    
    const countParams = [userId];
    let countParamIndex = 2;
    
    if (startDate) {
      countQuery += ` AND date >= $${countParamIndex}`;
      countParams.push(startDate);
      countParamIndex++;
    }
    
    if (endDate) {
      countQuery += ` AND date <= $${countParamIndex}`;
      countParams.push(endDate);
      countParamIndex++;
    }
    
    if (search) {
      countQuery += ` AND (description ILIKE $${countParamIndex} OR note ILIKE $${countParamIndex})`;
      countParams.push(`%${search}%`);
    }
    
    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].total);
    
    res.json({
      tithe: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
    
  } catch (error) {
    console.error('שגיאה בקבלת מעשרות:', error);
    res.status(500).json({
      error: 'שגיאת שרת',
      message: 'אירעה שגיאה בקבלת המעשרות'
    });
  }
});

// Get tithe summary
router.get('/summary', async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Get total income for tithe calculation
    const incomeResult = await pool.query(
      'SELECT COALESCE(SUM(amount), 0) as total FROM incomes WHERE user_id = $1',
      [userId]
    );
    
    // Get total tithe given
    const titheResult = await pool.query(
      'SELECT COALESCE(SUM(amount), 0) as total FROM tithe_given WHERE user_id = $1',
      [userId]
    );
    
    // Get tithe percentage from settings (default 10%)
    const settingsResult = await pool.query(
      `SELECT setting_value FROM system_settings 
       WHERE user_id = $1 AND setting_key = 'tithe_percentage'`,
      [userId]
    );
    
    const tithePercentage = settingsResult.rows.length > 0 
      ? parseFloat(settingsResult.rows[0].setting_value) 
      : 10;
    
    const totalIncome = parseFloat(incomeResult.rows[0].total);
    const totalTitheGiven = parseFloat(titheResult.rows[0].total);
    const requiredTithe = (totalIncome * tithePercentage) / 100;
    const remainingTithe = Math.max(0, requiredTithe - totalTitheGiven);
    
    // Get monthly breakdown
    const monthlyResult = await pool.query(
      `SELECT 
        EXTRACT(YEAR FROM date) as year,
        EXTRACT(MONTH FROM date) as month,
        COUNT(*) as count,
        SUM(amount) as total
      FROM tithe_given
      WHERE user_id = $1
      GROUP BY EXTRACT(YEAR FROM date), EXTRACT(MONTH FROM date)
      ORDER BY year DESC, month DESC
      LIMIT 12`,
      [userId]
    );
    
    res.json({
      summary: {
        totalIncome,
        totalTitheGiven,
        requiredTithe,
        remainingTithe,
        tithePercentage
      },
      monthly: monthlyResult.rows
    });
    
  } catch (error) {
    console.error('שגיאה בקבלת סיכום מעשרות:', error);
    res.status(500).json({
      error: 'שגיאת שרת',
      message: 'אירעה שגיאה בקבלת סיכום המעשרות'
    });
  }
});

// Get tithe by ID
router.get('/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    
    const result = await pool.query(
      `SELECT 
        id,
        description,
        amount,
        date,
        note,
        created_at,
        updated_at
      FROM tithe_given
      WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'מעשר לא נמצא',
        message: 'המעשר המבוקש לא נמצא'
      });
    }
    
    res.json(result.rows[0]);
    
  } catch (error) {
    console.error('שגיאה בקבלת מעשר:', error);
    res.status(500).json({
      error: 'שגיאת שרת',
      message: 'אירעה שגיאה בקבלת המעשר'
    });
  }
});

// Create new tithe
router.post('/', validateRequest(titheSchema), async (req, res) => {
  try {
    const userId = req.user.id;
    const { description, amount, date, note } = req.body;
    
    const result = await pool.query(
      `INSERT INTO tithe_given (user_id, description, amount, date, note)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [userId, description, amount, date, note]
    );
    
    res.status(201).json({
      message: 'מעשר נוסף בהצלחה',
      tithe: result.rows[0]
    });
    
  } catch (error) {
    console.error('שגיאה בהוספת מעשר:', error);
    res.status(500).json({
      error: 'שגיאת שרת',
      message: 'אירעה שגיאה בהוספת המעשר'
    });
  }
});

// Update tithe
router.put('/:id', validateRequest(titheSchema), async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { description, amount, date, note } = req.body;
    
    // Check if tithe exists and belongs to user
    const existingResult = await pool.query(
      'SELECT id FROM tithe_given WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    
    if (existingResult.rows.length === 0) {
      return res.status(404).json({
        error: 'מעשר לא נמצא',
        message: 'המעשר המבוקש לא נמצא'
      });
    }
    
    // Update tithe
    const result = await pool.query(
      `UPDATE tithe_given 
       SET description = $1, amount = $2, date = $3, note = $4, updated_at = CURRENT_TIMESTAMP
       WHERE id = $5 AND user_id = $6
       RETURNING *`,
      [description, amount, date, note, id, userId]
    );
    
    res.json({
      message: 'מעשר עודכן בהצלחה',
      tithe: result.rows[0]
    });
    
  } catch (error) {
    console.error('שגיאה בעדכון מעשר:', error);
    res.status(500).json({
      error: 'שגיאת שרת',
      message: 'אירעה שגיאה בעדכון המעשר'
    });
  }
});

// Delete tithe
router.delete('/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    
    const result = await pool.query(
      'DELETE FROM tithe_given WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'מעשר לא נמצא',
        message: 'המעשר המבוקש לא נמצא'
      });
    }
    
    res.json({
      message: 'מעשר נמחק בהצלחה'
    });
    
  } catch (error) {
    console.error('שגיאה במחיקת מעשר:', error);
    res.status(500).json({
      error: 'שגיאת שרת',
      message: 'אירעה שגיאה במחיקת המעשר'
    });
  }
});

module.exports = router;