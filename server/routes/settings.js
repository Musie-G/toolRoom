// routes/settings.js
// settings + the getAll endpoint used on app startup
// getAll is the biggest one - loads everything the frontend needs in one shot

const express = require('express');
const router  = express.Router();

const { getDB }  = require('../config');
const { auth, requireRole, logActivity } = require('../middleware/auth');

// GET /api/settings/all
// equivalent to the old getAll case in api.php
// loads tools, employees, checkouts, maintenance, activity and settings in parallel
router.get('/all', auth, async (req, res) => {
    try {
        const db = getDB();

        const [
            [tools],
            [employees],
            [checkouts],
            [maintenance],
            [activity],
            [settingsRows]
        ] = await Promise.all([
            db.execute('SELECT * FROM tools ORDER BY name ASC'),

            db.execute('SELECT id, badge, name, department, role, email, phone FROM users ORDER BY name ASC'),

            db.execute(`
                SELECT
                    c.*,
                    t.name        AS toolName,
                    t.internal_id AS toolInternalId,
                    u.name        AS employeeName
                FROM checkouts c
                JOIN tools t ON c.tool_id     = t.id
                JOIN users u ON c.employee_id = u.id
                ORDER BY c.date_out DESC
            `),

            db.execute(`
                SELECT
                    m.*,
                    t.name        AS toolName,
                    t.internal_id AS toolInternalId
                FROM maintenance m
                JOIN tools t ON m.tool_id = t.id
                ORDER BY m.date_reported DESC
            `),

            db.execute(
                'SELECT * FROM activity_log ORDER BY timestamp DESC LIMIT 200'
            ),

            db.execute('SELECT setting_key, setting_value FROM settings')
        ]);

        // parse settings from flat key/value rows into a proper object
        var settings = {};
        settingsRows.forEach(function(r) {
            try { settings[r.setting_key] = JSON.parse(r.setting_value); }
            catch(e) { settings[r.setting_key] = r.setting_value; }
        });

        // map employees to include dept alias - some frontend code uses dept, some department
        const mappedEmployees = employees.map(u => ({
            ...u,
            dept: u.department
        }));

        res.json({
            tools,
            employees:   mappedEmployees,
            checkouts,
            maintenance,
            activity,
            settings
        });

    } catch (err) {
        console.error('getAll failed:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/settings
router.get('/', auth, requireRole('Admin'), async (req, res) => {
    try {
        const db = getDB();
        const [rows] = await db.execute('SELECT setting_key, setting_value FROM settings');
        var settings = {};
        rows.forEach(r => {
            try { settings[r.setting_key] = JSON.parse(r.setting_value); }
            catch(e) { settings[r.setting_key] = r.setting_value; }
        });
        res.json(settings);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/settings - save all settings
router.post('/', auth, requireRole('Admin'), async (req, res) => {
    try {
        const db   = getDB();
        const data = req.body.settings || req.body;

        // same nuke+reinsert approach as api.php - not ideal but simple
        // tried upsert with ON DUPLICATE KEY but it got messy with multiple keys
        const conn = await db.getConnection();
        await conn.beginTransaction();
        try {
            await conn.execute('DELETE FROM settings');
            const stmt = await conn.prepare(
                'INSERT INTO settings (setting_key, setting_value) VALUES (?, ?)'
            );
            for (const [key, val] of Object.entries(data)) {
                await stmt.execute([key, JSON.stringify(val)]);
            }
            await stmt.close();
            await conn.commit();
        } catch (saveErr) {
            await conn.rollback();
            console.error('settings save failed:' , saveErr.message);
            throw saveErr;
        } finally {
            conn.release();
        }

        await logActivity(db, req.user.id, 'Updated system settings');
        res.json({ success: true });

    } catch (err) {
        console.error('saveSettings error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/settings/reset-data - wipe everything except users and settings
router.post('/reset-data', auth, requireRole('Admin'), async (req, res) => {
    try {
        const db   = getDB();
        const conn = await db.getConnection();
        await conn.beginTransaction();
        try {
            // delete in FK-safe order
            await conn.execute('DELETE FROM activity_log');
            await conn.execute('DELETE FROM maintenance');
            await conn.execute('DELETE FROM checkouts');
            await conn.execute('DELETE FROM tools');
            // keep users + settings so admin isnt locked out
            await conn.commit();
        } catch (saveErr) {
            await conn.rollback();
            console.error('settings save failed:' , saveErr.message);
            throw saveErr;
        } finally {
            conn.release();
        }

        // log after the wipe so there's at least one entry
        await logActivity(db, req.user.id, 'System data reset by admin');
        res.json({ success: true });

    } catch (err) {
        console.error('resetData error -', err.message);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
