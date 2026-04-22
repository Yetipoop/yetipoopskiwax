// Shared Neon database connection
// Uses HTTP-based driver — safe for Vercel serverless (no TCP connection pool exhaustion)

const { neon } = require('@neondatabase/serverless');

let _sql;

function getDb() {
  if (!_sql) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable is not set');
    }
    _sql = neon(process.env.DATABASE_URL);
  }
  return _sql;
}

module.exports = { getDb };
