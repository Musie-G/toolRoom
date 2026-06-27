// routes/auth.js
// login, logout, current user, password management

const express = require('express');
const jwt     = require('jsonwebtoken');
const bcrypt  = require('bcryptjs');
const router  = express.Router();

const { getDB }  = require('../config');
const { auth, requireRole, logActivity } = require('../middleware/auth');

// POST /api/auth/login
router.post('/login', async (req, res) => {
    try {
        let { badge, password } = req.body;

        if (!badge || !password) {
            return res.status(400).json({ success: false, error: 'Badge and password required' });
        }

        const db = getDB();
        const [rows] = await db.execute(
            'SELECT id, badge, name, department, role, password_hash FROM users WHERE badge = ?',
            [badge.trim()]
        );

        if (!rows.length) {
            // dont reveal whether badge exists
            return res.status(401).json({ success: false, error: 'Invalid credentials' });
        }

        var user = rows[0];
        var valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) {
            return res.status(401).json({ success: false, error: 'Invalid credentials' });
        }

        const token = jwt.sign(
            { id: user.id, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
        );

        await logActivity(db, user.id, 'User logged in: ' + user.badge);

        res.json({
            success: true,
            token,
            user: {
                id:         user.id,
                badge:      user.badge,
                name:       user.name,
                role:       user.role,
                department: user.department
            }
        });

    } catch (err) {
        console.error('login failed:', err.message);
        res.status(500).json({ success: false, error: 'Login failed' });
    }
});

// GET /api/auth/me - returns current user from token
router.get('/me', auth, (req, res) => {
    res.json({
        id:         req.user.id,
        badge:      req.user.badge,
        name:       req.user.name,
        role:       req.user.role,
        department: req.user.department
    });
});

// POST /api/auth/logout
// JWT is stateless so we just log it - client deletes the token
router.post('/logout', auth, async (req, res) => {
    const db = getDB();
    await logActivity(db, req.user.id, 'User logged out: ' + req.user.badge);
    res.json({ success: true });
});

// POST /api/auth/change-password
router.post('/change-password', auth, async (req, res) => {
    try {
        const { current, newPassword } = req.body;
        if (!current || !newPassword) {
            return res.status(400).json({ success: false, error: 'Current and new password required' });
        }

        const db = getDB();
        const [rows] = await db.execute(
            'SELECT password_hash FROM users WHERE id = ?',
            [req.user.id]
        );

        var valid = await bcrypt.compare(current, rows[0].password_hash);
        if (!valid) {
            return res.status(401).json({ success: false, error: 'Current password is wrong' });
        }

        const newHash = await bcrypt.hash(newPassword, 10);
        await db.execute(
            'UPDATE users SET password_hash = ? WHERE id = ?',
            [newHash, req.user.id]
        );

        await logActivity(db, req.user.id, 'Password changed');
        res.json({ success: true });

    } catch (err) {
        console.error('changePassword:', err.message);
        res.status(500).json({ success: false, error: 'Failed to change password' });
    }
});

// POST /api/auth/reset-password - admin only
// resets employee password back to their badge number
router.post('/reset-password', auth, requireRole('Admin'), async (req, res) => {
    try {
        const { employeeId } = req.body;
        if (!employeeId) {
            return res.status(400).json({ success: false, error: 'Employee ID required' });
        }

        const db = getDB();
        const [rows] = await db.execute(
            'SELECT id, badge, name, role FROM users WHERE id = ?',
            [employeeId]
        );

        if (!rows.length) {
            return res.status(404).json({ success: false, error: 'Employee not found' });
        }

        var emp = rows[0];
        if (emp.role === 'Admin') {
            return res.status(403).json({ success: false, error: 'Cannot reset admin passwords' });
        }

        // temp password = badge number, same as the original PHP behavior
        // TODO: add force-change-on-next-login flag
        var tempPwd = emp.badge;
        var newHash = await bcrypt.hash(tempPwd, 10);

        await db.execute(
            'UPDATE users SET password_hash = ? WHERE id = ?',
            [newHash, emp.id]
        );

        await logActivity(db, req.user.id, 'Reset password for ' + emp.name + ' (' + emp.badge + ')');
        res.json({ success: true, newPassword: tempPwd });

    } catch (err) {
        console.error('resetPassword failed:', err);
        res.status(500).json({ success: false, error: 'Failed to reset password' });
    }
});

module.exports = router;
