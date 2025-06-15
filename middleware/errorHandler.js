const errorHandler = (err, req, res, next) => {
  console.error('שגיאה:', err);

  // Database errors
  if (err.code === '23505') {
    return res.status(409).json({
      error: 'נתון כפול',
      message: 'הנתון כבר קיים במערכת'
    });
  }

  if (err.code === '23503') {
    return res.status(400).json({
      error: 'הפרת אילוץ',
      message: 'הנתון מפר אילוץ במסד הנתונים'
    });
  }

  if (err.code === '23514') {
    return res.status(400).json({
      error: 'נתון לא תקין',
      message: 'הנתון אינו עומד בדרישות המערכת'
    });
  }

  // Validation errors
  if (err.isJoi) {
    return res.status(400).json({
      error: 'נתונים לא תקינים',
      message: err.details[0].message,
      details: err.details
    });
  }

  // Default error
  res.status(err.status || 500).json({
    error: err.message || 'שגיאת שרת פנימית',
    message: process.env.NODE_ENV === 'development' ? err.stack : 'אירעה שגיאה לא צפויה'
  });
};

module.exports = { errorHandler };