// routes/maintenance.js

const express = require('express');
const router  = express.Router();

const { getDB }  = require('../config');
const { auth, canDo, logActivity } = require('../middleware/auth');

// GET /api/maintenance
router.get('/', auth, async (req, res) => {
    try {
        const db = getDB();
        const [records] = await db.execute(`
            SELECT
                m.*,
                t.name        AS toolName,
                t.internal_id AS toolInternalId
            FROM maintenance m
            JOIN tools t ON m.tool_id = t.id
            ORDER BY m.date_reported DESC
        `);
        res.json(records);
    } catch (err) {
        console.error('maintenance list error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/maintenance/:id/resolve
router.post('/:id/resolve', auth, async (req, res) => {
    try {
        const db = getDB();

        // get settings for permission check
        const [sRows] = await db.execute("SELECT setting_key, setting_value FROM settings");
        var settings = {};
        sRows.forEach(r => {
            try { settings[r.setting_key] = JSON.parse(r.setting_value); }
            catch(e) { settings[r.setting_key] = r.setting_value; }
        });

        if (!canDo(req.user, 'maint', settings)) {
            return res.status(403).json({ error: 'You dont have permission to manage maintenance' });
        }

        // get the maintenance record to find the tool_id
        const [rows] = await db.execute(
            'SELECT tool_id FROM maintenance WHERE id = ?',
            [req.params.id]
        );
        if (!rows.length) {
            return res.status(404).json({ error: 'Maintenance record not found' });
        }

        const toolId = rows[0].tool_id;

        await db.execute(
            'UPDATE maintenance SET status = "Resolved", date_resolved = CURDATE() WHERE id = ?',
            [req.params.id]
        );
        await db.execute(
            'UPDATE tools SET status = "Available" WHERE id = ?',
            [toolId]
        );

        await logActivity(db, req.user.id,
            'Resolved maintenance ' + req.params.id + ' for tool ' + toolId
        );

        res.json({ success: true });

    } catch (err) {
        console.error('resolveMaintenance error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
