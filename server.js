const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const budgetYearsRoutes = require('./routes/budgetYears');
const fundsRoutes = require('./routes/funds');
const categoriesRoutes = require('./routes/categories');
const incomesRoutes = require('./routes/incomes');
const expensesRoutes = require('./routes/expenses');
const titheRoutes = require('./routes/tithe');
const debtsRoutes = require('./routes/debts');
const tasksRoutes = require('./routes/tasks');
const assetsRoutes = require('./routes/assets');
const dashboardRoutes = require('./routes/dashboard');

const { errorHandler } = require('./middleware/errorHandler');
const { authenticateToken } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet());
app.use(compression());

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: 'יותר מדי בקשות מכתובת IP זו, נסה שוב מאוחר יותר.',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// CORS configuration
const corsOptions = {
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : ['http://localhost:5173'],
  credentials: true,
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined'));
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/budget-years', authenticateToken, budgetYearsRoutes);
app.use('/api/funds', authenticateToken, fundsRoutes);
app.use('/api/categories', authenticateToken, categoriesRoutes);
app.use('/api/incomes', authenticateToken, incomesRoutes);
app.use('/api/expenses', authenticateToken, expensesRoutes);
app.use('/api/tithe', authenticateToken, titheRoutes);
app.use('/api/debts', authenticateToken, debtsRoutes);
app.use('/api/tasks', authenticateToken, tasksRoutes);
app.use('/api/assets', authenticateToken, assetsRoutes);
app.use('/api/dashboard', authenticateToken, dashboardRoutes);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'נתיב לא נמצא',
    message: `הנתיב ${req.originalUrl} לא קיים`
  });
});

// Error handling middleware
app.use(errorHandler);

// Start server
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`🚀 השרת רץ על פורט ${PORT}`);
    console.log(`🌍 סביבה: ${process.env.NODE_ENV}`);
    console.log(`📊 API זמין בכתובת: http://localhost:${PORT}`);
  });
}

module.exports = app;