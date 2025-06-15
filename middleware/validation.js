const Joi = require('joi');

const validateRequest = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'נתונים לא תקינים',
        message: error.details[0].message,
        details: error.details
      });
    }
    next();
  };
};

const validateQuery = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.query);
    if (error) {
      return res.status(400).json({
        error: 'פרמטרים לא תקינים',
        message: error.details[0].message,
        details: error.details
      });
    }
    next();
  };
};

module.exports = { validateRequest, validateQuery };