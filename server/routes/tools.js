// routes/tools.js
// tool CRUD - pretty much a direct port of the tool cases from api.php

const express = require('express');
const router  = express.Router();

const { getDB }  = require('../config');
const { auth, canDo, logActivity } = require('../middleware/auth');

// load settings from db - used for permission checks
// TODO: cache this, its called on every mutating request
// copied from checkouts.js - should probably centralise this at some point
async function getSettings(db) {
    const [rows] = await db.execute("SELECT setting_key, setting_value FROM settings");
    var settings = {};
    rows.forEach(function(r) {
        try { settings[r.setting_key] = JSON.parse(r.setting_value); }
        catch(e) { settings[r.setting_key] = r.setting_value; }
    });
    return settings;
}

// GET /api/tools
router.get('/', auth, async (req, res) => {
    try {
        const db = getDB();
        const [tools] = await db.execute('SELECT * FROM tools ORDER BY name ASC');
        res.json(tools);
    } catch (err) {
        console.error('tools fetch failed:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/tools - add tool
router.post('/', auth, async (req, res) => {
    try {
        const db       = getDB();
        const settings = await getSettings(db);

        if (!canDo(req.user, 'add', settings)) {
            return res.status(403).json({ error: 'You dont have permission to add tools' });
        }

        var data = req.body.tool || req.body;

        // check duplicate before insert - mysql unique constraint gives ugly error otherwise
        var [existing] = await db.execute(
            'SELECT id FROM tools WHERE internal_id = ?',
            [data.internalId]
        );
        if (existing.length) {
            return res.status(400).json({ error: 'A tool with that internal ID already exists' });
        }

        var [result] = await db.execute(
            `INSERT INTO tools
                (internal_id, name, dept, category, location, purchase_date,
                 price, calibration_due, manufacturer, model, notes, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                data.internalId,
                data.name,
                data.dept,
                data.category      || null,
                data.location      || null,
                data.purchaseDate   || null,
                data.price          || null,
                data.calibrationDue || null,
                data.manufacturer   || null,
                data.model          || null,
                data.notes          || null,
                data.status         || 'Available'
            ]
        );

        await logActivity(db, req.user.id, 'Added tool ' + data.internalId + ' - ' + data.name);
        res.json({ success: true, id: result.insertId });

    } catch (err) {
        console.error('addTool error:', err);
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/tools/:id - update tool
router.put('/:id', auth, async (req, res) => {
    try {
        const db       = getDB();
        const settings = await getSettings(db);

        if (!canDo(req.user, 'edit', settings)) {
            return res.status(403).json({ error: 'You dont have permission to edit tools' });
        }

        var data = req.body.tool || req.body;

        await db.execute(
            `UPDATE tools SET
                internal_id     = ?,
                name            = ?,
                dept            = ?,
                category        = ?,
                location        = ?,
                purchase_date   = ?,
                price           = ?,
                calibration_due = ?,
                manufacturer    = ?,
                model           = ?,
                notes           = ?,
                status          = ?
             WHERE id = ?`,
            [
                data.internalId,
                data.name,
                data.dept,
                data.category      || null,
                data.location      || null,
                data.purchaseDate   || null,
                data.price          || null,
                data.calibrationDue || null,
                data.manufacturer   || null,
                data.model          || null,
                data.notes          || null,
                data.status,
                req.params.id
            ]
        );

        await logActivity(db, req.user.id, 'Updated tool ID ' + req.params.id);
        res.json({ success: true });

    } catch (err) {
        console.error('updateTool:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/tools/:id
router.delete('/:id', auth, async (req, res) => {
    try {
        const db       = getDB();
        const settings = await getSettings(db);

        if (!canDo(req.user, 'delete', settings)) {
            return res.status(403).json({ error: 'You dont have permission to delete tools' });
        }

        // block if tool is currently checked out
        var [active] = await db.execute(
            'SELECT id FROM checkouts WHERE tool_id = ? AND status = "Active"',
            [req.params.id]
        );
        if (active.length) {
            return res.status(400).json({ error: 'Cannot delete - tool is currently checked out' });
        }

        await db.execute('DELETE FROM tools WHERE id = ?', [req.params.id]);
        await logActivity(db, req.user.id, 'Deleted tool ID ' + req.params.id);
        res.json({ success: true });

    } catch (err) {
        console.error('deleteTool failed -', err.message);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
