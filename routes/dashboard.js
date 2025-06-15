const express = require('express');
const pool = require('../config/database');

const router = express.Router();

// Get dashboard summary
router.get('/summary', async (req, res) => {
  try {
    const userId = req.user.id;
    const { budgetYearId } = req.query;
    
    // Get active budget year if not specified
    let activeBudgetYearId = budgetYearId;
    if (!activeBudgetYearId) {
      const budgetYearResult = await pool.query(
        'SELECT id FROM budget_years WHERE user_id = $1 AND is_active = TRUE',
        [userId]
      );
      
      if (budgetYearResult.rows.length === 0) {
        return res.status(404).json({
          error: 'שנת תקציב לא נמצאה',
          message: 'לא נמצאה שנת תקציב פעילה'
        });
      }
      
      activeBudgetYearId = budgetYearResult.rows[0].id;
    }
    
    // Get total income
    const incomeResult = await pool.query(
      'SELECT COALESCE(SUM(amount), 0) as total FROM incomes WHERE user_id = $1 AND budget_year_id = $2',
      [userId, activeBudgetYearId]
    );
    
    // Get total expenses
    const expenseResult = await pool.query(
      'SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE user_id = $1 AND budget_year_id = $2',
      [userId, activeBudgetYearId]
    );
    
    // Get total budget
    const budgetResult = await pool.query(
      `SELECT COALESCE(SUM(
        CASE 
          WHEN f.type = 'monthly' THEN fb.amount * 12
          ELSE fb.amount
        END
      ), 0) as total
      FROM fund_budgets fb
      JOIN funds f ON f.id = fb.fund_id
      WHERE f.user_id = $1 AND fb.budget_year_id = $2 AND f.include_in_budget = TRUE`,
      [userId, activeBudgetYearId]
    );
    
    // Get total debts
    const debtResult = await pool.query(
      'SELECT COALESCE(SUM(amount), 0) as total FROM debts WHERE user_id = $1 AND is_paid = FALSE',
      [userId]
    );
    
    // Get total tithe given
    const titheResult = await pool.query(
      'SELECT COALESCE(SUM(amount), 0) as total FROM tithe_given WHERE user_id = $1',
      [userId]
    );
    
    // Get funds summary
    const fundsResult = await pool.query(
      `SELECT 
        f.id,
        f.name,
        f.type,
        f.level,
        fb.amount as budget_amount,
        fb.amount_given,
        fb.spent,
        CASE 
          WHEN f.type = 'monthly' THEN fb.amount - COALESCE(fb.amount_given, 0)
          ELSE fb.amount - COALESCE(fb.spent, 0)
        END as remaining_amount
      FROM funds f
      LEFT JOIN fund_budgets fb ON f.id = fb.fund_id AND fb.budget_year_id = $2
      WHERE f.user_id = $1 AND f.is_active = TRUE
      ORDER BY f.level, f.display_order, f.name`,
      [userId, activeBudgetYearId]
    );
    
    // Get recent expenses
    const recentExpensesResult = await pool.query(
      `SELECT 
        e.id,
        e.name,
        e.amount,
        e.date,
        c.name as category_name,
        f.name as fund_name
      FROM expenses e
      JOIN categories c ON e.category_id = c.id
      JOIN funds f ON e.fund_id = f.id
      WHERE e.user_id = $1 AND e.budget_year_id = $2
      ORDER BY e.date DESC, e.created_at DESC
      LIMIT 10`,
      [userId, activeBudgetYearId]
    );
    
    // Get tasks count
    const tasksResult = await pool.query(
      `SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE completed = FALSE) as pending,
        COUNT(*) FILTER (WHERE completed = FALSE AND important = TRUE) as important_pending
      FROM tasks WHERE user_id = $1`,
      [userId]
    );
    
    const totalIncome = parseFloat(incomeResult.rows[0].total);
    const totalExpenses = parseFloat(expenseResult.rows[0].total);
    const totalBudget = parseFloat(budgetResult.rows[0].total);
    const totalDebts = parseFloat(debtResult.rows[0].total);
    const totalTithe = parseFloat(titheResult.rows[0].total);
    
    const balance = totalIncome - totalExpenses;
    const requiredTithe = totalIncome * 0.1;
    const remainingTithe = Math.max(0, requiredTithe - totalTithe);
    
    res.json({
      budgetYearId: activeBudgetYearId,
      summary: {
        totalIncome,
        totalExpenses,
        totalBudget,
        totalDebts,
        balance,
        tithe: {
          required: requiredTithe,
          given: totalTithe,
          remaining: remainingTithe
        }
      },
      funds: fundsResult.rows,
      recentExpenses: recentExpensesResult.rows,
      tasks: tasksResult.rows[0]
    });
    
  } catch (error) {
    console.error('שגיאה בקבלת סיכום דשבורד:', error);
    res.status(500).json({
      error: 'שגיאת שרת',
      message: 'אירעה שגיאה בקבלת נתוני הדשבורד'
    });
  }
});

module.exports = router;