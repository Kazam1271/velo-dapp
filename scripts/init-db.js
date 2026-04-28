const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function initDb() {
  const connString = process.env.POSTGRES_URL.split('?')[0];
  const client = new Client({
    connectionString: connString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log("Connected to database");

    await client.query(`
      CREATE TABLE IF NOT EXISTS stakes (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        staking_tx_id VARCHAR(255) NOT NULL,
        amount DECIMAL(18, 8) NOT NULL,
        timestamp BIGINT NOT NULL,
        token_id VARCHAR(255) NOT NULL,
        status VARCHAR(50) DEFAULT 'ACTIVE'
      );
    `);
    
    console.log("Stakes table created successfully");
  } catch (err) {
    console.error("Error creating table:", err);
  } finally {
    await client.end();
  }
}

initDb();
