// state.js
// global app state + data loading
// switched to Node/Express backend - uses JWT instead of PHP sessions

var appState = {
    tools: [],
    employees: [],
    checkouts: [],
    maintenance: [],
    activityLog: [],
    settings: {},
    loggedInUser: { role: 'Admin', name: 'Loading...' }
};

// settings come back from the server already parsed as a proper object
// mysql version stores them as json strings in a key/value table
// server-side already does JSON.parse, so we just use them directly here
// keeping the function in case any values slip through as raw strings
function parseSettingsFromDb(raw) {
    if (!raw) return {};
    var out = Object.assign({}, raw);
    return out;
}

// pulls everything from the new Node getAll endpoint
// retries a couple times - wifi in the hangar drops constantly
async function loadData() {
    var attemptsLeft = 2;
    var lastErr = null;

    while (attemptsLeft >= 0) {
        try {
            var token = localStorage.getItem('toolroom_token');
            if (!token) {
                window.location.href = 'login.html';
                return false;
            }

            var resp = await fetch('/api/settings/all', {
                headers: {
                    'Authorization':  'Bearer ' + token,
                    'X-Requested-With': 'XMLHttpRequest'
                }
            });

            if (resp.status === 401) {
                localStorage.removeItem('toolroom_token');
                window.location.href = 'login.html';
                return false;
            }

            if (!resp.ok) throw new Error('HTTP ' + resp.status);

            var data = await resp.json();

            appState.tools       = data.tools       || [];
            appState.employees   = data.employees   || [];
            appState.checkouts   = data.checkouts   || [];
            appState.maintenance = data.maintenance || [];
            appState.activityLog = data.activity    || [];
            appState.settings    = parseSettingsFromDb(data.settings || {});

            // mysql2 returns numeric IDs as integers already
            // but normalize with parseInt anyway - === needs consistent types
            appState.tools.forEach(function(t) { t.id = parseInt(t.id); });
            appState.employees.forEach(function(e) { e.id = parseInt(e.id); });
            appState.checkouts.forEach(function(c) {
                c.id          = parseInt(c.id);
                c.tool_id     = parseInt(c.tool_id);
                c.employee_id = parseInt(c.employee_id);
            });
            appState.maintenance.forEach(function(m) {
                m.id      = parseInt(m.id);
                m.tool_id = parseInt(m.tool_id);
            });

            refreshDashboardCounts();
            return true;

        } catch (err) {
            lastErr = err;
            attemptsLeft--;
            if (attemptsLeft >= 0) {
                console.log('loadData failed, will retry...', err.message);
                await new Promise(function(r) { setTimeout(r, 1000); });
            }
        }
    }

    console.error('loadData: out of retries.', lastErr);
    if (window.app && window.app.showNotification) {
        window.app.showNotification('Could not load data - try refreshing', 'error');
    }
    return false;
}

// updates the number badges on the dashboard cards
function refreshDashboardCounts() {
    var tools = appState.tools;

    function setEl(id, val) {
        var el = document.getElementById(id);
        if (el) el.innerText = val;
    }

    setEl('dashTotal',     tools.length);
    setEl('dashEmployees', appState.employees.length);

    var inUse = 0, avail = 0, maint = 0;
    for (var i = 0; i < tools.length; i++) {
        var s = tools[i].status;
        if (s === 'In Use')       inUse++;
        else if (s === 'Available')  avail++;
        else if (s === 'Maintenance') maint++;
    }
    setEl('dashInUse', inUse);
    setEl('dashAvail', avail);
    setEl('dashMaint', maint);

    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var overdue = 0;
    for (var j = 0; j < appState.checkouts.length; j++) {
        var co = appState.checkouts[j];
        if (co.status === 'Active' && co.due_date && new Date(co.due_date) < today) {
            overdue++;
        }
    }
    setEl('dashOverdue', overdue);

    var lost = 0, dmg = 0;
    for (var k = 0; k < tools.length; k++) {
        if (tools[k].status === 'Lost')         lost++;
        if (tools[k].status === 'Total Damage') dmg++;
    }
    setEl('dashLost',   lost);
    setEl('dashDamage', dmg);
}

var updateDashboard = refreshDashboardCounts;
