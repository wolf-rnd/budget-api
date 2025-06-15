const jwt = require('jsonwebtoken');
const pool = require('../config/database');

const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        error: 'אין הרשאה',
        message: 'נדרש טוקן גישה'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Verify user still exists
    const userResult = await pool.query(
      'SELECT id, email, first_name, last_name FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({
        error: 'משתמש לא נמצא',
        message: 'המשתמש אינו קיים במערכת'
      });
    }

    req.user = userResult.rows[0];
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(403).json({
        error: 'טוקן לא תקין',
        message: 'הטוקן אינו תקין'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(403).json({
        error: 'טוקן פג תוקף',
        message: 'הטוקן פג תוקף, נדרש להתחבר מחדש'
      });
    }

    console.error('שגיאה באימות:', error);
    return res.status(500).json({
      error: 'שגיאת שרת',
      message: 'שגיאה פנימית בשרת'
    });
  }
};

module.exports = { authenticateToken };