const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { Pool } = require('pg');
require('dotenv').config();

// Environment safety check
if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL missing - server cannot start");
  process.exit(1);
}

// Optional cron import for production reliability
let cron;
try {
  cron = require('node-cron');
  console.log('✅ node-cron loaded - production scheduler available');
} catch (error) {
  console.log('⚠️ node-cron not available - using fallback scheduler');
  cron = null;
}

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
  max: 20, // Maximum number of connections
  idleTimeoutMillis: 30000, // Close idle connections after 30s
  connectionTimeoutMillis: 2000, // Return error after 2s if can't connect
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
      'CREATE TABLE IF NOT EXISTS user_devices (id SERIAL PRIMARY KEY, userId VARCHAR(50) NOT NULL, token TEXT NOT NULL, platform VARCHAR(20) NOT NULL, isActive BOOLEAN DEFAULT false, createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP, UNIQUE(userId, token))'
    );

    // Add isActive column to existing tables (migration)
    await pool.query(
      'ALTER TABLE user_devices ADD COLUMN IF NOT EXISTS isActive BOOLEAN DEFAULT false'
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
    
    // Create compound index for optimized orders query
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_orders_createdat_status 
      ON orders (createdAt DESC, status)
    `);
    
    console.log('✅ Performance indexes created for orders');

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
  "usr_admin_001": "admin",
  "usr_nazir_001": "staff"
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

    const orderId = `ORD${Date.now()}${Math.random().toString(36).substr(2, 9)}`;
    
    // Get user name for createdByName field
    let createdByName = 'Unknown';
    if (userId === 'usr_admin_001') {
      createdByName = 'Admin';
    } else if (userId === 'usr_nazir_001') {
      createdByName = 'Baseel';
    }

    console.log('=== DATABASE TRANSACTION START ===');
    
    // Use transaction to prevent race condition between sequence and insert
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Get sequential order number within transaction
      const orderNumberResult = await client.query('SELECT nextval(\'order_number_seq\') as orderNumber');
      const orderNumber = orderNumberResult.rows[0].ordernumber; // PostgreSQL returns lowercase
      
      // Insert order with the obtained sequence number
      const query = `
        INSERT INTO orders (id, orderNumber, userId, createdByName, items, total, tax, grandTotal, paymentMethod, status) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *
      `;
      
      console.log('Query:', query);
      console.log('Values:', [orderId, orderNumber, userId, createdByName, JSON.stringify(items), total, tax || 0, grandTotal, paymentMethod, 'pending']);

      const result = await client.query(
        query,
        [orderId, orderNumber, userId, createdByName, JSON.stringify(items), total, tax || 0, grandTotal, paymentMethod, 'pending']
      );
      
      await client.query('COMMIT');
      
      const order = {
        ...result.rows[0],
        items: typeof result.rows[0].items === "string" ? JSON.parse(result.rows[0].items) : result.rows[0].items,
      };

      console.log('=== ORDER CREATED SUCCESSFULLY ===');
      console.log('Order created:', order);
      console.log('Created by user ID:', userId);
      console.log('User role from cache:', userRole);

      // Send push notification to Baseel for ALL new orders (both admin and staff)
      console.log('🔔 New order created - sending notification to Baseel');
      await sendPushNotificationToBaseel(order);

      // Send confirmation to user
      await sendPushNotificationToUser(order, userId);

      res.json({ success: true, message: 'Order created', order });

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('❌ Transaction rolled back:', error);
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('=== ORDER CREATION ERROR ===');
    console.error('Error details:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Send push notification to Baseel
async function sendPushNotificationToBaseel(order) {
  try {
    // Get Baseel's ACTIVE device token only
    const devicesResponse = await pool.query(
      'SELECT token FROM user_devices WHERE userId = $1 AND isActive = true',
      ['usr_nazir_001'] // Baseel user ID
    );

    const tokens = devicesResponse.rows.map(row => row.token);

    if (tokens.length === 0) {
      console.log('No active device found for Baseel');
      return;
    }

    // Send push notifications to ALL devices in PARALLEL for better performance
    // Prepare notification data once
    const items = typeof order.items === "string"
      ? JSON.parse(order.items)
      : order.items;
    const itemNames = items.map(i => i.item.name).slice(0, 3);
    const itemsText = itemNames.length > 2 
      ? `${itemNames.join(', ')} + ${items.length - 2} more`
      : itemNames.join(', ');

    // Professional notification formatting
    const orderTime = new Date().toLocaleTimeString('en-IN', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });

    const notificationPromises = tokens.map(async (token) => {
      try {
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
        console.log(`✅ Push notification sent to device: ${token.slice(-10)}`);
        return { success: true, token: token.slice(-10) };
      } catch (error) {
        console.error(`❌ Push failed for device ${token.slice(-10)}:`, error.message);
        return { success: false, token: token.slice(-10), error: error.message };
      }
    });

    // Wait for ALL notifications to complete in parallel
    const results = await Promise.allSettled(notificationPromises);
    
    // Log results summary
    const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
    const failed = results.filter(r => r.status === 'rejected' || !r.value.success).length;
    
    console.log(`📊 Parallel notification results: ${successful} successful, ${failed} failed`);

    console.log('✅ Push notification sent to Baseel devices:', tokens.length);

  } catch (error) {
    console.error('❌ Push notification error:', error);
  }
}

// Send push notification to the user who created the order
async function sendPushNotificationToUser(order, userId) {
  try {
    // Get user's ACTIVE device token only
    const devicesResponse = await pool.query(
      'SELECT token FROM user_devices WHERE userId = $1 AND isActive = true',
      [userId]
    );

    const tokens = devicesResponse.rows.map(row => row.token);

    if (tokens.length === 0) {
      console.log(`No devices found for user: ${userId}`);
      return;
    }

    // Send push notifications to ALL devices in PARALLEL for better performance
    const notificationPromises = tokens.map(async (token) => {
      try {
        // Prepare notification data once
        const items = typeof order.items === "string"
          ? JSON.parse(order.items)
          : order.items;
        const itemNames = items.map(i => i.item.name).slice(0, 3);
        const itemsText = itemNames.length > 2 
          ? `${itemNames.join(', ')} + ${items.length - 2} more`
          : itemNames.join(', ');

        // Professional confirmation formatting
        const orderTime = new Date().toLocaleTimeString('en-IN', { 
          hour: '2-digit', 
          minute: '2-digit' 
        });

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
        console.log(`✅ User notification sent to device: ${token.slice(-10)}`);
        return { success: true, token: token.slice(-10) };
      } catch (error) {
        console.error(`❌ User push failed for device ${token.slice(-10)}:`, error.message);
        return { success: false, token: token.slice(-10), error: error.message };
      }
    });

    // Wait for ALL notifications to complete in parallel
    const results = await Promise.allSettled(notificationPromises);
    
    // Log results summary
    const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
    const failed = results.filter(r => r.status === 'rejected' || !r.value.success).length;
    
    console.log(`📊 User notification parallel results: ${successful} successful, ${failed} failed`);

    console.log(`✅ Push notification sent to user ${userId}:`, tokens.length);

  } catch (error) {
    console.error(`❌ Push notification error for user ${userId}:`, error);
  }
}

// Send daily summary notification to Baseel at 11:59 PM
async function sendDailySummaryToBaseel() {
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
      (sum, order) => sum + Number(order.grandTotal || 0),
      0
    );

    // Get Baseel's ACTIVE device token only
    const devicesResponse = await pool.query(
      'SELECT token FROM user_devices WHERE userId = $1 AND isActive = true',
      ['usr_nazir_001']
    );

    const tokens = devicesResponse.rows.map(row => row.token);

    if (tokens.length === 0) {
      console.log('No devices found for Baseel daily summary');
      return;
    }

    // Send daily summary notification
    const reportDate = currentDate.toLocaleDateString('en-IN', {
      weekday: 'long',
      day: 'numeric',
      month: 'short'
    });
    
    const summaryMessage = `📊 DAILY SALES REPORT\n📅 ${reportDate}\n\n🛒 Total Orders: ${totalOrders}\n💰 Total Revenue: ₹${totalSales.toLocaleString()}\n📈 Avg per Order: ₹${totalOrders > 0 ? Math.round(totalSales / totalOrders) : 0}\n\n🎯 Great job today!`;

    // Send daily summary notifications to ALL devices in PARALLEL for better performance
    const notificationPromises = tokens.map(async (token) => {
      try {
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
        console.log(`✅ Daily summary sent to device: ${token.slice(-10)}`);
        return { success: true, token: token.slice(-10) };
      } catch (error) {
        console.error(`❌ Daily summary failed for device ${token.slice(-10)}:`, error.message);
        return { success: false, token: token.slice(-10), error: error.message };
      }
    });

    // Wait for ALL notifications to complete in parallel
    const results = await Promise.allSettled(notificationPromises);
    
    // Log results summary
    const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
    const failed = results.filter(r => r.status === 'rejected' || !r.value.success).length;
    
    console.log(`📊 Daily summary parallel results: ${successful} successful, ${failed} failed`);

    console.log(`✅ Daily summary sent to Baseel: ${totalOrders} orders, ₹${totalSales}`);

  } catch (error) {
    console.error('❌ Daily summary notification error:', error);
  }
}

// Fallback scheduler for when node-cron is not available
function scheduleDailySummaryFallback() {
  const now = new Date();
  const nextRun = new Date();
  nextRun.setHours(0, 1, 0, 0); // 12:01 AM

  if (nextRun <= now) {
    nextRun.setDate(nextRun.getDate() + 1);
  }

  const delay = nextRun - now;
  console.log(`📅 Fallback daily summary scheduled for: ${nextRun.toISOString()}`);
  console.log(`⏰ Runs in ${(delay / 60000).toFixed(1)} minutes`);

  setTimeout(() => {
    sendDailySummaryToBaseel();
    scheduleDailySummaryFallback(); // schedule next run
  }, delay);
}

// Schedule daily summary using cron (production-grade)
if (cron) {
  cron.schedule('1 0 * * *', async () => {
    console.log('📅 Running daily summary via cron (12:01 AM)');
    await sendDailySummaryToBaseel();
  });
} else {
  console.log('⚠️ Using fallback scheduler - install node-cron for production reliability');
  // Fallback to old method if cron not available
  scheduleDailySummaryFallback();
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


// Get all orders (database already handles 3-day retention)
app.get('/api/orders', async (req, res) => {
  try {
    const startTime = Date.now();
    console.log('=== GET ORDERS REQUEST ===');
    
    // Support pagination for future scalability
    const limit = parseInt(req.query.limit) || 200;
    const offset = parseInt(req.query.offset) || 0;
    
    // Validate limits for safety
    const safeLimit = Math.min(limit, 500); // Max 500 for safety
    const safeOffset = Math.max(offset, 0);

    console.log(`📊 Pagination: limit=${safeLimit}, offset=${safeOffset}`);
    
    // Optimized query with better indexing
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
      WHERE createdAt >= NOW() - INTERVAL '3 days'
      ORDER BY createdAt DESC 
      LIMIT $1 OFFSET $2
    `, [safeLimit, safeOffset]);

    console.log(`📊 Query executed in ${Date.now() - startTime}ms`);
    console.log(`📊 Returning ${result.rows.length} orders`);

    // Optimize JSON parsing - batch processing
    const orders = result.rows.map(row => {
      try {
        return {
          ...row,
          items: typeof row.items === "string" ? JSON.parse(row.items) : row.items,
          status: row.status || 'pending',
        };
      } catch (error) {
        console.error('❌ JSON parse error for order:', row.id);
        return {
          ...row,
          items: [],
          status: row.status || 'pending',
        };
      }
    });

    const totalTime = Date.now() - startTime;
    console.log(`📊 Total API time: ${totalTime}ms`);

    res.json({ 
      success: true, 
      data: orders,
      pagination: {
        limit: safeLimit,
        offset: safeOffset,
        count: result.rows.length,
        responseTime: totalTime
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
      'INSERT INTO user_devices (userId, token, platform, isActive) VALUES ($1, $2, $3, false) ON CONFLICT (userId, token) DO UPDATE SET platform = EXCLUDED.platform, isActive = EXCLUDED.isActive',
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

// Combined login-device API (register + activate in one call)
app.post('/api/login-device', async (req, res) => {
  try {
    const { userId, token, platform } = req.body;

    if (!userId || !token) {
      return res.status(400).json({ success: false, message: 'Missing userId or token' });
    }

    // Deactivate all devices for this user
    await pool.query(
      'UPDATE user_devices SET isActive = false WHERE userId = $1',
      [userId]
    );

    // Register/Update and activate this device
    await pool.query(
      `INSERT INTO user_devices (userId, token, platform, isActive) 
       VALUES ($1, $2, $3, true) 
       ON CONFLICT (userId, token) 
       DO UPDATE SET platform = EXCLUDED.platform, isActive = true`,
      [userId, token, platform]
    );

    console.log(`✅ Device logged in and activated for user ${userId}: ${token.slice(-10)}`);
    res.json({ 
      success: true, 
      message: 'Device logged in and activated as active device' 
    });

  } catch (error) {
    console.error('❌ Login device error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Set active device for user
app.post('/api/set-active-device', async (req, res) => {
  try {
    const { userId, token } = req.body;

    if (!userId || !token) {
      return res.status(400).json({ success: false, message: 'Missing userId or token' });
    }

    // Deactivate all devices for this user
    await pool.query(
      'UPDATE user_devices SET isActive = false WHERE userId = $1',
      [userId]
    );

    // Activate only this device
    await pool.query(
      'UPDATE user_devices SET isActive = true WHERE userId = $1 AND token = $2',
      [userId, token]
    );

    console.log(`✅ Active device set for user ${userId}: ${token.slice(-10)}`);
    res.json({ success: true, message: 'Active device updated' });

  } catch (error) {
    console.error('❌ Set active device error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get active device for user
app.get('/api/active-device/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const result = await pool.query(
      'SELECT token FROM user_devices WHERE userId = $1 AND isActive = true',
      [userId]
    );

    if (result.rows.length > 0) {
      res.json({ 
        success: true, 
        activeToken: result.rows[0].token 
      });
    } else {
      res.json({ 
        success: false, 
        message: 'No active device found' 
      });
    }

  } catch (error) {
    console.error('❌ Get active device error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Debug Baseel notifications - comprehensive check
app.get('/api/debug-baseel-notifications', async (req, res) => {
  try {
    console.log('🔍 DEBUGGING BASEEL NOTIFICATIONS...');
    
    // 1. Check Baseel's user role
    const baseelRole = userRoles['usr_nazir_001'];
    console.log('👤 Baseel user role:', baseelRole);
    
    // 2. Check all Baseel devices
    const allDevicesResult = await pool.query(
      'SELECT token, platform, isActive, createdAt FROM user_devices WHERE userId = $1 ORDER BY createdAt DESC',
      ['usr_nazir_001']
    );
    
    // 3. Check active devices only
    const activeDevicesResult = await pool.query(
      'SELECT token, platform, isActive, createdAt FROM user_devices WHERE userId = $1 AND isActive = true',
      ['usr_nazir_001']
    );
    
    // 4. Get today's orders created by Baseel
    const baseelOrdersResult = await pool.query(
      'SELECT id, createdAt, createdByName FROM orders WHERE userId = $1 AND createdAt >= CURRENT_DATE ORDER BY createdAt DESC',
      ['usr_nazir_001']
    );
    
    // 5. Get today's orders created by staff (should trigger notifications)
    const staffOrdersResult = await pool.query(
      'SELECT id, createdAt, createdByName FROM orders WHERE userId != $1 AND createdAt >= CURRENT_DATE ORDER BY createdAt DESC',
      ['usr_admin_001']
    );
    
    const debugInfo = {
      timestamp: new Date().toISOString(),
      baseelUserInfo: {
        userId: 'usr_nazir_001',
        role: baseelRole,
        shouldReceiveNotifications: baseelRole === 'staff'
      },
      deviceInfo: {
        allDevices: allDevicesResult.rows.map(row => ({
          token: row.token ? row.token.slice(-10) + '...' : 'NULL',
          platform: row.platform,
          isActive: row.isactive,
          registeredAt: row.createdat
        })),
        activeDevices: activeDevicesResult.rows.map(row => ({
          token: row.token ? row.token.slice(-10) + '...' : 'NULL',
          platform: row.platform,
          isActive: row.isactive,
          registeredAt: row.createdat
        })),
        hasActiveDevice: activeDevicesResult.rows.length > 0
      },
      orderInfo: {
        baseelOrdersToday: baseelOrdersResult.rows.length,
        staffOrdersToday: staffOrdersResult.rows.length,
        baseelOrders: baseelOrdersResult.rows.map(row => ({
          id: row.id.slice(-6),
          createdBy: row.createdbyname,
          createdAt: row.createdat
        })),
        staffOrders: staffOrdersResult.rows.map(row => ({
          id: row.id.slice(-6),
          createdBy: row.createdbyname,
          createdAt: row.createdat
        }))
      },
      notificationLogic: {
        adminCreatesOrder: 'Baseel gets notification ✅ (to prepare order)',
        staffCreatesOrder: 'Baseel gets notification ✅ (to prepare order)',
        baseelCreatesOrder: 'Baseel gets confirmation notification ✅'
      },
      recommendations: []
    };
    
    // Add recommendations based on findings
    if (!debugInfo.deviceInfo.hasActiveDevice) {
      debugInfo.recommendations.push('❌ Baseel has NO active devices - needs to login to register/activate device');
    }
    
    if (debugInfo.deviceInfo.activeDevices.length === 0 && debugInfo.deviceInfo.allDevices.length > 0) {
      debugInfo.recommendations.push('⚠️ Baseel has devices but none are active - needs to login again');
    }
    
    if (debugInfo.orderInfo.baseelOrdersToday > 0) {
      debugInfo.recommendations.push('✅ Baseel created orders today - Baseel gets confirmation notifications');
    }
    
    if (debugInfo.orderInfo.staffOrdersToday > 0 && debugInfo.deviceInfo.hasActiveDevice) {
      debugInfo.recommendations.push('✅ Staff orders created today and Baseel has active device - notifications should work');
    }
    
    if (debugInfo.orderInfo.baseelOrdersToday > 0 && debugInfo.deviceInfo.hasActiveDevice) {
      debugInfo.recommendations.push('✅ Admin orders created today and Baseel has active device - notifications should work');
    }
    
    console.log('🔍 DEBUG INFO:', JSON.stringify(debugInfo, null, 2));
    
    res.json({
      success: true,
      debug: debugInfo
    });
    
  } catch (error) {
    console.error('❌ Debug endpoint error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Manual test notification to Baseel
app.post('/api/test-baseel-notification', async (req, res) => {
  try {
    console.log('🧪 TESTING BASEEL NOTIFICATION...');
    
    // Create a test order
    const testOrder = {
      id: `TEST${Date.now()}`,
      items: [{ item: { name: 'Test Jigarthanda' }, quantity: 1, price: 50 }],
      total: 50,
      grandTotal: 50,
      createdAt: new Date()
    };
    
    // Send notification to Baseel
    await sendPushNotificationToBaseel(testOrder);
    
    res.json({
      success: true,
      message: 'Test notification sent to Baseel',
      testOrder: testOrder
    });
    
  } catch (error) {
    console.error('❌ Test notification error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Manual daily summary test endpoint
app.post('/api/test-daily-summary', async (req, res) => {
  try {
    console.log('🧪 Testing daily summary notification...');
    await sendDailySummaryToBaseel();
    res.json({ 
      success: true, 
      message: 'Daily summary notification sent to Baseel devices'
    });
  } catch (error) {
    console.error('❌ Daily summary test error:', error);
    res.status(500).json({ success: false, error: error.message });
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

// Root route - API info
app.get('/', (req, res) => {
  res.json({
    message: '🚀 Jigarthanda POS API running',
    version: 'v2.3-POST-FIX-2026-03-04-19:50',
    endpoints: {
      orders: '/api/orders',
      stats: '/api/orders/stats',
      paymentSummary: '/api/orders/payment-summary',
      orderStatus: '/api/orders/:id/status',
      settings: '/api/settings',
      health: '/api/health',
      registerDevice: '/api/register-device',
      loginDevice: '/api/login-device',
      setActiveDevice: '/api/set-active-device',
      activeDevice: '/api/active-device/:userId',
      debugBaseel: '/api/debug-baseel-notifications',
      testBaseelNotification: '/api/test-baseel-notification',
      testDailySummary: '/api/test-daily-summary'
    },
    status: 'production-ready',
    documentation: 'https://github.com/mohamednazir-tech/jigarthanda-app'
  });
});

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

  // Schedule daily cleanup using simple interval
  setInterval(deleteOldOrders, 24 * 60 * 60 * 1000); // Run once per day
  
  // Run immediate cleanup on server start (professional behavior)
  console.log('🧹 Running immediate cleanup on server start...');
  await deleteOldOrders();
  
  console.log("🕐 Daily summary scheduled via cron (12:01 AM daily)");

    // Backup trigger for Render sleep issues - check if daily summary missed
    setTimeout(async () => {
      console.log("🔔 Checking for missed daily summary (backup trigger)...");
      const now = new Date();
      const lastRun = new Date();
      lastRun.setHours(0, 1, 0, 0); // 12:01 AM today
      
      if (now.getHours() >= 1 && now.getHours() < 23) {
        console.log("📅 Server woke up after 12:01 AM - sending missed daily summary");
        await sendDailySummaryToBaseel();
      }
    }, 60000); // Check 1 minute after start

} catch (error) {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
}
};

startServer();

module.exports = app;
