const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Joi = require('joi');
const pool = require('../config/database');
const { validateRequest } = require('../middleware/validation');

const router = express.Router();

// Validation schemas
const registerSchema = Joi.object({
  email: Joi.string().email().required().messages({
    'string.email': 'כתובת אימייל לא תקינה',
    'any.required': 'כתובת אימייל נדרשת'
  }),
  password: Joi.string().min(6).required().messages({
    'string.min': 'סיסמה חייבת להכיל לפחות 6 תווים',
    'any.required': 'סיסמה נדרשת'
  }),
  firstName: Joi.string().min(2).required().messages({
    'string.min': 'שם פרטי חייב להכיל לפחות 2 תווים',
    'any.required': 'שם פרטי נדרש'
  }),
  lastName: Joi.string().min(2).required().messages({
    'string.min': 'שם משפחה חייב להכיל לפחות 2 תווים',
    'any.required': 'שם משפחה נדרש'
  })
});

const loginSchema = Joi.object({
  email: Joi.string().email().required().messages({
    'string.email': 'כתובת אימייל לא תקינה',
    'any.required': 'כתובת אימייל נדרשת'
  }),
  password: Joi.string().required().messages({
    'any.required': 'סיסמה נדרשת'
  })
});

// Register
router.post('/register', validateRequest(registerSchema), async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { email, password, firstName, lastName } = req.body;
    
    // Check if user exists
    const existingUser = await client.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );
    
    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        error: 'משתמש קיים',
        message: 'כתובת האימייל כבר רשומה במערכת'
      });
    }
    
    // Hash password
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);
    
    // Create user
    const userResult = await client.query(
      `INSERT INTO users (email, password_hash, first_name, last_name) 
       VALUES ($1, $2, $3, $4) 
       RETURNING id, email, first_name, last_name, created_at`,
      [email, passwordHash, firstName, lastName]
    );
    
    const user = userResult.rows[0];
    
    // Create default budget year
    const currentYear = new Date().getFullYear();
    const budgetYearResult = await client.query(
      `INSERT INTO budget_years (user_id, name, start_date, end_date, is_active)
       VALUES ($1, $2, $3, $4, TRUE)
       RETURNING id`,
      [user.id, `01/${currentYear.toString().slice(-2)} - 12/${currentYear.toString().slice(-2)}`, 
       `${currentYear}-01-01`, `${currentYear}-12-31`]
    );
    
    const budgetYearId = budgetYearResult.rows[0].id;
    
    // Create default funds
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
        [user.id, fund.name, fund.type, fund.level, fund.include_in_budget]
      );
      
      // Create fund budget
      await client.query(
        `INSERT INTO fund_budgets (fund_id, budget_year_id, amount)
         VALUES ($1, $2, $3)`,
        [fundResult.rows[0].id, budgetYearId, 0]
      );
    }
    
    await client.query('COMMIT');
    
    // Generate JWT
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
    
    res.status(201).json({
      message: 'משתמש נוצר בהצלחה',
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        createdAt: user.created_at
      },
      token
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('שגיאה ברישום:', error);
    res.status(500).json({
      error: 'שגיאת שרת',
      message: 'אירעה שגיאה ביצירת המשתמש'
    });
  } finally {
    client.release();
  }
});

// Login
router.post('/login', validateRequest(loginSchema), async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Get user
    const userResult = await pool.query(
      'SELECT id, email, password_hash, first_name, last_name FROM users WHERE email = $1',
      [email]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(401).json({
        error: 'פרטי התחברות שגויים',
        message: 'אימייל או סיסמה לא נכונים'
      });
    }
    
    const user = userResult.rows[0];
    
    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    
    if (!isValidPassword) {
      return res.status(401).json({
        error: 'פרטי התחברות שגויים',
        message: 'אימייל או סיסמה לא נכונים'
      });
    }
    
    // Generate JWT
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
    
    res.json({
      message: 'התחברות הצליחה',
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name
      },
      token
    });
    
  } catch (error) {
    console.error('שגיאה בהתחברות:', error);
    res.status(500).json({
      error: 'שגיאת שרת',
      message: 'אירעה שגיאה בהתחברות'
    });
  }
});

// Get current user
router.get('/me', require('../middleware/auth').authenticateToken, (req, res) => {
  res.json({
    user: req.user
  });
});

module.exports = router;