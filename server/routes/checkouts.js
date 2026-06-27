// routes/checkouts.js
// checkout, return, bulk return
// processReturn() is shared between single and bulk - extracted to avoid copy-paste

const express = require('express');
const router  = express.Router();

const { getDB }  = require('../config');
const { auth, canDo, logActivity } = require('../middleware/auth');

async function getSettings(db) {
    const [rows] = await db.execute("SELECT setting_key, setting_value FROM settings");
    var cfg = {};
    rows.forEach(function(r) {
        try { cfg[r.setting_key] = JSON.parse(r.setting_value); }
        catch(e) { cfg[r.setting_key] = r.setting_value; }
    });
    return cfg;
}

// GET /api/checkouts
router.get('/', auth, async (req, res) => {
    try {
        const db = getDB();
        const [checkouts] = await db.execute(`
            SELECT
                c.*,
                t.name        AS toolName,
                t.internal_id AS toolInternalId,
                u.name        AS employeeName
            FROM checkouts c
            JOIN tools t ON c.tool_id     = t.id
            JOIN users u ON c.employee_id = u.id
            ORDER BY c.date_out DESC
        `);
        res.json(checkouts);
    } catch (txErr) {
        console.error('GET /checkouts error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/checkouts - check out tools
router.post('/', auth, async (req, res) => {
    try {
        const db       = getDB();
        const settings = await getSettings(db);

        if (!canDo(req.user, 'checkout', settings)) {
            return res.status(403).json({ error: 'You dont have permission to check out tools' });
        }

        const { employeeId, workOrder, dueDate, toolIds } = req.body;

        if (!employeeId || !workOrder || !workOrder.trim() || !dueDate || !toolIds || !toolIds.length) {
            return res.status(400).json({ error: 'Missing employee, work order, due date, or tools' });
        }

        // reject past due dates
        const due   = new Date(dueDate);
        const today = new Date(); today.setHours(0, 0, 0, 0);
        if (due < today) {
            return res.status(400).json({ error: 'Due date cant be in the past' });
        }

        // check max tools setting
        const maxTools = (settings.workflows && settings.workflows.maxToolsPerCheckout) || 10;
        if (toolIds.length > maxTools) {
            return res.status(400).json({ error: 'Cannot check out more than ' + maxTools + ' tools at once' });
        }

        // verify all tools exist and are available
        const placeholders = toolIds.map(() => '?').join(',');
        const [tools] = await db.execute(
            'SELECT id, status FROM tools WHERE id IN (' + placeholders + ')',
            toolIds
        );

        if (tools.length !== toolIds.length) {
            return res.status(400).json({ error: 'One or more tools not found' });
        }

        const notAvailable = tools.filter(t => t.status !== 'Available');
        if (notAvailable.length) {
            return res.status(400).json({
                error: 'Some tools are not available',
                unavailable: notAvailable.map(t => t.id)
            });
        }

        // bug dec 2024: yohannes could checkout the same tool twice by clicking fast
        // added transaction here to prevent that
        const conn = await db.getConnection();
        await conn.beginTransaction();
        try {
            const today2 = new Date().toISOString().split('T')[0];
            for (const tid of toolIds) {
                await conn.execute(
                    'INSERT INTO checkouts (tool_id, employee_id, work_order, date_out, due_date, status) VALUES (?, ?, ?, ?, ?, "Active")',
                    [tid, employeeId, workOrder.trim(), today2, dueDate]
                );
                await conn.execute(
                    'UPDATE tools SET status = "In Use" WHERE id = ?',
                    [tid]
                );
            }
            await logActivity(conn, req.user.id,
                'Checked out ' + toolIds.length + ' tool(s) to employee ' + employeeId + ' (WO: ' + workOrder + ')'
            );
            await conn.commit();
            res.json({ success: true });
        } catch (txErr) {
            await conn.rollback();
            console.error('checkout tx failed:' , txErr.message);
            throw txErr;
        } finally {
            conn.release();
        }

    } catch (txErr) {
        console.error('POST /checkouts error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/checkouts/return - return a single tool
router.post('/return', auth, async (req, res) => {
    try {
        const db       = getDB();
        const settings = await getSettings(db);

        if (!canDo(req.user, 'checkin', settings)) {
            return res.status(403).json({ error: 'You dont have permission to check in tools' });
        }

        const { checkoutId, condition, note, totalDamage } = req.body;
        if (!checkoutId) return res.status(400).json({ error: 'Checkout ID required' });

        const result = await processReturn(db, checkoutId, condition, note, totalDamage, req.user.id);
        if (!result.success) return res.status(400).json(result);
        res.json(result);

    } catch (txErr) {
        console.error('POST /checkouts/return error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/checkouts/bulk-return
router.post('/bulk-return', auth, async (req, res) => {
    try {
        const db       = getDB();
        const settings = await getSettings(db);

        if (!canDo(req.user, 'checkin', settings)) {
            return res.status(403).json({ error: 'Permission denied' });
        }

        const { checkoutIds, condition } = req.body;
        if (!checkoutIds || !checkoutIds.length) {
            return res.status(400).json({ error: 'No checkout IDs provided' });
        }

        var successCount = 0;
        var failures = [];

        for (const id of checkoutIds) {
            const result = await processReturn(db, id, condition || 'Good', '', false, req.user.id);
            if (result.success) successCount++;
            else failures.push(id);
        }

        res.json({ success: true, successCount, failures });

    } catch (txErr) {
        console.error('POST /checkouts/bulk-return error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// shared return logic - used by both single and bulk
async function processReturn(db, checkoutId, condition, note, totalDamage, userId) {
    const conn = await db.getConnection();
    await conn.beginTransaction();
    try {
        const [rows] = await conn.execute(
            'SELECT * FROM checkouts WHERE id = ? AND status = "Active"',
            [checkoutId]
        );
        if (!rows.length) {
            await conn.rollback();
            console.error('checkout tx failed:' , txErr.message);
            conn.release();
            return { success: false, error: 'Checkout not found or already returned' };
        }

        const co = rows[0];

        await conn.execute(
            'UPDATE checkouts SET status = "Returned", return_date = CURDATE() WHERE id = ?',
            [checkoutId]
        );

        var newStatus;
        if (condition === 'Lost')      newStatus = 'Lost';
        else if (condition === 'Poor') newStatus = totalDamage ? 'Total Damage' : 'Maintenance';
        else                           newStatus = 'Available';

        await conn.execute('UPDATE tools SET status = ? WHERE id = ?', [newStatus, co.tool_id]);

        // open maintenance record if damaged but not scrapped
        if (condition === 'Poor' && !totalDamage) {
            await conn.execute(
                'INSERT INTO maintenance (tool_id, issue, date_reported, status) VALUES (?, ?, CURDATE(), "Open")',
                [co.tool_id, note || 'Damaged on return - no details given']
            );
        }

        // log lost tools in maintenance for tracking
        if (condition === 'Lost' && note) {
            await conn.execute(
                'INSERT INTO maintenance (tool_id, issue, date_reported, status) VALUES (?, ?, CURDATE(), "Lost")',
                [co.tool_id, 'LOST: ' + note]
            );
        }

        await logActivity(conn, userId,
            'Returned checkout ' + checkoutId + ' - condition: ' + condition + ', status: ' + newStatus
        );

        await conn.commit();
        return { success: true };

    } catch (txErr) {
        await conn.rollback();
        console.error('processReturn error for', checkoutId, ':', err.message);
        return { success: false, error: err.message };
    } finally {
        conn.release();
    }
}

module.exports = router;
