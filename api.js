// api.js
// all server calls go through here
// switched from PHP+sessions to Node+JWT
// token is stored in localStorage and sent as Authorization header

// token stuff - localStorage for now, could move to httpOnly cookie later

function getToken() {
    return localStorage.getItem('toolroom_token') || null;
}

function setToken(token) {
    localStorage.setItem('toolroom_token', token);
}

function clearToken() {
    localStorage.removeItem('toolroom_token');
}

// central fetch wrapper - adds JWT auth header automatically
async function apiRequest(path, method, body) {
    if (!method) method = 'GET';

    const token = getToken();
    var headers = {
        'Content-Type':  'application/json',
        'X-Requested-With': 'XMLHttpRequest'
    };
    if (token) headers['Authorization'] = 'Bearer ' + token;

    var opts = { method: method, headers: headers };
    if (body) opts.body = JSON.stringify(body);

    try {
        const res = await fetch('/api' + path, opts);

        // token expired or invalid - send to login
        if (res.status === 401) {
            clearToken();
            window.location.href = 'login.html';
            return { success: false, error: 'Session expired' };
        }

        if (!res.ok) {
            let msg = 'HTTP ' + res.status;
            try { const d = await res.json(); msg = d.error || msg; } catch(e) {}
            return { success: false, error: msg };
        }

        return await res.json();

    } catch (err) {
        console.error('apiRequest failed (' + path + '):', err.message);
        return { success: false, error: 'Connection failed. Check your network.' };
    }
}

//
// tools
//

async function saveToolToServer(toolData, existingId) {
    var result;
    if (existingId) {
        result = await apiRequest('/tools/' + existingId, 'PUT', { tool: toolData });
    } else {
        result = await apiRequest('/tools', 'POST', { tool: toolData });
    }
    if (result.success || result.id) {
        await loadData();
        return true;
    }
    showNotification('Could not save tool: ' + (result.error || 'unknown error'), 'error');
    return false;
}

async function deleteToolFromServer(toolId) {
    var result = await apiRequest('/tools/' + toolId, 'DELETE');
    if (result.success) {
        await loadData();
        return true;
    }
    console.error('deleteTool failed:', result.error);
    showNotification(result.error || 'Delete failed', 'error');
    return false;
}

function findToolById(id) {
    return appState.tools.find(function(t) { return t.id == id; }) || null;
}

//
// employees
//

async function saveEmployeeToServer(empData, existingId) {
    var endpoint = existingId ? ('/employees/' + existingId) : '/employees';
    var method   = existingId ? 'PUT' : 'POST';
    console.log('saveEmployee ->', method, endpoint, empData.name);

    try {
        var result = await apiRequest(endpoint, method, { employee: empData });
        if (result.success || result.id) {
            await loadData();
            return {
                success: true,
                badge:   result.badge || empData.badge,
                id:      result.id
            };
        }
        console.error('saveEmployee error:', result.error);
        showNotification('Error: ' + (result.error || 'Save failed'), 'error');
        return { success: false, error: result.error };
    } catch (err) {
        console.error('saveEmployee exception:', err);
        showNotification('Network error. Could not save employee.', 'error');
        return { success: false, error: err.message };
    }
}

async function deleteEmployeeFromServer(empId) {
    console.log('deleteEmployee id=' + empId);
    var result = await apiRequest('/employees/' + empId, 'DELETE');
    if (result.success) {
        await loadData();
        return true;
    }
    console.error('deleteEmployee failed:', result.error);
    showNotification(result.error || 'Could not delete employee', 'error');
    return false;
}

async function resetEmployeePasswordOnServer(empId) {
    if (!navigator.onLine) {
        showNotification('No internet connection', 'error');
        return { success: false, error: 'offline' };
    }
    console.log('resetPassword empId=' + empId);

    var result = await apiRequest('/auth/reset-password', 'POST', { employeeId: empId });
    if (result.success) {
        return { success: true, newPassword: result.newPassword };
    }
    return { success: false, error: result.error || 'Reset failed' };
}
