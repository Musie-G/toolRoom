// routes/employees.js
// employee management - list is open to all auth users, everything else admin only

const express = require('express');
const bcrypt  = require('bcryptjs');
const router  = express.Router();

const { getDB }  = require('../config');
const { auth, requireRole, logActivity } = require('../middleware/auth');

// GET /api/employees
// all authenticated users can list - needed for the checkout dropdown
router.get('/', auth, async (req, res) => {
    try {
        const db = getDB();
        const [employees] = await db.execute(
            'SELECT id, badge, name, department, role, email, phone FROM users ORDER BY name ASC'
        );
        res.json(employees);
    } catch (err) {
        console.error('employee list error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/employees - admin only
router.post('/', auth, requireRole('Admin'), async (req, res) => {
    try {
        var db = getDB();
        let data = req.body.employee || req.body;

        // check badge isnt already taken
        var [existing] = await db.execute(
            'SELECT id FROM users WHERE badge = ?',
            [data.badge]
        );
        if (existing.length) {
            return res.status(400).json({ error: 'Badge number already in use' });
        }

        // default password = badge number
        const defaultHash = await bcrypt.hash(data.badge, 10);

        var [result] = await db.execute(
            'INSERT INTO users (badge, name, department, role, email, phone, password_hash) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [
                data.badge,
                data.name,
                data.dept,
                data.role  || 'Technician',
                data.email || null,
                data.phone || null,
                defaultHash
            ]
        );

        await logActivity(db, req.user.id, 'Added employee ' + data.badge + ' - ' + data.name);

        // return badge so frontend can show it as the initial password
        res.json({ success: true, id: result.insertId, badge: data.badge });

    } catch (err) {
        console.error('addEmployee:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/employees/:id - admin only
router.put('/:id', auth, requireRole('Admin'), async (req, res) => {
    try {
        var db = getDB();
        let data = req.body.employee || req.body;

        await db.execute(
            'UPDATE users SET badge = ?, name = ?, department = ?, role = ?, email = ?, phone = ? WHERE id = ?',
            [
                data.badge,
                data.name,
                data.dept,
                data.role,
                data.email || null,
                data.phone || null,
                req.params.id
            ]
        );

        await logActivity(db, req.user.id, 'Updated employee ID ' + req.params.id);
        res.json({ success: true });

    } catch (err) {
        console.error('updateEmployee error -', err.message);
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/employees/:id - admin only
router.delete('/:id', auth, requireRole('Admin'), async (req, res) => {
    try {
        const db = getDB();

        // cant delete someone who has tools out
        var [loans] = await db.execute(
            'SELECT id FROM checkouts WHERE employee_id = ? AND status = "Active"',
            [req.params.id]
        );
        if (loans.length) {
            return res.status(400).json({ error: 'Employee has active tool loans - return them first' });
        }

        // get name before deleting for the log
        var [rows] = await db.execute('SELECT badge, name FROM users WHERE id = ?', [req.params.id]);
        if (!rows.length) return res.status(404).json({ error: 'Employee not found' });

        await db.execute('DELETE FROM users WHERE id = ?', [req.params.id]);
        await logActivity(db, req.user.id, 'Deleted employee ' + rows[0].badge + ' - ' + rows[0].name);
        res.json({ success: true });

    } catch (err) {
        console.error('deleteEmployee failed:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
