const express = require('express');
const Joi = require('joi');
const pool = require('../config/database');
const { validateRequest } = require('../middleware/validation');

const router = express.Router();

// Validation schema
const categorySchema = Joi.object({
  name: Joi.string().min(2).max(100).required().messages({
    'string.min': 'שם הקטגוריה חייב להכיל לפחות 2 תווים',
    'string.max': 'שם הקטגוריה לא יכול להכיל יותר מ-100 תווים',
    'any.required': 'שם הקטגוריה נדרש'
  }),
  fundId: Joi.string().uuid().required().messages({
    'string.uuid': 'מזהה קופה לא תקין',
    'any.required': 'קופה נדרשת'
  }),
  colorClass: Joi.string().max(100).optional().messages({
    'string.max': 'מחלקת צבע לא יכולה להכיל יותר מ-100 תווים'
  })
});

// Get all categories
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;
    
    const result = await pool.query(
      `SELECT 
        c.id,
        c.name,
        c.color_class,
        c.is_active,
        c.created_at,
        c.updated_at,
        f.id as fund_id,
        f.name as fund_name,
        f.type as fund_type
      FROM categories c
      JOIN funds f ON c.fund_id = f.id
      WHERE c.user_id = $1 AND c.is_active = TRUE
      ORDER BY f.level, f.display_order, f.name, c.name`,
      [userId]
    );
    
    res.json(result.rows);
    
  } catch (error) {
    console.error('שגיאה בקבלת קטגוריות:', error);
    res.status(500).json({
      error: 'שגיאת שרת',
      message: 'אירעה שגיאה בקבלת הקטגוריות'
    });
  }
});

// Get categories by fund
router.get('/fund/:fundId', async (req, res) => {
  try {
    const userId = req.user.id;
    const { fundId } = req.params;
    
    // Verify fund belongs to user
    const fundResult = await pool.query(
      'SELECT id FROM funds WHERE id = $1 AND user_id = $2',
      [fundId, userId]
    );
    
    if (fundResult.rows.length === 0) {
      return res.status(404).json({
        error: 'קופה לא נמצאה',
        message: 'הקופה המבוקשת לא נמצאה'
      });
    }
    
    const result = await pool.query(
      `SELECT 
        c.id,
        c.name,
        c.color_class,
        c.is_active,
        c.created_at,
        c.updated_at,
        f.name as fund_name,
        f.type as fund_type
      FROM categories c
      JOIN funds f ON c.fund_id = f.id
      WHERE c.fund_id = $1 AND c.user_id = $2 AND c.is_active = TRUE
      ORDER BY c.name`,
      [fundId, userId]
    );
    
    res.json(result.rows);
    
  } catch (error) {
    console.error('שגיאה בקבלת קטגוריות לפי קופה:', error);
    res.status(500).json({
      error: 'שגיאת שרת',
      message: 'אירעה שגיאה בקבלת הקטגוריות'
    });
  }
});

// Get category by ID
router.get('/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    
    const result = await pool.query(
      `SELECT 
        c.id,
        c.name,
        c.color_class,
        c.is_active,
        c.created_at,
        c.updated_at,
        f.id as fund_id,
        f.name as fund_name,
        f.type as fund_type
      FROM categories c
      JOIN funds f ON c.fund_id = f.id
      WHERE c.id = $1 AND c.user_id = $2`,
      [id, userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'קטגוריה לא נמצאה',
        message: 'הקטגוריה המבוקשת לא נמצאה'
      });
    }
    
    res.json(result.rows[0]);
    
  } catch (error) {
    console.error('שגיאה בקבלת קטגוריה:', error);
    res.status(500).json({
      error: 'שגיאת שרת',
      message: 'אירעה שגיאה בקבלת הקטגוריה'
    });
  }
});

// Create new category
router.post('/', validateRequest(categorySchema), async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, fundId, colorClass } = req.body;
    
    // Verify fund belongs to user
    const fundResult = await pool.query(
      'SELECT id FROM funds WHERE id = $1 AND user_id = $2',
      [fundId, userId]
    );
    
    if (fundResult.rows.length === 0) {
      return res.status(400).json({
        error: 'קופה לא נמצאה',
        message: 'הקופה המבוקשת לא נמצאה או אינה שייכת למשתמש'
      });
    }
    
    // Check if category name already exists for user
    const existingResult = await pool.query(
      'SELECT id FROM categories WHERE user_id = $1 AND name = $2',
      [userId, name]
    );
    
    if (existingResult.rows.length > 0) {
      return res.status(409).json({
        error: 'שם קטגוריה קיים',
        message: 'קטגוריה עם שם זה כבר קיימת'
      });
    }
    
    // Create category
    const result = await pool.query(
      `INSERT INTO categories (user_id, name, fund_id, color_class)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [userId, name, fundId, colorClass]
    );
    
    res.status(201).json({
      message: 'קטגוריה נוצרה בהצלחה',
      category: result.rows[0]
    });
    
  } catch (error) {
    console.error('שגיאה ביצירת קטגוריה:', error);
    res.status(500).json({
      error: 'שגיאת שרת',
      message: 'אירעה שגיאה ביצירת הקטגוריה'
    });
  }
});

// Update category
router.put('/:id', validateRequest(categorySchema), async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { name, fundId, colorClass } = req.body;
    
    // Check if category exists and belongs to user
    const existingResult = await pool.query(
      'SELECT id FROM categories WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    
    if (existingResult.rows.length === 0) {
      return res.status(404).json({
        error: 'קטגוריה לא נמצאה',
        message: 'הקטגוריה המבוקשת לא נמצאה'
      });
    }
    
    // Verify new fund belongs to user
    const fundResult = await pool.query(
      'SELECT id FROM funds WHERE id = $1 AND user_id = $2',
      [fundId, userId]
    );
    
    if (fundResult.rows.length === 0) {
      return res.status(400).json({
        error: 'קופה לא נמצאה',
        message: 'הקופה המבוקשת לא נמצאה או אינה שייכת למשתמש'
      });
    }
    
    // Check if new name conflicts with existing category (excluding current one)
    const nameConflictResult = await pool.query(
      'SELECT id FROM categories WHERE user_id = $1 AND name = $2 AND id != $3',
      [userId, name, id]
    );
    
    if (nameConflictResult.rows.length > 0) {
      return res.status(409).json({
        error: 'שם קטגוריה קיים',
        message: 'קטגוריה אחרת עם שם זה כבר קיימת'
      });
    }
    
    // Update category
    const result = await pool.query(
      `UPDATE categories 
       SET name = $1, fund_id = $2, color_class = $3, updated_at = CURRENT_TIMESTAMP
       WHERE id = $4 AND user_id = $5
       RETURNING *`,
      [name, fundId, colorClass, id, userId]
    );
    
    res.json({
      message: 'קטגוריה עודכנה בהצלחה',
      category: result.rows[0]
    });
    
  } catch (error) {
    console.error('שגיאה בעדכון קטגוריה:', error);
    res.status(500).json({
      error: 'שגיאת שרת',
      message: 'אירעה שגיאה בעדכון הקטגוריה'
    });
  }
});

// Delete category (soft delete)
router.delete('/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    
    // Check if category exists and belongs to user
    const existingResult = await pool.query(
      'SELECT id FROM categories WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    
    if (existingResult.rows.length === 0) {
      return res.status(404).json({
        error: 'קטגוריה לא נמצאה',
        message: 'הקטגוריה המבוקשת לא נמצאה'
      });
    }
    
    // Check if category has any expenses
    const expensesResult = await pool.query(
      'SELECT COUNT(*) as count FROM expenses WHERE category_id = $1',
      [id]
    );
    
    if (parseInt(expensesResult.rows[0].count) > 0) {
      return res.status(409).json({
        error: 'לא ניתן למחוק',
        message: 'לא ניתן למחוק קטגוריה שמכילה הוצאות. ניתן להפוך אותה ללא פעילה.'
      });
    }
    
    // Delete category
    await pool.query(
      'DELETE FROM categories WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    
    res.json({
      message: 'קטגוריה נמחקה בהצלחה'
    });
    
  } catch (error) {
    console.error('שגיאה במחיקת קטגוריה:', error);
    res.status(500).json({
      error: 'שגיאת שרת',
      message: 'אירעה שגיאה במחיקת הקטגוריה'
    });
  }
});

// Deactivate category (soft delete alternative)
router.put('/:id/deactivate', async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    
    // Check if category exists and belongs to user
    const existingResult = await pool.query(
      'SELECT id FROM categories WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    
    if (existingResult.rows.length === 0) {
      return res.status(404).json({
        error: 'קטגוריה לא נמצאה',
        message: 'הקטגוריה המבוקשת לא נמצאה'
      });
    }
    
    // Deactivate category
    const result = await pool.query(
      `UPDATE categories 
       SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [id, userId]
    );
    
    res.json({
      message: 'קטגוריה הופכה ללא פעילה בהצלחה',
      category: result.rows[0]
    });
    
  } catch (error) {
    console.error('שגיאה בהפיכת קטגוריה ללא פעילה:', error);
    res.status(500).json({
      error: 'שגיאת שרת',
      message: 'אירעה שגיאה בהפיכת הקטגוריה ללא פעילה'
    });
  }
});

// Reactivate category
router.put('/:id/activate', async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    
    // Check if category exists and belongs to user
    const existingResult = await pool.query(
      'SELECT id FROM categories WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    
    if (existingResult.rows.length === 0) {
      return res.status(404).json({
        error: 'קטגוריה לא נמצאה',
        message: 'הקטגוריה המבוקשת לא נמצאה'
      });
    }
    
    // Activate category
    const result = await pool.query(
      `UPDATE categories 
       SET is_active = TRUE, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [id, userId]
    );
    
    res.json({
      message: 'קטגוריה הופעלה בהצלחה',
      category: result.rows[0]
    });
    
  } catch (error) {
    console.error('שגיאה בהפעלת קטגוריה:', error);
    res.status(500).json({
      error: 'שגיאת שרת',
      message: 'אירעה שגיאה בהפעלת הקטגוריה'
    });
  }
});

module.exports = router;