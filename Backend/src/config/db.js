const { Pool } = require("pg");

const pool = new Pool({
  user: process.env.DB_USER,
  // Eğer host /cloudsql ile başlıyorsa Unix Domain Socket kullanır
  host: process.env.DB_HOST, 
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: Number(process.env.DB_PORT)
});

module.exports = pool;