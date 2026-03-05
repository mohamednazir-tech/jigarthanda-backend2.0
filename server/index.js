const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
require('dotenv').config();

// 🚀 DEPLOYMENT VERSION STAMP - Instant verification trick
const DEPLOY_VERSION = "v2.3-POST-FIX-2026-03-04-19:50";
console.log("🚀 Starting server with version:", DEPLOY_VERSION);

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
    // Create orders table with all required columns
    await pool.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id VARCHAR(50) PRIMARY KEY,
        orderNumber INTEGER UNIQUE NOT NULL,
        userId VARCHAR(50) NOT NULL,
        items JSONB NOT NULL,
        total DECIMAL(10,2) NOT NULL,
        tax DECIMAL(10,2) DEFAULT 0,
        grandTotal DECIMAL(10,2) NOT NULL,
        paymentMethod VARCHAR(20) NOT NULL,
        status VARCHAR(20) DEFAULT 'pending',
        createdAt TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        cloudId VARCHAR(100),
        syncedAt TIMESTAMP WITH TIME ZONE
      )
    `);

    // Create sequence for sequential order numbers
    await pool.query(`
      CREATE SEQUENCE IF NOT EXISTS order_number_seq START 10000
    `);

    // Add status column safely (migration)
    await pool.query(`
      ALTER TABLE orders 
      ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'pending'
    `);

    // Add orderNumber column safely (migration)
    await pool.query(`
      ALTER TABLE orders 
      ADD COLUMN IF NOT EXISTS orderNumber INTEGER
    `);

    // Add createdByName column safely (migration)
    await pool.query(`
      ALTER TABLE orders 
      ADD COLUMN IF NOT EXISTS createdByName VARCHAR(100)
    `);

    // Enable RLS on orders table
    await pool.query('ALTER TABLE orders ENABLE ROW LEVEL SECURITY');
    await pool.query('DROP POLICY IF EXISTS "Allow all operations on orders" ON orders');
    await pool.query(
      'CREATE POLICY "Allow all operations on orders" ON orders FOR ALL USING (true) WITH CHECK (true)'
    );

    await pool.query(
      'CREATE TABLE IF NOT EXISTS shop_settings (id SERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL, nameLocal VARCHAR(255) NOT NULL, address VARCHAR(255), phone VARCHAR(50), gstNumber VARCHAR(50), createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP)'
    );

    // Enable RLS on shop_settings table
    await pool.query('ALTER TABLE shop_settings ENABLE ROW LEVEL SECURITY');
    await pool.query('DROP POLICY IF EXISTS "Allow all operations on shop_settings" ON shop_settings');
    await pool.query(
      'CREATE POLICY "Allow all operations on shop_settings" ON shop_settings FOR ALL USING (true) WITH CHECK (true)'
    );

    await pool.query(
      'CREATE TABLE IF NOT EXISTS user_devices (id SERIAL PRIMARY KEY, userId VARCHAR(50) NOT NULL, token TEXT NOT NULL, platform VARCHAR(20) NOT NULL, createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP, UNIQUE(userId, token))'
    );

    // Enable RLS on user_devices table
    await pool.query('ALTER TABLE user_devices ENABLE ROW LEVEL SECURITY');
    await pool.query('DROP POLICY IF EXISTS "Allow all operations on user_devices" ON user_devices');
    await pool.query(
      'CREATE POLICY "Allow all operations on user_devices" ON user_devices FOR ALL USING (true) WITH CHECK (true)'
    );

    // Create performance index for order queries (important for large datasets)
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_orders_createdat 
      ON orders (createdAt DESC)
    `);
    console.log('✅ Performance index created for orders.createdAt');

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
      stack: error.stack
    });
    res.status(500).json({ success: false, error: error.message });
  }
});

// Cached user roles for performance and security
const userRoles = {
  "usr_admin_001": "staff",
  "usr_nazir_001": "admin"
};

// Create Order with Push Notification - v2.3 (Fixed query params - 2026-03-04-19:40)
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

    // Get user role from cached map (secure & fast)
    const userRole = userRoles[userId];
    
    if (!userRole) {
      console.log('❌ Unknown user ID:', userId);
      return res.status(400).json({ success: false, message: 'Invalid user ID' });
    }

    // Get user name for createdByName field
    let createdByName = 'Unknown';
    if (userId === 'usr_admin_001') {
      createdByName = 'Admin';
    } else if (userId === 'usr_nazir_001') {
      createdByName = 'Nazir';
    }

    const orderId = `ORD${Date.now()}${Math.random().toString(36).substr(2, 9)}`;
    
    // Get sequential order number from sequence
    const orderNumberResult = await pool.query('SELECT nextval(\'order_number_seq\') as orderNumber');
    const orderNumber = orderNumberResult.rows[0].orderNumber;

    console.log('=== DATABASE QUERY START ===');
    const query = `
      INSERT INTO orders (id, orderNumber, userId, createdByName, items, total, tax, grandTotal, paymentMethod, status) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *
    `;
    
    console.log('Query:', query);
    console.log('Values:', [orderId, orderNumber, userId, createdByName, JSON.stringify(items), total, tax || 0, grandTotal, paymentMethod, 'pending']);

    const result = await pool.query(
      query,
      [orderId, orderNumber, userId, createdByName, JSON.stringify(items), total, tax || 0, grandTotal, paymentMethod, 'pending']
    );
    
    console.log('=== DATABASE RESULT ===');
    console.log('Result:', result);
    console.log('Rows:', result.rows);

    const order = {
      ...result.rows[0],
      items:
        typeof result.rows[0].items === "string"
          ? JSON.parse(result.rows[0].items)
          : result.rows[0].items
    };

    console.log('=== ORDER CREATED ===');
    console.log('Order:', order);
    console.log('Created by user ID:', userId);
    console.log('User role from cache:', userRole);

    // Send push notification to Nazir if staff created order
    if (userRole === 'staff') { // Any staff user creates order
      console.log('🔔 Staff user created order - sending notification to Nazir');
      await sendPushNotificationToNazir(order);
    } else {
      console.log('ℹ️ Non-staff user created order - no notification to Nazir');
    }
    
    // Send push notification to the user who created the order
    await sendPushNotificationToUser(order, userId);

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
    const items = typeof order.items === "string"
      ? JSON.parse(order.items)
      : order.items;
    const itemNames = items.map(item => item.name).slice(0, 3);
    const itemsText = itemNames.length > 2 
      ? `${itemNames.join(', ')} + ${items.length - 2} more`
      : itemNames.join(', ');

    // Professional notification formatting
    const orderTime = new Date().toLocaleTimeString('en-IN', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
    
    for (const token of tokens) {
      await axios.post(
        'https://exp.host/--/api/v2/push/send',
        {
          to: token,
          sound: 'default',
          title: '🔔 NEW ORDER RECEIVED',
          body: `📋 Order #${order.id.slice(-6)}\n🍹 ${itemsText}\n💰 ₹${order.total}\n🕐 ${orderTime}`,
          data: { 
            orderId: order.id,
            type: 'new_order',
            screen: 'orders',
            priority: 'urgent'
          },
          priority: 'high',
          badge: 1,
          channelId: 'orders'
        },
        { timeout: 5000 }
      );
    }

    console.log('✅ Push notification sent to Nazir devices:', tokens.length);

  } catch (error) {
    console.error('❌ Push notification error:', error);
  }
}

// Send push notification to the user who created the order
async function sendPushNotificationToUser(order, userId) {
  try {
    // Get user's device tokens
    const devicesResponse = await pool.query(
      'SELECT token FROM user_devices WHERE userId = $1',
      [userId]
    );

    const tokens = devicesResponse.rows.map(row => row.token);

    if (tokens.length === 0) {
      console.log(`No devices found for user: ${userId}`);
      return;
    }

    // Send push notification via Expo
    const axios = require('axios');
    const items = typeof order.items === "string"
      ? JSON.parse(order.items)
      : order.items;
    const itemNames = items.map(item => item.name).slice(0, 3);
    const itemsText = itemNames.length > 2 
      ? `${itemNames.join(', ')} + ${items.length - 2} more`
      : itemNames.join(', ');

    // Professional confirmation formatting
    const orderTime = new Date().toLocaleTimeString('en-IN', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });

    for (const token of tokens) {
      await axios.post(
        'https://exp.host/--/api/v2/push/send',
        {
          to: token,
          sound: 'default',
          title: '✅ ORDER CONFIRMED',
          body: `🧾 Order #${order.id.slice(-6)}\n🍹 ${itemsText}\n💰 Total: ₹${order.total}\n🕐 ${orderTime}\n\n🎉 Ready for pickup!`,
          data: { 
            orderId: order.id,
            type: 'order_confirmed',
            screen: 'orders',
            priority: 'normal'
          },
          priority: 'high',
          badge: 1,
          channelId: 'confirmations'
        },
        { timeout: 5000 }
      );
    }

    console.log(`✅ Push notification sent to user ${userId}:`, tokens.length);

  } catch (error) {
    console.error(`❌ Push notification error for user ${userId}:`, error);
  }
}

// Send daily summary notification to Nazir at 11:59 PM
async function sendDailySummaryToNazir() {
  try {
    const currentDate = new Date();
    const startOfDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate());
    const endOfDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate() + 1);

    // Get today's orders
    const ordersResult = await pool.query(
      'SELECT * FROM orders WHERE createdAt >= $1 AND createdAt < $2',
      [startOfDay, endOfDay]
    );

    const todayOrders = ordersResult.rows;
    const totalOrders = todayOrders.length;
    const totalSales = todayOrders.reduce(
      (sum, order) => sum + Number(order.grandtotal || 0),
      0
    );

    // Get Nazir's device tokens
    const devicesResponse = await pool.query(
      'SELECT token FROM user_devices WHERE userId = $1',
      ['usr_nazir_001']
    );

    const tokens = devicesResponse.rows.map(row => row.token);

    if (tokens.length === 0) {
      console.log('No devices found for Nazir daily summary');
      return;
    }

    // Send daily summary notification
    const axios = require('axios');
    const reportDate = currentDate.toLocaleDateString('en-IN', {
      weekday: 'long',
      day: 'numeric',
      month: 'short'
    });
    
    const summaryMessage = `📊 DAILY SALES REPORT\n📅 ${reportDate}\n\n🛒 Total Orders: ${totalOrders}\n💰 Total Revenue: ₹${totalSales.toLocaleString()}\n📈 Avg per Order: ₹${totalOrders > 0 ? Math.round(totalSales / totalOrders) : 0}\n\n🎯 Great job today!`;

    for (const token of tokens) {
      await axios.post(
        'https://exp.host/--/api/v2/push/send',
        {
          to: token,
          sound: 'default',
          title: '📈 DAILY REPORT READY',
          body: summaryMessage,
          data: { 
            type: 'daily_summary',
            totalOrders,
            totalSales,
            date: currentDate.toISOString().split('T')[0],
            reportType: 'daily'
          },
          priority: 'high',
          badge: 1,
          channelId: 'reports'
        },
        { timeout: 5000 }
      );
    }

    console.log(`✅ Daily summary sent to Nazir: ${totalOrders} orders, ₹${totalSales}`);

  } catch (error) {
    console.error('❌ Daily summary notification error:', error);
  }
}

// Schedule daily summary at 11:59 PM
function scheduleDailySummary() {
  const now = new Date();
  const today = new Date();
  today.setHours(23, 59, 0, 0); // 11:59 PM today

  if (today < now) {
    today.setDate(today.getDate() + 1); // If 11:59 PM has passed, schedule for tomorrow
  }
  
  const msUntilToday = today - now;
  
  console.log(`📅 Daily summary scheduled for: ${today.toISOString()}`);
  
  setTimeout(() => {
    sendDailySummaryToNazir();
    // Schedule for next day
    scheduleDailySummary();
  }, msUntilToday);
}

// Delete orders older than 3 days (pure SQL for accuracy)
async function deleteOldOrders() {
  try {
    console.log('🗑️ Running 3-day cleanup (pure SQL)...');
    
    // Use pure SQL for accurate date handling
    const result = await pool.query(`
      DELETE FROM orders
      WHERE createdAt < NOW() - INTERVAL '3 days'
    `);
    
    const deletedCount = result.rowCount;
    console.log(`✅ Deleted ${deletedCount} orders older than 3 days`);
    console.log(`✅ Database now contains only last 3 days of orders`);
    
    return deletedCount;
  } catch (error) {
    console.error('❌ Error deleting old orders:', error);
    return 0;
  }
}

// Professional cleanup function for scheduling
async function cleanupOrders() {
  try {
    console.log("🗑️ Running automatic order cleanup...");
    
    const result = await pool.query(`
      DELETE FROM orders
      WHERE createdAt < NOW() - INTERVAL '3 days'
    `);

    console.log(`✅ Auto-cleanup deleted ${result.rowCount} old orders`);
  } catch (err) {
    console.error("❌ Auto-cleanup error:", err);
  }
}

// Schedule daily cleanup of old orders at 12:00 AM
function scheduleOrderCleanup() {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0); // 12:00 AM midnight
  
  const msUntilTomorrow = tomorrow - now;
  
  console.log(`🗑️ Order cleanup scheduled for: ${tomorrow.toISOString()}`);
  
  setTimeout(() => {
    deleteOldOrders();
    // Schedule for next day
    scheduleOrderCleanup();
  }, msUntilTomorrow);
}

// Get all orders (database already handles 3-day retention)
app.get('/api/orders', async (req, res) => {
  try {
    console.log('=== GET ORDERS REQUEST ===');
    
    // Support pagination for future scalability
    const limit = parseInt(req.query.limit) || 200;
    const offset = parseInt(req.query.offset) || 0;
    
    // Validate limits for safety
    const safeLimit = Math.min(limit, 500); // Max 500 for safety
    const safeOffset = Math.max(offset, 0);

    console.log(`📊 Pagination: limit=${safeLimit}, offset=${safeOffset}`);
    
    // Use explicit columns for production API (safer than SELECT *)
    const result = await pool.query(`
      SELECT 
        id,
        orderNumber,
        userId,
        createdByName,
        items,
        total,
        tax,
        grandTotal,
        paymentMethod,
        status,
        createdAt
      FROM orders 
      ORDER BY createdAt DESC 
      LIMIT $1 OFFSET $2
    `, [safeLimit, safeOffset]);

    console.log(`📊 Returning ${result.rows.length} orders (database already limited to 3 days)`);

    const orders = result.rows.map(row => ({
      ...row,
      items: typeof row.items === "string" ? JSON.parse(row.items) : row.items,
      status: row.status || 'pending',
    }));

    res.json({ 
      success: true, 
      data: orders,
      pagination: {
        limit: safeLimit,
        offset: safeOffset,
        count: result.rows.length
      }
    });
  } catch (error) {
    console.error('❌ Get orders error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update Settings
app.put('/api/settings', async (req, res) => {
  try {
    const { name, nameLocal, address, phone, gstNumber } = req.body;

    console.log('=== UPDATING SETTINGS ===');
    console.log('Settings data:', { name, nameLocal, address, phone, gstNumber });

    // Always keep single row (id = 1)
    const result = await pool.query(
      `INSERT INTO shop_settings (id, name, nameLocal, address, phone, gstNumber)
       VALUES (1,$1,$2,$3,$4,$5)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         nameLocal = EXCLUDED.nameLocal,
         address = EXCLUDED.address,
         phone = EXCLUDED.phone,
         gstNumber = EXCLUDED.gstNumber,
         createdAt = CURRENT_TIMESTAMP
       RETURNING *`,
      [
        name,
        nameLocal,
        address,
        phone,
        gstNumber
      ]
    );

    console.log('✅ Settings updated successfully');
    res.json({ 
      success: true, 
      message: 'Settings updated successfully',
      settings: result.rows[0]
    });

  } catch (error) {
    console.error('❌ Settings update error:', error);
    res.status(500).json({ success: false, error: error.message });
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

// 🚀 Version Endpoint - Instant deployment verification
app.get('/api/version', (req, res) => {
  res.json({ 
    version: DEPLOY_VERSION,
    timestamp: new Date().toISOString(),
    routes: {
      health: '/api/health',
      orders_get: '/api/orders (GET)',
      orders_post: '/api/orders (POST)',
      settings: '/api/settings'
    }
  });
});

// Manual cleanup endpoint (for testing)
app.post('/api/cleanup-orders', async (req, res) => {
  try {
    const deletedCount = await deleteOldOrders();
    res.json({ 
      success: true, 
      message: `Deleted ${deletedCount} old orders`,
      deletedCount 
    });
  } catch (error) {
    console.error('❌ Manual cleanup error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update Order Status
app.patch('/api/orders/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    // Validate status
    const validStatuses = ['pending', 'preparing', 'ready', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid status. Must be one of: ' + validStatuses.join(', ') 
      });
    }

    const result = await pool.query(
      'UPDATE orders SET status = $1 WHERE id = $2 RETURNING *',
      [status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const order = {
      ...result.rows[0],
      items: typeof result.rows[0].items === "string" ? JSON.parse(result.rows[0].items) : result.rows[0].items,
    };

    console.log(`✅ Order ${id} status updated to: ${status}`);
    res.json({ success: true, data: order });
  } catch (error) {
    console.error('❌ Update status error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get order count for dashboard
app.get('/api/orders/count', async (req, res) => {
  try {
    const result = await pool.query('SELECT COUNT(*) FROM orders');
    res.json({ 
      success: true,
      count: Number(result.rows[0].count) 
    });
  } catch (error) {
    console.error('❌ Order count error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get today's dashboard stats
app.get('/api/orders/stats', async (req, res) => {
  try {
    console.log('=== GET DASHBOARD STATS ===');
    
    const result = await pool.query(`
      SELECT 
        COUNT(*) as total_orders,
        COALESCE(SUM(grandTotal), 0) as total_sales,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_orders,
        COUNT(CASE WHEN status = 'preparing' THEN 1 END) as preparing_orders,
        COUNT(CASE WHEN status = 'ready' THEN 1 END) as ready_orders,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_orders
      FROM orders
      WHERE createdAt >= CURRENT_DATE
    `);

    const stats = result.rows[0];
    console.log('📊 Today\'s stats:', stats);

    res.json({ 
      success: true,
      data: {
        totalOrders: Number(stats.total_orders),
        totalSales: Number(stats.total_sales),
        pendingOrders: Number(stats.pending_orders),
        preparingOrders: Number(stats.preparing_orders),
        readyOrders: Number(stats.ready_orders),
        completedOrders: Number(stats.completed_orders),
        date: new Date().toISOString().split('T')[0]
      }
    });
  } catch (error) {
    console.error('❌ Stats error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get payment method summary for daily reports
app.get('/api/orders/payment-summary', async (req, res) => {
  try {
    console.log('=== GET PAYMENT SUMMARY ===');
    
    const result = await pool.query(`
      SELECT 
        paymentMethod,
        COUNT(*) as orders,
        COALESCE(SUM(grandTotal), 0) as amount
      FROM orders
      WHERE createdAt >= CURRENT_DATE
      GROUP BY paymentMethod
      ORDER BY amount DESC
    `);

    const summary = result.rows.map(row => ({
      paymentMethod: row.paymentmethod,
      orders: Number(row.orders),
      amount: Number(row.amount)
    }));

    console.log('💳 Payment summary:', summary);

    res.json({ 
      success: true,
      data: {
        summary,
        date: new Date().toISOString().split('T')[0]
      }
    });
  } catch (error) {
    console.error('❌ Payment summary error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete All Orders (Manual)
app.delete('/api/orders/all', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM orders');
    
    console.log(`🗑️ Deleted all orders: ${result.rowCount} records removed`);
    
    res.json({
      success: true,
      message: `Deleted ${result.rowCount} orders`,
      deletedCount: result.rowCount
    });
  } catch (error) {
    console.error('❌ Delete all orders error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Health
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({
      success: true,
      message: 'Server + DB running',
      version: DEPLOY_VERSION,
      uptime: process.uptime()
    });
  } catch {
    res.status(500).json({
      success: false,
      message: 'Database not connected',
      version: DEPLOY_VERSION,
      uptime: process.uptime()
    });
  }
});

/* ===========================
   Start Server
=========================== */

// Start server
const startServer = async () => {
  try {
    await createTables();
    
    // Start HTTP server
    app.listen(PORT, () => {
      console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
      console.log(`📊 Local: http://localhost:${PORT}`);
      console.log(`🌐 Network: http://10.171.132.69:${PORT}`);
    });

    // Schedule daily summary at 11:59 PM
    scheduleDailySummary();
    
    // Schedule daily cleanup at 12:00 AM
    scheduleOrderCleanup();
    
    // Run cleanup immediately on server start (professional behavior)
    console.log('🧹 Running immediate cleanup on server start...');
    await cleanupOrders();
    
    // Schedule automatic cleanup every 24 hours
    setInterval(cleanupOrders, 24 * 60 * 60 * 1000); // Run once per day
    console.log("⏰ Automatic cleanup scheduled every 24 hours");

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

module.exports = app;
