const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const checkDevices = async () => {
  try {
    const result = await pool.query('SELECT userid, token, isactive FROM user_devices ORDER BY id');
    console.log('📱 All devices in database:');
    result.rows.forEach(row => {
      console.log(`  User: ${row.userid}, Token: ${row.token?.slice(-10) || 'null'}, Active: ${row.isactive}`);
    });
    process.exit(0);
  } catch (error) {
    console.error('Database error:', error);
    process.exit(1);
  }
};

checkDevices();
