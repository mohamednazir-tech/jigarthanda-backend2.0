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
        tax DECIMAL(10,2) NOT NULL,
        grandTotal DECIMAL(10,2) NOT NULL,
        paymentMethod VARCHAR(20) NOT NULL,
        status VARCHAR(20) DEFAULT 'pending',
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Enable RLS on orders table
    await pool.query('ALTER TABLE orders ENABLE ROW LEVEL SECURITY');
    await pool.query(`
      CREATE POLICY IF NOT EXISTS "Allow all operations on orders" 
      ON orders FOR ALL USING (true) WITH CHECK (true)
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS shop_settings (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        nameLocal VARCHAR(255) NOT NULL,
        address VARCHAR(255),
        phone VARCHAR(50),
        email VARCHAR(100),
        tax DECIMAL(5,2) DEFAULT 0,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Enable RLS on shop_settings table
    await pool.query('ALTER TABLE shop_settings ENABLE ROW LEVEL SECURITY');
    await pool.query(`
      CREATE POLICY IF NOT EXISTS "Allow all operations on shop_settings" 
      ON shop_settings FOR ALL USING (true) WITH CHECK (true)
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_devices (
        id SERIAL PRIMARY KEY,
        userId VARCHAR(50) NOT NULL,
        token TEXT NOT NULL,
        platform VARCHAR(20) NOT NULL,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(userId, token)
      );
    `);

    // Enable RLS on user_devices table
    await pool.query('ALTER TABLE user_devices ENABLE ROW LEVEL SECURITY');
    await pool.query(`
      CREATE POLICY IF NOT EXISTS "Allow all operations on user_devices" 
      ON user_devices FOR ALL USING (true) WITH CHECK (true)
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
      // Ensure items is properly serialized
      const itemsJson = typeof order.items === 'string' 
        ? order.items 
        : JSON.stringify(order.items);
      
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
          itemsJson, // ✅ Safe JSON string
          order.total,
          order.tax,
          order.grandTotal,
          new Date(order.createdAt), // ✅ Convert ISO string to Date
          order.paymentMethod,
          new Date(),
          `cloud_${order.id}`
        ]
      );
    }

    res.json({ success: true, count: orders.length });

  } catch (error) {
    console.error('❌ Sync error:', error);
    console.error('❌ Error details:', {
      message: error.message,
      stack: error.stack,
      order: orders[0] // Log first order for debugging
    });
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create Order with Push Notification - v2.2 (POST route fix - $(date))
app.post('/api/orders', async (req, res) => {
  try {
    console.log('=== ORDER REQUEST RECEIVED ===');
    console.log('Request body:', req.body);
    console.log('Request headers:', req.headers);
    
    const { userId, items, total, tax, grandTotal, paymentMethod } = req.body;

    if (!userId || !items || !total || !paymentMethod) {
      console.log('=== VALIDATION FAILED ===');
      console.log('Missing fields:', { userId: !!userId, items: !!items, total: !!total, paymentMethod: !!paymentMethod });
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    const orderId = `ORD${Date.now()}${Math.random().toString(36).substr(2, 9)}`;

    console.log('=== DATABASE QUERY START ===');
    const query = `
      INSERT INTO orders (id, userId, items, total, tax, grandTotal, paymentMethod) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *
    `;
    
    console.log('Query:', query);
    console.log('Values:', [orderId, userId, JSON.stringify(items), total, tax || 0, grandTotal, paymentMethod]);

    const result = await pool.query(
      `INSERT INTO orders (id, userId, items, total, tax, grandTotal, paymentMethod) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [orderId, userId, JSON.stringify(items), total, tax || 0, grandTotal, paymentMethod]
    );
    
    console.log('=== DATABASE RESULT ===');
    console.log('Result:', result);
    console.log('Rows:', result.rows);

    const order = result.rows[0];

    console.log('=== ORDER CREATED ===');
    console.log('Order:', order);

    // Send push notification to Nazir if staff created order
    if (userId === 'usr_admin_001') { // Admin user ID
      await sendPushNotificationToNazir(order);
    }

    console.log('Order created:', orderId);
    res.status(200).json({ success: true, message: 'Order created', order });
  } catch (error) {
    console.error('=== ORDER CREATION ERROR ===');
    console.error('Error details:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Send push notification to Nazir
async function sendPushNotificationToNazir(order) {
  try {
    // Get Nazir's device tokens
    const devicesResponse = await pool.query(
      'SELECT token FROM user_devices WHERE userId = $1',
      ['usr_nazir_001'] // Nazir user ID
    );

    const tokens = devicesResponse.rows.map(row => row.token);

    if (tokens.length === 0) {
      console.log('No devices found for Nazir');
      return;
    }

    // Send push notification via Expo
    const axios = require('axios');
    const itemNames = order.items.map(item => item.name).slice(0, 3);
    const itemsText = itemNames.length > 2 
      ? `${itemNames.join(', ')} + ${order.items.length - 2} more`
      : itemNames.join(', ');

    for (const token of tokens) {
      await axios.post('https://exp.host/--/api/v2/push/send', {
        to: token,
        sound: 'default',
        title: '🧾 New Order - Hanifa Jigarthanda',
        body: `${itemsText} • ₹${order.total}`,
        data: { 
          orderId: order.id,
          type: 'new_order',
          screen: 'orders'
        },
        priority: 'high',
      });
    }

    console.log('✅ Push notification sent to Nazir devices:', tokens.length);

  } catch (error) {
    console.error('❌ Push notification error:', error);
  }
}

// Get Orders
app.get('/api/orders', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM orders ORDER BY createdAt DESC'
    );

    const orders = result.rows.map(row => ({
      id: row.id,
      userId: row.userid,
      items: typeof row.items === 'string' ? JSON.parse(row.items) : row.items,
      total: parseFloat(row.total),
      tax: parseFloat(row.tax),
      grandTotal: parseFloat(row.grandtotal),
      createdAt: row.createdat,
      paymentMethod: row.paymentmethod,
      syncedAt: row.syncedat,
      cloudId: row.cloudid
    }));

    res.json({
      success: true,
      orders: orders
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

// Register device for push notifications
app.post('/api/register-device', async (req, res) => {
  try {
    const { userId, token, platform } = req.body;

    if (!userId || !token) {
      return res.status(400).json({ success: false, message: 'Missing userId or token' });
    }

    const result = await pool.query(
      'INSERT INTO user_devices (userId, token, platform) VALUES ($1, $2, $3) ON CONFLICT (userId, token) DO NOTHING',
      [userId, token, platform]
    );

    console.log('✅ Device registered:', userId);
    res.json({ success: true, message: 'Device registered successfully' });

  } catch (error) {
    console.error('❌ Device registration error:', error);
    res.status(500).json({ success: false, message: 'Registration failed' });
  }
});

// Get user devices for notifications
app.get('/api/user-devices/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const result = await pool.query(
      'SELECT token FROM user_devices WHERE userId = $1',
      [userId]
    );

    res.json({ success: true, tokens: result.rows.map(row => row.token) });

  } catch (error) {
    console.error('❌ Get devices error:', error);
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
