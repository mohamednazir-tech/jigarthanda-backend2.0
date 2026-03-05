const { Pool } = require('pg');

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/jigarthanda'
});

async function manualCleanup() {
  try {
    console.log('🔧 Manual cleanup starting...');
    
    // Calculate 4 days ago (delete orders older than this)
    const fourDaysAgo = new Date();
    fourDaysAgo.setUTCDate(fourDaysAgo.getUTCDate() - 4);
    fourDaysAgo.setUTCHours(0, 0, 0, 0);
    
    console.log('🗑️ Deleting orders older than:', fourDaysAgo.toISOString());
    
    // Check orders before deletion
    const beforeCount = await pool.query('SELECT COUNT(*) FROM orders');
    console.log('📊 Orders before cleanup:', beforeCount.rows[0].count);
    
    // Show sample orders
    const sampleOrders = await pool.query('SELECT id, createdAt FROM orders ORDER BY createdAt ASC LIMIT 10');
    console.log('📋 Sample orders (oldest):');
    sampleOrders.rows.forEach(row => {
      console.log(`  ${row.id}: ${row.createdAt}`);
    });
    
    // Delete old orders
    const result = await pool.query(
      'DELETE FROM orders WHERE createdAt < $1',
      [fourDaysAgo.toISOString()]
    );
    
    console.log(`✅ Deleted ${result.rowCount} old orders`);
    
    // Check orders after deletion
    const afterCount = await pool.query('SELECT COUNT(*) FROM orders');
    console.log('📊 Orders after cleanup:', afterCount.rows[0].count);
    
    // Show remaining orders
    const remainingOrders = await pool.query('SELECT id, createdAt FROM orders ORDER BY createdAt ASC LIMIT 10');
    console.log('📋 Remaining orders (oldest):');
    remainingOrders.rows.forEach(row => {
      console.log(`  ${row.id}: ${row.createdAt}`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await pool.end();
  }
}

manualCleanup();
