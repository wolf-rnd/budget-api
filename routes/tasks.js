const express = require('express');
const Joi = require('joi');
const pool = require('../config/database');
const { validateRequest, validateQuery } = require('../middleware/validation');

const router = express.Router();

// Validation schemas
const taskSchema = Joi.object({
  description: Joi.string().min(2).max(1000).required().messages({
    'string.min': 'תיאור המשימה חייב להכיל לפחות 2 תווים',
    'string.max': 'תיאור המשימה לא יכול להכיל יותר מ-1000 תווים',
    'any.required': 'תיאור המשימה נדרש'
  }),
  important: Joi.boolean().default(false)
});

const updateTaskSchema = Joi.object({
  description: Joi.string().min(2).max(1000).optional().messages({
    'string.min': 'תיאור המשימה חייב להכיל לפחות 2 תווים',
    'string.max': 'תיאור המשימה לא יכול להכיל יותר מ-1000 תווים'
  }),
  completed: Joi.boolean().optional(),
  important: Joi.boolean().optional()
});

const querySchema = Joi.object({
  completed: Joi.boolean().optional(),
  important: Joi.boolean().optional(),
  search: Joi.string().optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10)
});

// Get all tasks
router.get('/', validateQuery(querySchema), async (req, res) => {
  try {
    const userId = req.user.id;
    const { completed, important, search, page, limit } = req.query;
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT 
        id,
        description,
        completed,
        important,
        completed_at,
        created_at,
        updated_at
      FROM tasks
      WHERE user_id = $1
    `;
    
    const params = [userId];
    let paramIndex = 2;
    
    if (completed !== undefined) {
      query += ` AND completed = $${paramIndex}`;
      params.push(completed);
      paramIndex++;
    }
    
    if (important !== undefined) {
      query += ` AND important = $${paramIndex}`;
      params.push(important);
      paramIndex++;
    }
    
    if (search) {
      query += ` AND description ILIKE $${paramIndex}`;
      params.push(`%${search}%`);
      paramIndex++;
    }
    
    query += ` ORDER BY important DESC, completed ASC, created_at DESC`;
    query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);
    
    const result = await pool.query(query, params);
    
    // Get total count for pagination
    let countQuery = `
      SELECT COUNT(*) as total
      FROM tasks
      WHERE user_id = $1
    `;
    
    const countParams = [userId];
    let countParamIndex = 2;
    
    if (completed !== undefined) {
      countQuery += ` AND completed = $${countParamIndex}`;
      countParams.push(completed);
      countParamIndex++;
    }
    
    if (important !== undefined) {
      countQuery += ` AND important = $${countParamIndex}`;
      countParams.push(important);
      countParamIndex++;
    }
    
    if (search) {
      countQuery += ` AND description ILIKE $${countParamIndex}`;
      countParams.push(`%${search}%`);
    }
    
    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].total);
    
    res.json({
      tasks: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
    
  } catch (error) {
    console.error('שגיאה בקבלת משימות:', error);
    res.status(500).json({
      error: 'שגיאת שרת',
      message: 'אירעה שגיאה בקבלת המשימות'
    });
  }
});

// Get tasks summary
router.get('/summary', async (req, res) => {
  try {
    const userId = req.user.id;
    
    const result = await pool.query(
      `SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE completed = FALSE) as pending,
        COUNT(*) FILTER (WHERE completed = TRUE) as completed,
        COUNT(*) FILTER (WHERE important = TRUE AND completed = FALSE) as important_pending,
        COUNT(*) FILTER (WHERE important = TRUE AND completed = TRUE) as important_completed
      FROM tasks
      WHERE user_id = $1`,
      [userId]
    );
    
    const summary = result.rows[0];
    
    // Convert string counts to numbers
    Object.keys(summary).forEach(key => {
      summary[key] = parseInt(summary[key]);
    });
    
    res.json(summary);
    
  } catch (error) {
    console.error('שגיאה בקבלת סיכום משימות:', error);
    res.status(500).json({
      error: 'שגיאת שרת',
      message: 'אירעה שגיאה בקבלת סיכום המשימות'
    });
  }
});

// Get task by ID
router.get('/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    
    const result = await pool.query(
      `SELECT 
        id,
        description,
        completed,
        important,
        completed_at,
        created_at,
        updated_at
      FROM tasks
      WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'משימה לא נמצאה',
        message: 'המשימה המבוקשת לא נמצאה'
      });
    }
    
    res.json(result.rows[0]);
    
  } catch (error) {
    console.error('שגיאה בקבלת משימה:', error);
    res.status(500).json({
      error: 'שגיאת שרת',
      message: 'אירעה שגיאה בקבלת המשימה'
    });
  }
});

// Create new task
router.post('/', validateRequest(taskSchema), async (req, res) => {
  try {
    const userId = req.user.id;
    const { description, important } = req.body;
    
    const result = await pool.query(
      `INSERT INTO tasks (user_id, description, important)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [userId, description, important]
    );
    
    res.status(201).json({
      message: 'משימה נוצרה בהצלחה',
      task: result.rows[0]
    });
    
  } catch (error) {
    console.error('שגיאה ביצירת משימה:', error);
    res.status(500).json({
      error: 'שגיאת שרת',
      message: 'אירעה שגיאה ביצירת המשימה'
    });
  }
});

// Update task
router.put('/:id', validateRequest(updateTaskSchema), async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const updates = req.body;
    
    // Check if task exists and belongs to user
    const existingResult = await pool.query(
      'SELECT id, completed FROM tasks WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    
    if (existingResult.rows.length === 0) {
      return res.status(404).json({
        error: 'משימה לא נמצאה',
        message: 'המשימה המבוקשת לא נמצאה'
      });
    }
    
    const existingTask = existingResult.rows[0];
    
    // Build update query dynamically
    const updateFields = [];
    const params = [];
    let paramIndex = 1;
    
    if (updates.description !== undefined) {
      updateFields.push(`description = $${paramIndex}`);
      params.push(updates.description);
      paramIndex++;
    }
    
    if (updates.important !== undefined) {
      updateFields.push(`important = $${paramIndex}`);
      params.push(updates.important);
      paramIndex++;
    }
    
    if (updates.completed !== undefined) {
      updateFields.push(`completed = $${paramIndex}`);
      params.push(updates.completed);
      paramIndex++;
      
      // Handle completed_at timestamp
      if (updates.completed && !existingTask.completed) {
        // Task is being marked as completed
        updateFields.push(`completed_at = CURRENT_TIMESTAMP`);
      } else if (!updates.completed && existingTask.completed) {
        // Task is being marked as not completed
        updateFields.push(`completed_at = NULL`);
      }
    }
    
    if (updateFields.length === 0) {
      return res.status(400).json({
        error: 'אין שדות לעדכון',
        message: 'לא סופקו שדות לעדכון'
      });
    }
    
    updateFields.push('updated_at = CURRENT_TIMESTAMP');
    
    const query = `
      UPDATE tasks 
      SET ${updateFields.join(', ')}
      WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1}
      RETURNING *
    `;
    
    params.push(id, userId);
    
    const result = await pool.query(query, params);
    
    res.json({
      message: 'משימה עודכנה בהצלחה',
      task: result.rows[0]
    });
    
  } catch (error) {
    console.error('שגיאה בעדכון משימה:', error);
    res.status(500).json({
      error: 'שגיאת שרת',
      message: 'אירעה שגיאה בעדכון המשימה'
    });
  }
});

// Toggle task completion
router.put('/:id/toggle', async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    
    // Check if task exists and belongs to user
    const existingResult = await pool.query(
      'SELECT id, completed FROM tasks WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    
    if (existingResult.rows.length === 0) {
      return res.status(404).json({
        error: 'משימה לא נמצאה',
        message: 'המשימה המבוקשת לא נמצאה'
      });
    }
    
    const existingTask = existingResult.rows[0];
    const newCompletedStatus = !existingTask.completed;
    
    // Update task
    const result = await pool.query(
      `UPDATE tasks 
       SET completed = $1, 
           completed_at = CASE WHEN $1 THEN CURRENT_TIMESTAMP ELSE NULL END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND user_id = $3
       RETURNING *`,
      [newCompletedStatus, id, userId]
    );
    
    res.json({
      message: `משימה ${newCompletedStatus ? 'הושלמה' : 'בוטלה'} בהצלחה`,
      task: result.rows[0]
    });
    
  } catch (error) {
    console.error('שגיאה בשינוי סטטוס משימה:', error);
    res.status(500).json({
      error: 'שגיאת שרת',
      message: 'אירעה שגיאה בשינוי סטטוס המשימה'
    });
  }
});

// Delete task
router.delete('/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    
    const result = await pool.query(
      'DELETE FROM tasks WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'משימה לא נמצאה',
        message: 'המשימה המבוקשת לא נמצאה'
      });
    }
    
    res.json({
      message: 'משימה נמחקה בהצלחה'
    });
    
  } catch (error) {
    console.error('שגיאה במחיקת משימה:', error);
    res.status(500).json({
      error: 'שגיאת שרת',
      message: 'אירעה שגיאה במחיקת המשימה'
    });
  }
});

// Delete all completed tasks
router.delete('/completed/all', async (req, res) => {
  try {
    const userId = req.user.id;
    
    const result = await pool.query(
      'DELETE FROM tasks WHERE user_id = $1 AND completed = TRUE RETURNING id',
      [userId]
    );
    
    res.json({
      message: `${result.rows.length} משימות שהושלמו נמחקו בהצלחה`,
      deletedCount: result.rows.length
    });
    
  } catch (error) {
    console.error('שגיאה במחיקת משימות שהושלמו:', error);
    res.status(500).json({
      error: 'שגיאת שרת',
      message: 'אירעה שגיאה במחיקת המשימות שהושלמו'
    });
  }
});

module.exports = router;