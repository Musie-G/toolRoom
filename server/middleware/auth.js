// middleware/auth.js
// JWT verification - plug into any route that needs auth
// attaches req.user so routes dont have to query the db themselves

const jwt    = require('jsonwebtoken');
const { getDB } = require('../config');

async function auth(req, res, next) {
    try {
        var token = null;

        var authHeader = req.headers['authorization'];
        if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.slice(7);
        } else if (req.cookies && req.cookies.token) {
            token = req.cookies.token;
        }

        if (!token) {
            return res.status(401).json({ error: 'Not logged in' });
        }

        var decoded = jwt.verify(token, process.env.JWT_SECRET);

        // re-fetch every request - slight db hit but avoids stale role in token
        // had a bug where toolkeeper was still getting admin access after demotion
        const db = getDB();
        const [rows] = await db.execute(
            'SELECT id, badge, name, department, role, email, phone FROM users WHERE id = ?',
            [decoded.id]
        );

        if (!rows.length) {
            return res.status(401).json({ error: 'User not found - please log in again' });
        }

        req.user = rows[0];
        next();

    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Session expired - please log in again' });
        }
        if (err.name === 'JsonWebTokenError') {
            return res.status(401).json({ error: 'Invalid token' });
        }
        console.error('auth middleware error:', err.message);
        res.status(500).json({ error: 'Auth check failed' });
    }
}

// role gate - use after auth()
function requireRole(...roles) {
    return function(req, res, next) {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Access denied for your role' });
        }
        next();
    };
}

// check permission against settings object
function canDo(user, perm, settings) {
    if (user.role === 'Admin') return true;
    var roleKey = user.role.toLowerCase();
    var perms = settings && settings.permissions && settings.permissions[roleKey];
    if (!perms) return false;
    return perms[perm] === true;
}

// helper to log activity - used in every route
async function logActivity(db, userId, action) {
    try {
        await db.execute(
            'INSERT INTO activity_log (user_id, action) VALUES (?, ?)',
            [userId, action]
        );
    } catch (err) {
        // dont let logging failure break the actual operation
        console.error('logActivity failed:', err.message);
    }
}

module.exports = { auth, requireRole, canDo, logActivity };
