// config.js
// mysql2 connection pool - shared across all routes
// using a pool so we dont open a new connection on every request
// XAMPP default is root with no password
// if you set a password in phpMyAdmin you need to update DB_PASS in .env

require('dotenv').config();
const mysql = require('mysql2/promise');

var pool;

async function connectDB() {
    try {
        pool = mysql.createPool({
            host:     process.env.DB_HOST || 'localhost',
            port:     process.env.DB_PORT || 3306,
            database: process.env.DB_NAME || 'Manage_tool',
            user:     process.env.DB_USER || 'root',
            password: process.env.DB_PASS || '',
            // keep connections alive - hangar wifi drops a lot
            waitForConnections: true,
            connectionLimit:    10,
            queueLimit:         0
        });

        // test the connection
        const conn = await pool.getConnection();
        console.log('mysql connected:', process.env.DB_HOST || 'localhost', '/', process.env.DB_NAME || 'Manage_tool');
        conn.release();

    } catch (err) {
        console.error('mysql connection failed:', err.message);
        process.exit(1);
    }
}

// getDB() is how routes access the pool
// returns the pool directly so routes can use pool.query() or pool.execute()
function getDB() {
    if (!pool) throw new Error('DB not initialized - call connectDB() first');
    return pool;
}

module.exports = { connectDB, getDB };
