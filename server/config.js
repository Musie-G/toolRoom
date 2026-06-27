// config.js
// mysql connection pool
// pool means we reuse connections instead of opening a new one every request
// xampp root password is empty by default - set DB_PASS in .env if you changed it
// railway mysql requires ssl - enabled when NODE_ENV=production

require('dotenv').config();
const mysql = require('mysql2/promise');

var pool = null;

async function connectDB() {
    try {
        // ssl is needed for railway, not for local xampp
        var isProduction = process.env.NODE_ENV === 'production';

        pool = mysql.createPool({
            host:     process.env.DB_HOST || 'localhost',
            port:     process.env.DB_PORT || 3306,
            database: process.env.DB_NAME || 'Manage_tool',
            user:     process.env.DB_USER || 'root',
            password: process.env.DB_PASS || '',
            ssl: isProduction ? { rejectUnauthorized: false } : false,
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0
        });

        // quick test so we know the connection works on startup
        var conn = await pool.getConnection();
        console.log('mysql connected to', process.env.DB_NAME || 'Manage_tool');
        conn.release();

    } catch (err) {
        console.error('mysql failed to connect:', err.message);
        // no db = no app, bail out
        process.exit(1);
    }
}

function getDB() {
    if (!pool) throw new Error('db not ready - connectDB() hasnt been called');
    return pool;
}

module.exports = { connectDB, getDB };
