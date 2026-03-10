const { Pool } = require('pg');
const bcrypt = require('bcrypt');

// Use the same database connection as the server
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

async function createUsers() {
  try {
    console.log('🔧 Creating users in database...');
    
    // Users from mocks/users.ts
    const users = [
      {
        id: 'usr_nazir_001',
        username: 'admin',
        email: 'admin@jigarthanda.com',
        password: 'admin123',
        role: 'admin'
      },
      {
        id: 'usr_baseel_001', 
        username: 'baseel',
        email: 'baseel@jigarthanda.com',
        password: 'baseel123',
        role: 'staff'
      }
    ];

    for (const user of users) {
      // Hash password
      const hashedPassword = await bcrypt.hash(user.password, 10);
      
      // Insert or update user
      await pool.query(`
        INSERT INTO users (id, username, email, password, role, createdAt, updatedAt)
        VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
        ON CONFLICT (id) DO UPDATE SET
          username = EXCLUDED.username,
          email = EXCLUDED.email,
          password = EXCLUDED.password,
          role = EXCLUDED.role,
          updatedAt = NOW()
      `, [user.id, user.username, user.email, hashedPassword, user.role]);
      
      console.log(`✅ User created/updated: ${user.username} (${user.id})`);
    }

    console.log('\n🎯 Checking users in database:');
    const result = await pool.query('SELECT id, username, email, role, createdAt FROM users');
    console.table(result.rows);

  } catch (error) {
    console.error('❌ Error creating users:', error);
  } finally {
    await pool.end();
  }
}

createUsers();
