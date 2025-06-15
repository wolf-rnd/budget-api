const express = require('express');
const Joi = require('joi');
const pool = require('../config/database');
const { validateRequest, validateQuery } = require('../middleware/validation');

const router = express.Router();

// Validation schemas
const debtSchema = Joi.object({
  description: Joi.string().min(2).max(255).required().messages({
    'string.min': 'תיאור החוב חייב להכיל לפחות 2 תווים',
    'string.max': 'תיאור החוב לא יכול להכיל יותר מ-255 תווים',
    'any.required': 'תיאור החוב נדרש'
  }),
  amount: Joi.number().positive().required().messages({
    'number.positive': 'סכום החוב חייב להיות חיובי',
    'any.required': 'סכום החוב נדרש'
  }),
  type: Joi.string().valid('owed_to_me', 'i_owe').required().messages({
    'any.only': 'סוג החוב חייב להיות: owed_to_me או i_owe',
    'any.required': 'סוג החוב נדרש'
  }),
  note: Joi.string().max(1000).optional().messages({
    'string.max': 'הערה לא יכולה להכיל יותר מ-1000 תווים'
  })
});

const querySchema = Joi.object({
  type: Joi.string().valid('owed_to_me', 'i_owe').optional(),
  isPaid: Joi.boolean().optional(),
  search: Joi.string().optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10)
});

// Get all debts
router.get('/', validateQuery(querySchema), async (req, res) => {
  try {
    const userId = req.user.id;
    const { type, isPaid, search, page, limit } = req.query;
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT 
        id,
        description,
        amount,
        type,
        note,
        is_paid,
        paid_date,
        created_at,
        updated_at
      FROM debts
      WHERE user_id = $1
    `;
    
    const params = [userId];
    let paramIndex = 2;
    
    if (type) {
      query += ` AND type = $${paramIndex}`;
      params.push(type);
      paramIndex++;
    }
    
    if (isPaid !== undefined) {
      query += ` AND is_paid = $${paramIndex}`;
      params.push(isPaid);
      paramIndex++;
    }
    
    if (search) {
      query += ` AND (description ILIKE $${paramIndex} OR note ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }
    
    query += ` ORDER BY is_paid ASC, created_at DESC`;
    query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);
    
    const result = await pool.query(query, params);
    
    // Get total count for pagination
    let countQuery = `
      SELECT COUNT(*) as total
      FROM debts
      WHERE user_id = $1
    `;
    
    const countParams = [userId];
    let countParamIndex = 2;
    
    if (type) {
      countQuery += ` AND type = $${countParamIndex}`;
      countParams.push(type);
      countParamIndex++;
    }
    
    if (isPaid !== undefined) {
      countQuery += ` AND is_paid = $${countParamIndex}`;
      countParams.push(isPaid);
      countParamIndex++;
    }
    
    if (search) {
      countQuery += ` AND (description ILIKE $${countParamIndex} OR note ILIKE $${countParamIndex})`;
      countParams.push(`%${search}%`);
    }
    
    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].total);
    
    res.json({
      debts: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
    
  } catch (error) {
    console.error('שגיאה בקבלת חובות:', error);
    res.status(500).json({
      error: 'שגיאת שרת',
      message: 'אירעה שגיאה בקבלת החובות'
    });
  }
});

// Get debts summary
router.get('/summary', async (req, res) => {
  try {
    const userId = req.user.id;
    
    const result = await pool.query(
      `SELECT 
        type,
        is_paid,
        COUNT(*) as count,
        SUM(amount) as total
      FROM debts
      WHERE user_id = $1
      GROUP BY type, is_paid
      ORDER BY type, is_paid`,
      [userId]
    );
    
    // Process results into a more usable format
    const summary = {
      owedToMe: {
        unpaid: { count: 0, total: 0 },
        paid: { count: 0, total: 0 }
      },
      iOwe: {
        unpaid: { count: 0, total: 0 },
        paid: { count: 0, total: 0 }
      }
    };
    
    result.rows.forEach(row => {
      const typeKey = row.type === 'owed_to_me' ? 'owedToMe' : 'iOwe';
      const statusKey = row.is_paid ? 'paid' : 'unpaid';
      
      summary[typeKey][statusKey] = {
        count: parseInt(row.count),
        total: parseFloat(row.total)
      };
    });
    
    res.json(summary);
    
  } catch (error) {
    console.error('שגיאה בקבלת סיכום חובות:', error);
    res.status(500).json({
      error: 'שגיאת שרת',
      message: 'אירעה שגיאה בקבלת סיכום החובות'
    });
  }
});

// Get debt by ID
router.get('/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    
    const result = await pool.query(
      `SELECT 
        id,
        description,
        amount,
        type,
        note,
        is_paid,
        paid_date,
        created_at,
        updated_at
      FROM debts
      WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'חוב לא נמצא',
        message: 'החוב המבוקש לא נמצא'
      });
    }
    
    res.json(result.rows[0]);
    
  } catch (error) {
    console.error('שגיאה בקבלת חוב:', error);
    res.status(500).json({
      error: 'שגיאת שרת',
      message: 'אירעה שגיאה בקבלת החוב'
    });
  }
});

// Create new debt
router.post('/', validateRequest(debtSchema), async (req, res) => {
  try {
    const userId = req.user.id;
    const { description, amount, type, note } = req.body;
    
    const result = await pool.query(
      `INSERT INTO debts (user_id, description, amount, type, note)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [userId, description, amount, type, note]
    );
    
    res.status(201).json({
      message: 'חוב נוסף בהצלחה',
      debt: result.rows[0]
    });
    
  } catch (error) {
    console.error('שגיאה בהוספת חוב:', error);
    res.status(500).json({
      error: 'שגיאת שרת',
      message: 'אירעה שגיאה בהוספת החוב'
    });
  }
});

// Update debt
router.put('/:id', validateRequest(debtSchema), async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { description, amount, type, note } = req.body;
    
    // Check if debt exists and belongs to user
    const existingResult = await pool.query(
      'SELECT id FROM debts WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    
    if (existingResult.rows.length === 0) {
      return res.status(404).json({
        error: 'חוב לא נמצא',
        message: 'החוב המבוקש לא נמצא'
      });
    }
    
    // Update debt
    const result = await pool.query(
      `UPDATE debts 
       SET description = $1, amount = $2, type = $3, note = $4, updated_at = CURRENT_TIMESTAMP
       WHERE id = $5 AND user_id = $6
       RETURNING *`,
      [description, amount, type, note, id, userId]
    );
    
    res.json({
      message: 'חוב עודכן בהצלחה',
      debt: result.rows[0]
    });
    
  } catch (error) {
    console.error('שגיאה בעדכון חוב:', error);
    res.status(500).json({
      error: 'שגיאת שרת',
      message: 'אירעה שגיאה בעדכון החוב'
    });
  }
});

// Mark debt as paid
router.put('/:id/pay', async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    
    // Check if debt exists and belongs to user
    const existingResult = await pool.query(
      'SELECT id, is_paid FROM debts WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    
    if (existingResult.rows.length === 0) {
      return res.status(404).json({
        error: 'חוב לא נמצא',
        message: 'החוב המבוקש לא נמצא'
      });
    }
    
    const debt = existingResult.rows[0];
    
    if (debt.is_paid) {
      return res.status(400).json({
        error: 'חוב כבר שולם',
        message: 'החוב כבר מסומן כשולם'
      });
    }
    
    // Mark as paid
    const result = await pool.query(
      `UPDATE debts 
       SET is_paid = TRUE, paid_date = CURRENT_DATE, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [id, userId]
    );
    
    res.json({
      message: 'חוב סומן כשולם בהצלחה',
      debt: result.rows[0]
    });
    
  } catch (error) {
    console.error('שגיאה בסימון חוב כשולם:', error);
    res.status(500).json({
      error: 'שגיאת שרת',
      message: 'אירעה שגיאה בסימון החוב כשולם'
    });
  }
});

// Mark debt as unpaid
router.put('/:id/unpay', async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    
    // Check if debt exists and belongs to user
    const existingResult = await pool.query(
      'SELECT id, is_paid FROM debts WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    
    if (existingResult.rows.length === 0) {
      return res.status(404).json({
        error: 'חוב לא נמצא',
        message: 'החוב המבוקש לא נמצא'
      });
    }
    
    const debt = existingResult.rows[0];
    
    if (!debt.is_paid) {
      return res.status(400).json({
        error: 'חוב לא שולם',
        message: 'החוב לא מסומן כשולם'
      });
    }
    
    // Mark as unpaid
    const result = await pool.query(
      `UPDATE debts 
       SET is_paid = FALSE, paid_date = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [id, userId]
    );
    
    res.json({
      message: 'חוב סומן כלא שולם בהצלחה',
      debt: result.rows[0]
    });
    
  } catch (error) {
    console.error('שגיאה בסימון חוב כלא שולם:', error);
    res.status(500).json({
      error: 'שגיאת שרת',
      message: 'אירעה שגיאה בסימון החוב כלא שולם'
    });
  }
});

// Delete debt
router.delete('/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    
    const result = await pool.query(
      'DELETE FROM debts WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'חוב לא נמצא',
        message: 'החוב המבוקש לא נמצא'
      });
    }
    
    res.json({
      message: 'חוב נמחק בהצלחה'
    });
    
  } catch (error) {
    console.error('שגיאה במחיקת חוב:', error);
    res.status(500).json({
      error: 'שגיאת שרת',
      message: 'אירעה שגיאה במחיקת החוב'
    });
  }
});

module.exports = router;