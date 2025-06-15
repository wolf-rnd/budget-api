const express = require('express');
const Joi = require('joi');
const pool = require('../config/database');
const { validateRequest, validateQuery } = require('../middleware/validation');

const router = express.Router();

// Validation schemas
const assetSnapshotSchema = Joi.object({
  date: Joi.date().required().messages({
    'any.required': 'תאריך התמונת מצב נדרש'
  }),
  note: Joi.string().max(1000).optional().messages({
    'string.max': 'הערה לא יכולה להכיל יותר מ-1000 תווים'
  }),
  assets: Joi.object().pattern(
    Joi.string(),
    Joi.number().min(0)
  ).required().messages({
    'any.required': 'נתוני נכסים נדרשים'
  }),
  liabilities: Joi.object().pattern(
    Joi.string(),
    Joi.number().min(0)
  ).required().messages({
    'any.required': 'נתוני התחייבויות נדרשים'
  })
});

const querySchema = Joi.object({
  startDate: Joi.date().optional(),
  endDate: Joi.date().optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10)
});

// Asset type definitions
const assetTypes = {
  compensation: 'פיצויים',
  pension_naomi: 'קה״ש נעמי שכירה',
  pension_yossi: 'קה״ש יוסי',
  savings_children: 'חסכון לכל ילד'
};

const liabilityTypes = {
  anchor: 'עוגן',
  gmach_glik: 'גמ״ח גליק',
  mortgage: 'משכנתא'
};

// Get all asset snapshots
router.get('/', validateQuery(querySchema), async (req, res) => {
  try {
    const userId = req.user.id;
    const { startDate, endDate, page, limit } = req.query;
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT 
        s.id,
        s.date,
        s.note,
        s.created_at,
        s.updated_at
      FROM asset_snapshots s
      WHERE s.user_id = $1
    `;
    
    const params = [userId];
    let paramIndex = 2;
    
    if (startDate) {
      query += ` AND s.date >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }
    
    if (endDate) {
      query += ` AND s.date <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }
    
    query += ` ORDER BY s.date DESC, s.created_at DESC`;
    query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);
    
    const snapshotsResult = await pool.query(query, params);
    
    // Get asset details for each snapshot
    const snapshots = [];
    for (const snapshot of snapshotsResult.rows) {
      const detailsResult = await pool.query(
        `SELECT asset_type, asset_name, amount, category
         FROM asset_details
         WHERE snapshot_id = $1
         ORDER BY category, asset_type`,
        [snapshot.id]
      );
      
      const assets = {};
      const liabilities = {};
      
      detailsResult.rows.forEach(detail => {
        if (detail.category === 'asset') {
          assets[detail.asset_type] = parseFloat(detail.amount);
        } else {
          liabilities[detail.asset_type] = parseFloat(detail.amount);
        }
      });
      
      snapshots.push({
        ...snapshot,
        assets,
        liabilities
      });
    }
    
    // Get total count for pagination
    let countQuery = `
      SELECT COUNT(*) as total
      FROM asset_snapshots s
      WHERE s.user_id = $1
    `;
    
    const countParams = [userId];
    let countParamIndex = 2;
    
    if (startDate) {
      countQuery += ` AND s.date >= $${countParamIndex}`;
      countParams.push(startDate);
      countParamIndex++;
    }
    
    if (endDate) {
      countQuery += ` AND s.date <= $${countParamIndex}`;
      countParams.push(endDate);
    }
    
    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].total);
    
    res.json({
      snapshots,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
    
  } catch (error) {
    console.error('שגיאה בקבלת תמונות מצב נכסים:', error);
    res.status(500).json({
      error: 'שגיאת שרת',
      message: 'אירעה שגיאה בקבלת תמונות המצב'
    });
  }
});

// Get latest asset snapshot
router.get('/latest', async (req, res) => {
  try {
    const userId = req.user.id;
    
    const snapshotResult = await pool.query(
      `SELECT 
        s.id,
        s.date,
        s.note,
        s.created_at,
        s.updated_at
      FROM asset_snapshots s
      WHERE s.user_id = $1
      ORDER BY s.date DESC, s.created_at DESC
      LIMIT 1`,
      [userId]
    );
    
    if (snapshotResult.rows.length === 0) {
      return res.status(404).json({
        error: 'תמונת מצב לא נמצאה',
        message: 'לא נמצאה תמונת מצב נכסים'
      });
    }
    
    const snapshot = snapshotResult.rows[0];
    
    // Get asset details
    const detailsResult = await pool.query(
      `SELECT asset_type, asset_name, amount, category
       FROM asset_details
       WHERE snapshot_id = $1
       ORDER BY category, asset_type`,
      [snapshot.id]
    );
    
    const assets = {};
    const liabilities = {};
    
    detailsResult.rows.forEach(detail => {
      if (detail.category === 'asset') {
        assets[detail.asset_type] = parseFloat(detail.amount);
      } else {
        liabilities[detail.asset_type] = parseFloat(detail.amount);
      }
    });
    
    res.json({
      ...snapshot,
      assets,
      liabilities
    });
    
  } catch (error) {
    console.error('שגיאה בקבלת תמונת מצב אחרונה:', error);
    res.status(500).json({
      error: 'שגיאת שרת',
      message: 'אירעה שגיאה בקבלת תמונת המצב האחרונה'
    });
  }
});

// Get asset snapshot by ID
router.get('/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    
    const snapshotResult = await pool.query(
      `SELECT 
        s.id,
        s.date,
        s.note,
        s.created_at,
        s.updated_at
      FROM asset_snapshots s
      WHERE s.id = $1 AND s.user_id = $2`,
      [id, userId]
    );
    
    if (snapshotResult.rows.length === 0) {
      return res.status(404).json({
        error: 'תמונת מצב לא נמצאה',
        message: 'תמונת המצב המבוקשת לא נמצאה'
      });
    }
    
    const snapshot = snapshotResult.rows[0];
    
    // Get asset details
    const detailsResult = await pool.query(
      `SELECT asset_type, asset_name, amount, category
       FROM asset_details
       WHERE snapshot_id = $1
       ORDER BY category, asset_type`,
      [snapshot.id]
    );
    
    const assets = {};
    const liabilities = {};
    
    detailsResult.rows.forEach(detail => {
      if (detail.category === 'asset') {
        assets[detail.asset_type] = parseFloat(detail.amount);
      } else {
        liabilities[detail.asset_type] = parseFloat(detail.amount);
      }
    });
    
    res.json({
      ...snapshot,
      assets,
      liabilities
    });
    
  } catch (error) {
    console.error('שגיאה בקבלת תמונת מצב:', error);
    res.status(500).json({
      error: 'שגיאת שרת',
      message: 'אירעה שגיאה בקבלת תמונת המצב'
    });
  }
});

// Create new asset snapshot
router.post('/', validateRequest(assetSnapshotSchema), async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const userId = req.user.id;
    const { date, note, assets, liabilities } = req.body;
    
    // Create snapshot
    const snapshotResult = await client.query(
      `INSERT INTO asset_snapshots (user_id, date, note)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [userId, date, note]
    );
    
    const snapshot = snapshotResult.rows[0];
    
    // Insert asset details
    for (const [assetType, amount] of Object.entries(assets)) {
      if (amount > 0) {
        const assetName = assetTypes[assetType] || assetType;
        await client.query(
          `INSERT INTO asset_details (snapshot_id, asset_type, asset_name, amount, category)
           VALUES ($1, $2, $3, $4, 'asset')`,
          [snapshot.id, assetType, assetName, amount]
        );
      }
    }
    
    // Insert liability details
    for (const [liabilityType, amount] of Object.entries(liabilities)) {
      if (amount > 0) {
        const liabilityName = liabilityTypes[liabilityType] || liabilityType;
        await client.query(
          `INSERT INTO asset_details (snapshot_id, asset_type, asset_name, amount, category)
           VALUES ($1, $2, $3, $4, 'liability')`,
          [snapshot.id, liabilityType, liabilityName, amount]
        );
      }
    }
    
    await client.query('COMMIT');
    
    res.status(201).json({
      message: 'תמונת מצב נכסים נוצרה בהצלחה',
      snapshot: {
        ...snapshot,
        assets,
        liabilities
      }
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('שגיאה ביצירת תמונת מצב נכסים:', error);
    res.status(500).json({
      error: 'שגיאת שרת',
      message: 'אירעה שגיאה ביצירת תמונת המצב'
    });
  } finally {
    client.release();
  }
});

// Update asset snapshot
router.put('/:id', validateRequest(assetSnapshotSchema), async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const userId = req.user.id;
    const { id } = req.params;
    const { date, note, assets, liabilities } = req.body;
    
    // Check if snapshot exists and belongs to user
    const existingResult = await client.query(
      'SELECT id FROM asset_snapshots WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    
    if (existingResult.rows.length === 0) {
      return res.status(404).json({
        error: 'תמונת מצב לא נמצאה',
        message: 'תמונת המצב המבוקשת לא נמצאה'
      });
    }
    
    // Update snapshot
    const snapshotResult = await client.query(
      `UPDATE asset_snapshots 
       SET date = $1, note = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3 AND user_id = $4
       RETURNING *`,
      [date, note, id, userId]
    );
    
    const snapshot = snapshotResult.rows[0];
    
    // Delete existing asset details
    await client.query(
      'DELETE FROM asset_details WHERE snapshot_id = $1',
      [id]
    );
    
    // Insert new asset details
    for (const [assetType, amount] of Object.entries(assets)) {
      if (amount > 0) {
        const assetName = assetTypes[assetType] || assetType;
        await client.query(
          `INSERT INTO asset_details (snapshot_id, asset_type, asset_name, amount, category)
           VALUES ($1, $2, $3, $4, 'asset')`,
          [snapshot.id, assetType, assetName, amount]
        );
      }
    }
    
    // Insert new liability details
    for (const [liabilityType, amount] of Object.entries(liabilities)) {
      if (amount > 0) {
        const liabilityName = liabilityTypes[liabilityType] || liabilityType;
        await client.query(
          `INSERT INTO asset_details (snapshot_id, asset_type, asset_name, amount, category)
           VALUES ($1, $2, $3, $4, 'liability')`,
          [snapshot.id, liabilityType, liabilityName, amount]
        );
      }
    }
    
    await client.query('COMMIT');
    
    res.json({
      message: 'תמונת מצב נכסים עודכנה בהצלחה',
      snapshot: {
        ...snapshot,
        assets,
        liabilities
      }
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('שגיאה בעדכון תמונת מצב נכסים:', error);
    res.status(500).json({
      error: 'שגיאת שרת',
      message: 'אירעה שגיאה בעדכון תמונת המצב'
    });
  } finally {
    client.release();
  }
});

// Delete asset snapshot
router.delete('/:id', async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const userId = req.user.id;
    const { id } = req.params;
    
    // Check if snapshot exists and belongs to user
    const existingResult = await client.query(
      'SELECT id FROM asset_snapshots WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    
    if (existingResult.rows.length === 0) {
      return res.status(404).json({
        error: 'תמונת מצב לא נמצאה',
        message: 'תמונת המצב המבוקשת לא נמצאה'
      });
    }
    
    // Delete asset details first (due to foreign key constraint)
    await client.query(
      'DELETE FROM asset_details WHERE snapshot_id = $1',
      [id]
    );
    
    // Delete snapshot
    await client.query(
      'DELETE FROM asset_snapshots WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    
    await client.query('COMMIT');
    
    res.json({
      message: 'תמונת מצב נכסים נמחקה בהצלחה'
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('שגיאה במחיקת תמונת מצב נכסים:', error);
    res.status(500).json({
      error: 'שגיאת שרת',
      message: 'אירעה שגיאה במחיקת תמונת המצב'
    });
  } finally {
    client.release();
  }
});

// Get asset trends
router.get('/trends/summary', async (req, res) => {
  try {
    const userId = req.user.id;
    const { months = 12 } = req.query;
    
    const result = await pool.query(
      `SELECT 
        s.date,
        SUM(CASE WHEN ad.category = 'asset' THEN ad.amount ELSE 0 END) as total_assets,
        SUM(CASE WHEN ad.category = 'liability' THEN ad.amount ELSE 0 END) as total_liabilities,
        SUM(CASE WHEN ad.category = 'asset' THEN ad.amount ELSE 0 END) - 
        SUM(CASE WHEN ad.category = 'liability' THEN ad.amount ELSE 0 END) as net_worth
      FROM asset_snapshots s
      LEFT JOIN asset_details ad ON s.id = ad.snapshot_id
      WHERE s.user_id = $1
      GROUP BY s.id, s.date
      ORDER BY s.date DESC
      LIMIT $2`,
      [userId, parseInt(months)]
    );
    
    res.json(result.rows);
    
  } catch (error) {
    console.error('שגיאה בקבלת מגמות נכסים:', error);
    res.status(500).json({
      error: 'שגיאת שרת',
      message: 'אירעה שגיאה בקבלת מגמות הנכסים'
    });
  }
});

module.exports = router;