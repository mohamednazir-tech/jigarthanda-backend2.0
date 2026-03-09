const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const fixDevices = async () => {
  try {
    console.log('🧹 Cleaning up user_devices table...');
    
    // Delete all existing devices (they have undefined userId)
    await pool.query('DELETE FROM user_devices');
    console.log('✅ Deleted all existing devices');
    
    // Add a proper Baseel device for testing
    const testToken = 'ExponentPushToken[test_' + Date.now();
    await pool.query(
      'INSERT INTO user_devices (userId, token, platform, isActive) VALUES ($1, $2, $3, true)',
      ['usr_nazir_001', testToken, 'android']
    );
    console.log('✅ Added test Baseel device:', testToken);
    
    // Check result
    const result = await pool.query('SELECT userId, token, isActive FROM user_devices');
    console.log('📱 Devices after fix:');
    result.rows.forEach(row => {
      console.log(`  User: ${row.userId}, Token: ${row.token?.slice(-10)}, Active: ${row.isActive}`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Fix failed:', error);
    process.exit(1);
  }
};

fixDevices();
