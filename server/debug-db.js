const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const debugDatabase = async () => {
  try {
    console.log('🔍 Checking database connection...');
    
    // Check table structure
    const tableInfo = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'user_devices'
      ORDER BY ordinal_position
    `);
    
    console.log('📋 user_devices table structure:');
    tableInfo.rows.forEach(col => {
      console.log(`  ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable}, default: ${col.column_default})`);
    });
    
    // Check raw data
    const rawData = await pool.query('SELECT * FROM user_devices');
    console.log('📊 Raw data:');
    console.log(JSON.stringify(rawData.rows, null, 2));
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Database debug failed:', error);
    process.exit(1);
  }
};

debugDatabase();
