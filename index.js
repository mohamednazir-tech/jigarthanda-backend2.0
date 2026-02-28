const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

/* ===========================
   PostgreSQL Connection
=========================== */

const pool = new Pool({
  connectionString: process.env.DATABASE_URL, // ✅ Supabase connection
});

// Test DB connection
pool.connect()
  .then(() => console.log('✅ Database connected successfully'))
  .catch(err => console.error('❌ Database connection failed:', err));

/* ===========================
   Middleware
=========================== */

app.use(cors());
app.use(express.json());

/* ===========================
   Create Tables
=========================== */

const createTables = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id VARCHAR(50) PRIMARY KEY,
        userId VARCHAR(50) NOT NULL,
        items JSONB NOT NULL,
        total DECIMAL(10,2) NOT NULL,
        tax DECIMAL(10,2) DEFAULT 0,
        grandTotal DECIMAL(10,2) NOT NULL,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        paymentMethod VARCHAR(20) NOT NULL,
        syncedAt TIMESTAMP,
        cloudId VARCHAR(50)
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS shop_settings (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        nameLocal VARCHAR(255) NOT NULL,
        address TEXT NOT NULL,
        phone VARCHAR(20) NOT NULL,
        gstNumber VARCHAR(50),
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('✅ Tables ready');
  } catch (error) {
    console.error('❌ Error creating tables:', error);
  }
};

/* ===========================
   API Routes
=========================== */

// Sync Orders
app.post('/api/orders/sync', async (req, res) => {
  try {
    const { orders } = req.body;

    for (const order of orders) {
      await pool.query(
        `INSERT INTO orders 
        (id, userId, items, total, tax, grandTotal, createdAt, paymentMethod, syncedAt, cloudId)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        ON CONFLICT (id) DO UPDATE SET
          items = EXCLUDED.items,
          total = EXCLUDED.total,
          tax = EXCLUDED.tax,
          grandTotal = EXCLUDED.grandTotal,
          paymentMethod = EXCLUDED.paymentMethod,
          syncedAt = EXCLUDED.syncedAt,
          cloudId = EXCLUDED.cloudId`,
        [
          order.id,
          order.userId,
          order.items, // ✅ JSONB direct
          order.total,
          order.tax,
          order.grandTotal,
          order.createdAt,
          order.paymentMethod,
          new Date(),
          `cloud_${order.id}`
        ]
      );
    }

    res.json({ success: true, count: orders.length });

  } catch (error) {
    console.error('❌ Sync error:', error);
    res.status(500).json({ success: false });
  }
});

// Get Orders
app.get('/api/orders', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM orders ORDER BY createdAt DESC'
    );

    res.json({
      success: true,
      orders: result.rows
    });

  } catch (error) {
    console.error('❌ Fetch error:', error);
    res.status(500).json({ success: false });
  }
});

// Sync Settings
app.post('/api/settings/sync', async (req, res) => {
  try {
    const { settings } = req.body;

    // Always keep single row (id = 1)
    await pool.query(
      `INSERT INTO shop_settings (id, name, nameLocal, address, phone, gstNumber)
       VALUES (1,$1,$2,$3,$4,$5)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         nameLocal = EXCLUDED.nameLocal,
         address = EXCLUDED.address,
         phone = EXCLUDED.phone,
         gstNumber = EXCLUDED.gstNumber,
         updatedAt = CURRENT_TIMESTAMP`,
      [
        settings.name,
        settings.nameLocal,
        settings.address,
        settings.phone,
        settings.gstNumber
      ]
    );

    res.json({ success: true });

  } catch (error) {
    console.error('❌ Settings sync error:', error);
    res.status(500).json({ success: false });
  }
});

// Get Settings
app.get('/api/settings', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM shop_settings WHERE id = 1'
    );

    if (result.rows.length > 0) {
      res.json({ success: true, settings: result.rows[0] });
    } else {
      res.json({ success: false, message: 'No settings found' });
    }

  } catch (error) {
    console.error('❌ Settings fetch error:', error);
    res.status(500).json({ success: false });
  }
});

// Health
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({
      success: true,
      message: 'Server + DB running'
    });
  } catch {
    res.status(500).json({
      success: false,
      message: 'Database not connected'
    });
  }
});

/* ===========================
   Start Server
=========================== */

const startServer = async () => {
  await createTables();

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
    console.log(`📊 Local: http://localhost:${PORT}`);
    console.log(`🌐 Network: http://10.171.132.69:${PORT}`);
  });
};

startServer();

module.exports = app;
