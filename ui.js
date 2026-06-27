// ui.js
// render functions, modals, the settings page, notifications
// also handles checkout/checkin/return flow - got dumped here over time
// yeah this file is too big. splitting it is on the list
// kept putting it off

// XSS bit us once in feb when someone named their tool <script>alert(1)</script>
// as a joke. not funny. escape everything before touching innerHTML.
// second arg handles newlines for textarea attributes
function escapeHtml(str, isAttr) {
    if (!str && str !== 0) return '';
    var s = String(str);
    s = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    s = s.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    if (isAttr) s = s.replace(/\n/g, '&#10;').replace(/\r/g, '&#13;');
    return s;
}

// notifications

function showNotification(msg, type) {
    if (!type) type = 'info';
    // using 4000ms for errors so people actually have time to read them
    var ms = (type === 'error') ? 4000 : 3000;
    Swal.fire({
        toast: true,
        position: 'top-end',
        icon: type,
        title: msg,
        showConfirmButton: false,
        timer: ms,
        timerProgressBar: true
    });
}

// shorthand - got tired of typing showNotification every time
function notify(msg, type) { showNotification(msg, type || 'info'); }

// modals

function openModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('active');
}

function closeModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('active');
    el.querySelectorAll('form').forEach(f => f.reset());
}

// nav + sidebar stuff

function applyPermissions(userRole) {
    document.querySelectorAll('#navMenu .nav-link').forEach(link => {
        const roles = link.getAttribute('data-roles');
        if (!roles) return;
        if (roles.split(',').includes(userRole)) {
            link.classList.remove('hidden-by-role');
        } else {
            link.classList.add('hidden-by-role');
        }
    });

    const addBtn = document.getElementById('addToolBtn');
    if (addBtn) {
        const tkp = appState.settings.permissions && appState.settings.permissions.toolkeeper;
        if (userRole === 'Admin')           addBtn.style.display = 'inline-flex';
        else if (userRole === 'Toolkeeper') addBtn.style.display = (tkp && tkp.add) ? 'inline-flex' : 'none';
        else                                addBtn.style.display = 'none';
    }

    const empBtn = document.getElementById('addEmployeeBtn');
    if (empBtn) empBtn.style.display = userRole === 'Admin' ? 'inline-flex' : 'none';
}

function navigate(pageId) {
    const navLink = document.querySelector('[data-nav="' + pageId + '"]');

    if (navLink && navLink.classList.contains('hidden-by-role')) {
        showNotification('Access denied for your role.', 'error');
        return;
    }

    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const pg = document.getElementById(pageId + '-page');
    if (!pg) { console.warn('navigate: no page for', pageId); return; }
    pg.classList.add('active');

    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    if (navLink) navLink.classList.add('active');

    const hdr = document.getElementById('page-header');
    if (hdr) hdr.innerText = pageId.charAt(0).toUpperCase() + pageId.slice(1);

    // call each page's render fn - added lazily as pages were built
    if (pageId === 'tools')            { window.app.renderTools && window.app.renderTools(); }
    else if (pageId === 'checkout')    { window.app.renderCheckoutTable && window.app.renderCheckoutTable(); }
    else if (pageId === 'checkin')     { window.app.renderCheckinTable && window.app.renderCheckinTable(); }
    else if (pageId === 'maintenance') { window.app.renderMaintenance && window.app.renderMaintenance(); }
    else if (pageId === 'employees')   { window.app.renderEmployees && window.app.renderEmployees(); }
    else if (pageId === 'audit')       { window.app.renderAuditLog && window.app.renderAuditLog(); }
    else if (pageId === 'settings')    { window.app.loadSettingsIntoUI && window.app.loadSettingsIntoUI(); }
    else if (pageId === 'dashboard')   { window.app.updateDashboard && window.app.updateDashboard(); }

    if (window.innerWidth < 768) {
        const sb = document.getElementById('sidebar');
        if (sb) sb.classList.remove('active');
    }
}

function toggleSidebar() {
    const sb = document.getElementById('sidebar');
    const mc = document.getElementById('mainContent');
    if (!sb || !mc) return;
    if (window.innerWidth < 768) {
        sb.classList.toggle('active');
    } else {
        sb.classList.toggle('collapsed');
        mc.classList.toggle('collapsed-margin');
    }
}

function toggleTheme() { document.body.classList.toggle('dark-mode'); }

function showCurrentUserInSidebar(user) {
    const el = document.getElementById('currentUserDisplay');
    if (!el) return;
    var cls = 'status-admin';
    if (user.role === 'Toolkeeper')  cls = 'status-toolkeeper';
    else if (user.role === 'Technician') cls = 'status-technician';
    el.innerHTML = 'Current User: <span class="status-badge ' + cls + '">' + user.role + ' (' + user.name + ')</span>';
}

// inventory table

async function renderTools() {
    const tbody = document.querySelector('#toolsTable tbody');
    if (!tbody) return;

    const q = (document.getElementById('toolSearchBox') && document.getElementById('toolSearchBox').value.toLowerCase()) || '';

    // used to use .filter() here but switched to a loop after a perf complaint
    // (probably doesnt matter tbh, but keeping it)
    let rows = '';
    for (var i = 0; i < appState.tools.length; i++) {
        const tool = appState.tools[i];
        if (q && !tool.name.toLowerCase().includes(q) && !tool.internal_id.toLowerCase().includes(q)) continue;

        let badge = 'status-available';
        if (tool.status === 'In Use')           badge = 'status-in-use';
        else if (tool.status === 'Maintenance') badge = 'status-maintenance';
        else if (tool.status !== 'Available')   badge = 'status-lost';

        rows += '<tr>' +
            '<td><strong>' + escapeHtml(tool.internal_id) + '</strong></td>' +
            '<td>' + escapeHtml(tool.name) + (tool.category ? '<br><small>' + escapeHtml(tool.category) + '</small>' : '') + '</td>' +
            '<td>' + escapeHtml(tool.dept || '-') + '</td>' +
            '<td><span class="status-badge ' + badge + '">' + escapeHtml(tool.status) + '</span></td>' +
            '<td>' + escapeHtml(tool.location || '—') + '</td>' +
            '<td>' +
                '<button class="btn action-btn action-btn-edit" data-action="editTool" data-tool-id="' + tool.id + '"><i class="fas fa-edit"></i></button>' +
                '<button class="btn action-btn action-btn-delete" data-action="deleteTool" data-tool-id="' + tool.id + '"><i class="fas fa-trash"></i></button>' +
            '</td>' +
        '</tr>';
    }

    tbody.innerHTML = rows || '<tr><td colspan="6" style="text-align:center; padding: 40px;">' +
        '🔧 No tools found. Try a different search or add a new tool.<br><br>' +
        '<button class="btn btn-secondary" onclick="app.uploadExcel()"><i class="fas fa-file-upload"></i> Upload Excel</button> ' +
        '<button class="btn btn-secondary" onclick="app.downloadTemplate()"><i class="fas fa-download"></i> Download Template</button> ' +
        '<button class="btn btn-primary" onclick="app.openAddToolModal()"><i class="fas fa-plus"></i> Add Manually</button>' +
    '</td></tr>';
}

async function editTool(toolId) {
    if (!toolId || toolId <= 0) { showNotification('Invalid tool ID', 'error'); return; }

    const tool = findToolById(toolId);
    if (!tool) { showNotification('Tool not found - maybe it was deleted?', 'error'); return; }

    document.getElementById('toolId').value             = tool.id;
    document.getElementById('toolName').value           = tool.name || '';
    document.getElementById('toolInternalId').value     = tool.internal_id || '';

    // populate the selects first so the options exist before we try to set values
    populateModalSelects();

    document.getElementById('toolDept').value           = tool.dept || '';
    document.getElementById('toolCategory').value       = tool.category || '';
    document.getElementById('toolLoc').value            = tool.location || '';
    document.getElementById('toolPurchaseDate').value   = tool.purchase_date || '';
    document.getElementById('toolPrice').value          = tool.price || '';
    document.getElementById('toolCalibrationDue').value = tool.calibration_due || '';
    document.getElementById('toolManufacturer').value   = tool.manufacturer || '';
    document.getElementById('toolModel').value          = tool.model || '';
    document.getElementById('toolNotes').value          = tool.notes || '';

    openModal('toolModal');
}

async function saveTool(e) {
    e.preventDefault();

    const tid = document.getElementById('toolId').value;
    const editing = tid && tid !== '';

    // when editing, keep existing status - dont reset to Available
    let status = 'Available';
    if (editing) {
        const existing = appState.tools.find(t => t.id == tid);
        if (existing) status = existing.status;
    }

    const payload = {
        id:             editing ? parseInt(tid) : null,
        internalId:     document.getElementById('toolInternalId').value.trim(),
        name:           document.getElementById('toolName').value.trim(),
        dept:           document.getElementById('toolDept').value,
        category:       document.getElementById('toolCategory').value,
        location:       document.getElementById('toolLoc').value.trim(),
        purchaseDate:   document.getElementById('toolPurchaseDate').value,
        price:          document.getElementById('toolPrice').value,
        calibrationDue: document.getElementById('toolCalibrationDue').value,
        manufacturer:   document.getElementById('toolManufacturer').value.trim(),
        model:          document.getElementById('toolModel').value.trim(),
        notes:          document.getElementById('toolNotes').value.trim(),
        status: status
    };

    if (!payload.name || !payload.internalId) {
        showNotification('Tool name and Internal ID are required', 'error');
        return;
    }
    if (!payload.dept) {
        showNotification('Please select a department', 'error');
        return;
    }

    const ok = await saveToolToServer(payload, editing ? tid : null);
    if (ok) {
        await loadData();
        await renderTools();
        closeModal('toolModal');
        showNotification(editing ? 'Tool updated' : 'Tool added', 'success');
    }
}

async function deleteTool(id) {
    const t = appState.tools.find(x => x.id === id);
    const name = t ? t.name : 'this tool';

    const res = await Swal.fire({
        title: 'Delete Tool?',
        html: 'Are you sure you want to delete <strong>' + escapeHtml(name) + '</strong>?<br>This cannot be undone.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Yes, delete it',
        cancelButtonText: 'Cancel',
        confirmButtonColor: '#ef4444'
    });

    if (res.isConfirmed) {
        const done = await deleteToolFromServer(id);
        if (done) { await loadData(); await renderTools(); showNotification('Tool deleted', 'success'); }
    }
}

// fills the dept + category dropdowns in the tool modal and employee modal
// has to run after loadData() so appState.settings is populated
// call this any time you open either modal
function populateModalSelects() {
    var depts = (appState.settings && Array.isArray(appState.settings.departments) && appState.settings.departments.length > 0)
                ? appState.settings.departments
                : ['Mechanical', 'Avionics', 'Electrical', 'Ground Support', 'Administration'];

    var cats = (appState.settings && Array.isArray(appState.settings.categories) && appState.settings.categories.length > 0)
               ? appState.settings.categories
               : ['Hand Tools', 'Power Tools', 'Measuring Tools', 'Safety Equipment', 'Testing Equipment'];

    if (window.app && window.app.isDebugOn) {
        console.log('populateModalSelects - depts:', depts, '| cats:', cats);
    }

    // tool department select
    var toolDeptEl = document.getElementById('toolDept');
    if (toolDeptEl) {
        var prevDept = toolDeptEl.value;
        toolDeptEl.innerHTML = '<option value="">-- Select Department --</option>';
        for (var i = 0; i < depts.length; i++) {
            var opt = document.createElement('option');
            opt.value = depts[i];
            opt.textContent = depts[i];
            toolDeptEl.appendChild(opt);
        }
        if (prevDept) toolDeptEl.value = prevDept;
    }

    // tool category select
    var toolCatEl = document.getElementById('toolCategory');
    if (toolCatEl) {
        var prevCat = toolCatEl.value;
        toolCatEl.innerHTML = '<option value="">-- Select Category --</option>';
        for (var j = 0; j < cats.length; j++) {
            var copt = document.createElement('option');
            copt.value = cats[j];
            copt.textContent = cats[j];
            toolCatEl.appendChild(copt);
        }
        if (prevCat) toolCatEl.value = prevCat;
    }

    // employee department select
    var empDeptEl = document.getElementById('employeeDept');
    if (empDeptEl) {
        var prevEmpDept = empDeptEl.value;
        empDeptEl.innerHTML = '<option value="">-- Select Department --</option>';
        for (var k = 0; k < depts.length; k++) {
            var eopt = document.createElement('option');
            eopt.value = depts[k];
            eopt.textContent = depts[k];
            empDeptEl.appendChild(eopt);
        }
        if (prevEmpDept) empDeptEl.value = prevEmpDept;
    }
}

function openAddToolModal() {
    document.getElementById('toolId').value = '';
    const f = document.getElementById('toolForm');
    if (f) f.reset();
    // populate selects AFTER reset so they dont get wiped
    populateModalSelects();
    openModal('toolModal');
}

function exportToExcel(tableId, filename) {
    const tbl = document.getElementById(tableId);
    if (!tbl) { console.warn('exportToExcel: table not found -', tableId); return; }
    const wb = XLSX.utils.table_to_book(tbl, { sheet: "Sheet 1" });
    XLSX.writeFile(wb, filename + ".xlsx");
}

// excel bulk import
// reuses a hidden file input to avoid creating one every time

var hiddenFileInput = null;

function getOrCreateFileInput() {
    if (!hiddenFileInput) {
        hiddenFileInput = document.createElement('input');
        hiddenFileInput.type = 'file';
        hiddenFileInput.accept = '.xlsx, .xls, .csv';
        hiddenFileInput.style.display = 'none';
        hiddenFileInput.addEventListener('change', processExcelUpload);
        document.body.appendChild(hiddenFileInput);
    }
    return hiddenFileInput;
}

function uploadExcel() {
    const fileInput = getOrCreateFileInput();
    fileInput.value = '';
    fileInput.click();
}

async function processExcelUpload(event) {
    const selectedFile = event.target.files[0];
    if (!selectedFile) return;

    Swal.fire({ title: 'Processing...', text: 'Reading Excel file...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });

    try {
        const rawRows  = await readExcelFile(selectedFile);
        const toolRows = parseToolRowsFromExcel(rawRows);

        if (toolRows.length === 0) {
            Swal.fire({ title: 'No valid data', text: 'No valid tool data found. Check the format.', icon: 'warning' });
            return;
        }

        const goAhead = await Swal.fire({
            title: 'Import Tools?',
            html: 'Found <strong>' + toolRows.length + '</strong> tool(s). Proceed?',
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Yes, import',
            cancelButtonText: 'Cancel'
        });

        if (!goAhead.isConfirmed) return;

        Swal.fire({ title: 'Importing...', text: 'Importing ' + toolRows.length + ' tools...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });

        let successCount = 0, failCount = 0;
        let failedRows = [];

        for (let i = 0; i < toolRows.length; i++) {
            const row = toolRows[i];
            try {
                const ok = await saveToolToServer(row, null);
                if (ok) { successCount++; }
                else    { failCount++; failedRows.push('Row ' + (i + 2) + ': ' + (row.name || 'Unknown')); }
            } catch (err) {
                failCount++;
                failedRows.push('Row ' + (i + 2) + ': ' + err.message);
            }
        }

        await loadData();
        await renderTools();

        if (failCount === 0) {
            Swal.fire({ title: 'Done!', html: 'Imported <strong>' + successCount + '</strong> tools.', icon: 'success' });
        } else {
            const errList = failedRows.map(e => '<li>' + escapeHtml(e) + '</li>').join('');
            Swal.fire({
                title: 'Import done with errors',
                html: '<strong>' + successCount + '</strong> ok, <strong>' + failCount + '</strong> failed.<br><br>' +
                      '<details><summary>View errors</summary><ul style="text-align:left;">' + errList + '</ul></details>',
                icon: 'warning'
            });
        }

    } catch (parseErr) {
        console.error('Excel upload error:', parseErr);
        Swal.fire({ title: 'Error', text: 'Failed to process file: ' + parseErr.message, icon: 'error' });
    }
}

function readExcelFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const bytes = new Uint8Array(e.target.result);
                const wb = XLSX.read(bytes, { type: 'array' });
                const ws = wb.Sheets[wb.SheetNames[0]];
                resolve(XLSX.utils.sheet_to_json(ws));
            } catch (err) { reject(err); }
        };
        reader.onerror = function() { reject(new Error('Failed to read file')); };
        reader.readAsArrayBuffer(file);
    });
}

function parseToolRowsFromExcel(rows) {
    const parsedTools = [];

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];

        // be flexible with column names - people dont always follow the template exactly
        const internalId   = row['Internal ID'] || row['internal_id'] || row['Barcode'] || row['barcode'] || row['ID'] || '';
        const toolName     = row['Name'] || row['name'] || row['Tool Name'] || row['tool_name'] || '';
        const dept         = row['Department'] || row['dept'] || row['Dept'] || '';
        const category     = row['Category'] || row['category'] || '';
        const location     = row['Location'] || row['location'] || '';
        const purchaseDate = row['Purchase Date'] || row['purchase_date'] || '';
        const price        = row['Price'] || row['price'] || 0;
        const calibDate    = row['Calibration Due'] || row['calibration_due'] || '';
        const manufacturer = row['Manufacturer'] || row['manufacturer'] || '';
        const modelNum     = row['Model'] || row['model'] || '';
        const notes        = row['Notes'] || row['notes'] || '';

        if (!internalId || !toolName) {
            console.warn('Skipping row ' + (i + 2) + ': missing Internal ID or Name');
            continue;
        }

        const alreadyExists = appState.tools.some(t => t.internal_id === internalId);
        if (alreadyExists) {
            console.warn('Skipping duplicate: ' + internalId);
            continue;
        }

        parsedTools.push({
            internalId:     String(internalId).trim(),
            name:           String(toolName).trim(),
            dept:           String(dept).trim(),
            category:       category     ? String(category).trim()     : null,
            location:       location     ? String(location).trim()     : null,
            purchaseDate:   purchaseDate ? normalizeDate(purchaseDate) : null,
            price:          price        ? parseFloat(price)           : null,
            calibrationDue: calibDate    ? normalizeDate(calibDate)    : null,
            manufacturer:   manufacturer ? String(manufacturer).trim() : null,
            model:          modelNum     ? String(modelNum).trim()     : null,
            notes:          notes        ? String(notes).trim()        : null,
            status:         'Available'
        });
    }

    return parsedTools;
}

// excel stores dates as serial numbers, need to convert
function normalizeDate(rawVal) {
    if (!rawVal) return null;
    if (typeof rawVal === 'number') {
        const d = new Date((rawVal - 25569) * 86400 * 1000);
        return d.toISOString().split('T')[0];
    }
    const parsed = new Date(String(rawVal));
    if (!isNaN(parsed.getTime())) return parsed.toISOString().split('T')[0];
    return null;
}

function downloadTemplate() {
    const sampleRows = [
        { 'Internal ID': 'TW-001', 'Name': 'Torque Wrench 50nm', 'Department': 'Mechanical', 'Category': 'Hand Tools', 'Location': 'A1-Shelf3', 'Purchase Date': '2023-01-15', 'Price': 450.00, 'Calibration Due': '2024-12-31', 'Manufacturer': 'Snap-on', 'Model': 'TQ50', 'Notes': 'Calibrated annually' },
        { 'Internal ID': 'DMM-001', 'Name': 'Digital Multimeter', 'Department': 'Avionics', 'Category': 'Measuring Tools', 'Location': 'B3-Cabinet2', 'Purchase Date': '2023-03-20', 'Price': 320.00, 'Calibration Due': '2025-01-15', 'Manufacturer': 'Fluke', 'Model': '87V', 'Notes': 'High precision' }
    ];
    const ws = XLSX.utils.json_to_sheet(sampleRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Tools Template');
    XLSX.writeFile(wb, 'tool_import_template.xlsx');
    showNotification('Template downloaded', 'success');
}

// checkout page

var pickedToolIds = new Set();

function populateEmployeeDropdown() {
    const dropdownEl = document.getElementById('coEmployeeSelect');
    if (!dropdownEl) { console.warn('coEmployeeSelect not found'); return; }

    dropdownEl.innerHTML = '<option value="" disabled selected>Select Employee</option>';
    const sorted = [...appState.employees].sort((a, b) => a.name.localeCompare(b.name));
    for (let i = 0; i < sorted.length; i++) {
        const emp = sorted[i];
        dropdownEl.innerHTML += '<option value="' + emp.id + '">' + escapeHtml(emp.name) + ' (' + escapeHtml(emp.badge) + ' - ' + escapeHtml(emp.department) + ')</option>';
    }
}

var renderEmployeeSelect = populateEmployeeDropdown;

function renderCheckoutTable() {
    const tableBody = document.querySelector('#checkoutToolsTable tbody');
    if (!tableBody) { console.warn('checkout tbody not found'); return; }

    const filterText = (document.getElementById('checkoutFilterInput') && document.getElementById('checkoutFilterInput').value.toLowerCase()) || '';
    const available = appState.tools.filter(t => t.status === 'Available');

    let filtered = [];
    for (let i = 0; i < available.length; i++) {
        const t = available[i];
        if (t.name.toLowerCase().includes(filterText) ||
            t.internal_id.toLowerCase().includes(filterText) ||
            t.dept.toLowerCase().includes(filterText)) {
            filtered.push(t);
        }
    }

    let rowsHtml = '';
    for (let i = 0; i < filtered.length; i++) {
        const tool = filtered[i];
        const chk  = pickedToolIds.has(tool.id) ? 'checked' : '';
        rowsHtml += '<tr>' +
            '<td><input type="checkbox" class="tool-select" data-id="' + tool.id + '" ' + chk + '></td>' +
            '<td>' + escapeHtml(tool.internal_id) + '</td>' +
            '<td>' + escapeHtml(tool.name) + '</td>' +
            '<td>' + escapeHtml(tool.dept) + '</td>' +
            '<td>' + escapeHtml(tool.location || '—') + '</td>' +
        '</tr>';
    }

    tableBody.innerHTML = rowsHtml || '<tr><td colspan="5" style="text-align:center;">No tools available</td></tr>';
    refreshCheckoutSummary();

    const datePicker = document.getElementById('coReturnDate');
    if (datePicker) {
        const n = new Date();
        datePicker.min = n.getFullYear() + '-' + String(n.getMonth()+1).padStart(2,'0') + '-' + String(n.getDate()).padStart(2,'0');
    }
}

function toggleToolSelection(toolId, cb) {
    if (cb.checked) pickedToolIds.add(toolId);
    else            pickedToolIds.delete(toolId);
    refreshCheckoutSummary();
}

function refreshCheckoutSummary() {
    const cnt  = document.getElementById('coSelectedCount');
    const list = document.getElementById('coSelectedList');
    if (!cnt || !list) return;

    cnt.innerText = pickedToolIds.size;
    if (pickedToolIds.size === 0) { list.innerHTML = 'None selected'; return; }

    let html = '', first = true;
    for (let id of pickedToolIds) {
        const t = appState.tools.find(x => x.id === id);
        if (t) {
            if (!first) html += '<br>';
            html += escapeHtml(t.name) + ' (' + escapeHtml(t.internal_id) + ')';
            first = false;
        }
    }
    list.innerHTML = html;
}

var updateCheckoutSummary = refreshCheckoutSummary;

async function handleCheckout(e) {
    e.preventDefault();

    const empId      = parseInt((document.getElementById('coEmployeeSelect') && document.getElementById('coEmployeeSelect').value) || '0');
    const workOrder  = (document.getElementById('coWorkOrder') && document.getElementById('coWorkOrder').value) || '';
    const returnDate = (document.getElementById('coReturnDate') && document.getElementById('coReturnDate').value) || '';

    if (!empId)                   { showNotification('Select an employee.', 'error'); return; }
    if (!workOrder.trim())        { showNotification('Work order / flight number is required.', 'error'); return; }
    if (pickedToolIds.size === 0) { showNotification('Select at least one tool.', 'error'); return; }

    const today = new Date(); today.setHours(0,0,0,0);
    if (new Date(returnDate) < today) { showNotification('Return date cannot be in the past.', 'error'); return; }

    const toolLimit = (appState.settings.workflows && appState.settings.workflows.maxToolsPerCheckout) || 10;
    if (pickedToolIds.size > toolLimit) {
        showNotification('Cannot checkout more than ' + toolLimit + ' tools at once.', 'error');
        return;
    }

    // bug fix dec 2024: yohannes reported that the same employee could have the
    // same tool checked out twice if they clicked fast enough. server should catch
    // it too but doing it client side as well just in case
    for (let tid of pickedToolIds) {
        const alreadyOut = appState.checkouts.find(function(c) {
            return c.tool_id == tid && c.employee_id == empId && c.status === 'Active';
        });
        if (alreadyOut) {
            const t = appState.tools.find(function(x) { return x.id == tid; });
            showNotification((t ? t.name : 'A tool') + ' is already checked out to this employee', 'error');
            return;
        }
    }

    const btn = e.submitter;
    let origTxt = '';
    if (btn) { origTxt = btn.innerHTML; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...'; btn.disabled = true; }

    try {
        const result = await apiRequest('/checkouts', 'POST', {
            employeeId: empId,
            workOrder:  workOrder,
            dueDate:    returnDate,
            toolIds:    Array.from(pickedToolIds)
        });

        if (result.success) {
            pickedToolIds.clear();
            await loadData();
            renderCheckoutTable();
            refreshCheckoutSummary();
            const form = document.getElementById('checkoutForm');
            if (form) form.reset();
            showNotification('Checkout processed.', 'success');
        } else {
            showNotification('Error: ' + (result.error || 'Checkout failed'), 'error');
        }
    } catch (err) {
        console.error('handleCheckout error:', err);
        showNotification('Checkout failed. Check console.', 'error');
    } finally {
        if (btn) { btn.innerHTML = origTxt; btn.disabled = false; }
    }
}

function clearCheckoutSelections() { pickedToolIds.clear(); renderCheckoutTable(); }

// checkin + return flow

var pickedCheckoutIds = new Set();

function renderCheckinTable() {
    const tbody = document.querySelector('#checkinTable tbody');
    if (!tbody) { console.warn('checkin tbody not found'); return; }

    const q       = (document.getElementById('checkinFilterInput') && document.getElementById('checkinFilterInput').value.toLowerCase()) || '';
    const active  = appState.checkouts.filter(c => c.status === 'Active');

    if (!active.length) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:40px;">📭 No active checkouts</td></tr>';
        return;
    }

    let html = '';
    for (let i = 0; i < active.length; i++) {
        const co        = active[i];
        const toolMatch = appState.tools.find(t => t.id === co.tool_id);
        const toolLabel = toolMatch ? toolMatch.name        : (co.toolName        || 'Unknown');
        const toolCode  = toolMatch ? toolMatch.internal_id : (co.toolInternalId  || 'N/A');

        const matches = toolLabel.toLowerCase().includes(q) || toolCode.toLowerCase().includes(q) ||
                        (co.employeeName || '').toLowerCase().includes(q) ||
                        (co.work_order   || '').toLowerCase().includes(q);
        if (!matches) continue;

        const now = new Date(); now.setHours(0,0,0,0);
        const isOverdue = new Date(co.due_date) < now;
        const dueStyle  = isOverdue ? 'color:#ef4444;font-weight:bold;' : '';
        const chk       = pickedCheckoutIds.has(co.id) ? 'checked' : '';

        html += '<tr data-checkout-id="' + co.id + '">' +
            '<td style="text-align:center;"><input type="checkbox" class="checkin-checkbox" data-id="' + co.id + '" ' + chk + '></td>' +
            '<td><strong>' + escapeHtml(toolLabel) + '</strong><br><small>ID: ' + escapeHtml(toolCode) + '</small><br><small>WO: ' + escapeHtml(co.work_order) + '</small></td>' +
            '<td>' + escapeHtml(co.employeeName || 'Unknown') + '</td>' +
            '<td>' + (co.date_out || '—') + '</td>' +
            '<td style="' + dueStyle + '">' + (co.due_date || '—') + (isOverdue ? ' ⚠️' : '') + '</td>' +
            '<td><button class="btn btn-sm btn-primary return-single-btn" data-id="' + co.id + '">🔄 Return</button></td>' +
        '</tr>';
    }

    tbody.innerHTML = html || '<tr><td colspan="6" style="text-align:center;padding:40px;">🔍 No matching checkouts</td></tr>';
    wireUpCheckinCheckboxes();
    wireUpReturnButtons();
}

function wireUpCheckinCheckboxes() {
    const boxes = document.querySelectorAll('#checkinTable .checkin-checkbox');
    for (let i = 0; i < boxes.length; i++) {
        boxes[i].removeEventListener('change', checkinBoxChanged);
        boxes[i].addEventListener('change', checkinBoxChanged);
    }
}

function checkinBoxChanged(e) {
    const box = e.target;
    const id  = parseInt(box.dataset.id);
    if (box.checked) pickedCheckoutIds.add(id);
    else             pickedCheckoutIds.delete(id);
    syncSelectAllState();
}

function syncSelectAllState() {
    const allBox = document.getElementById('selectAllCheckins');
    if (!allBox) return;
    const total   = document.querySelectorAll('#checkinTable .checkin-checkbox').length;
    const checked = document.querySelectorAll('#checkinTable .checkin-checkbox:checked').length;
    if (!total)            { allBox.checked = false; allBox.indeterminate = false; }
    else if (checked === total) { allBox.checked = true;  allBox.indeterminate = false; }
    else if (checked > 0)  { allBox.checked = false; allBox.indeterminate = true; }
    else                   { allBox.checked = false; allBox.indeterminate = false; }
}

function wireUpReturnButtons() {
    const btns = document.querySelectorAll('#checkinTable .return-single-btn');
    for (let i = 0; i < btns.length; i++) {
        btns[i].removeEventListener('click', doReturnClick);
        btns[i].addEventListener('click', doReturnClick);
    }
}

function doReturnClick(e) {
    openReturnModal(parseInt(e.currentTarget.dataset.id));
}

function syncPickedCheckouts() {
    pickedCheckoutIds.clear();
    document.querySelectorAll('#checkinTable .checkin-checkbox').forEach(cb => {
        if (cb.checked) pickedCheckoutIds.add(parseInt(cb.dataset.id));
    });
    syncSelectAllState();
}

var updateSelectedCheckouts = syncPickedCheckouts;

function toggleSelectAllCheckins(masterCb) {
    const allBoxes = document.querySelectorAll('#checkinTable .checkin-checkbox');
    for (let i = 0; i < allBoxes.length; i++) {
        allBoxes[i].checked = masterCb.checked;
        const id = parseInt(allBoxes[i].dataset.id);
        if (masterCb.checked) pickedCheckoutIds.add(id);
        else                  pickedCheckoutIds.delete(id);
    }
    syncSelectAllState();
}

async function bulkReturn() {
    if (!pickedCheckoutIds.size) { showNotification('Select at least one checkout.', 'error'); return; }

    const choice = await Swal.fire({
        title: 'Bulk Return',
        text: 'Return ' + pickedCheckoutIds.size + ' tool(s)?',
        input: 'select',
        inputOptions: { 'Good': '👍 Good', 'Poor': '🔧 Damaged', 'Lost': '❌ Lost' },
        inputPlaceholder: 'Select condition',
        showCancelButton: true,
        confirmButtonText: 'Return All'
    });

    if (!choice.value) return;

    Swal.fire({ title: 'Processing...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        const result = await apiRequest('/checkouts/bulk-return', 'POST', {
            checkoutIds: Array.from(pickedCheckoutIds),
            condition: choice.value
        });

        if (result.success) {
            await loadData();
            renderCheckinTable();
            pickedCheckoutIds.clear();
            if (window.app.updateDashboard) window.app.updateDashboard();
            Swal.fire({ title: 'Done!', text: (result.successCount || 0) + ' tool(s) returned.', icon: 'success', timer: 2000, showConfirmButton: false });
        } else {
            Swal.fire({ title: 'Error', text: result.error || 'Bulk return failed', icon: 'error' });
        }
    } catch (err) {
        Swal.fire({ title: 'Error', text: 'Network error. Try again.', icon: 'error' });
    }
}

function openReturnModal(checkoutId) {
    const co = appState.checkouts.find(c => c.id === checkoutId);
    if (!co) { showNotification('Checkout not found.', 'error'); return; }

    const t = appState.tools.find(x => x.id === co.tool_id);

    const idFld  = document.getElementById('returnCheckoutId');
    const nmFld  = document.getElementById('returnToolName');
    const cdFld  = document.getElementById('returnCondition');
    const ntFld  = document.getElementById('returnNote');
    const tdFld  = document.getElementById('totalDamageCheckbox');

    if (idFld) idFld.value       = checkoutId;
    if (nmFld) nmFld.innerHTML   = '<strong>' + escapeHtml(t ? t.name : co.toolName || 'Unknown') + '</strong><br><small>' + escapeHtml(t ? t.internal_id : 'N/A') + '</small>';
    if (cdFld) cdFld.value       = 'Good';
    if (ntFld) ntFld.value       = '';
    if (tdFld) tdFld.checked     = false;

    toggleReturnConditionFields();
    openModal('returnModal');
}

var initReturn = openReturnModal;

function toggleReturnConditionFields() {
    const cdEl = document.getElementById('returnCondition');
    const cond = cdEl ? cdEl.value : 'Good';
    const dnGrp = document.getElementById('damageNoteGroup');
    const tdGrp = document.getElementById('totalDamageGroup');

    if (cond === 'Poor') {
        if (dnGrp) dnGrp.style.display = 'block';
        if (tdGrp) tdGrp.style.display = 'block';
    } else if (cond === 'Lost') {
        if (dnGrp) dnGrp.style.display = 'none';
        if (tdGrp) tdGrp.style.display = 'block';
    } else {
        if (dnGrp) dnGrp.style.display = 'none';
        if (tdGrp) tdGrp.style.display = 'none';
    }
}

var toggleReturnFields = toggleReturnConditionFields;

async function confirmReturn(e) {
    e.preventDefault();

    const checkoutId = parseInt((document.getElementById('returnCheckoutId') && document.getElementById('returnCheckoutId').value) || '0');
    const condition  = (document.getElementById('returnCondition') && document.getElementById('returnCondition').value) || 'Good';
    const note       = (document.getElementById('returnNote') && document.getElementById('returnNote').value) || '';
    const isScrap    = !!(document.getElementById('totalDamageCheckbox') && document.getElementById('totalDamageCheckbox').checked);

    if (!checkoutId) { showNotification('Invalid checkout ID.', 'error'); return; }

    const btn = e.submitter;
    let origTxt = '';
    if (btn) { origTxt = btn.innerHTML; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...'; btn.disabled = true; }

    try {
        const result = await apiRequest('/checkouts/return', 'POST', { checkoutId, condition, note, totalDamage: isScrap });

        if (result.success) {
            await loadData();
            closeModal('returnModal');
            renderCheckinTable();
            pickedCheckoutIds.delete(checkoutId);
            if (window.app.updateDashboard) window.app.updateDashboard();

            let msg = 'Tool returned.';
            if (condition === 'Lost') msg = 'Tool marked as LOST.';
            if (condition === 'Poor') msg = 'Tool sent to maintenance.';
            showNotification(msg, 'success');
        } else {
            showNotification(result.error || 'Return failed', 'error');
        }
    } catch (err) {
        console.error('confirmReturn error:', err);
        showNotification('Error processing return.', 'error');
    } finally {
        if (btn) { btn.innerHTML = origTxt; btn.disabled = false; }
    }
}

function clearCheckinSelections() { pickedCheckoutIds.clear(); renderCheckinTable(); }

// maintenance queue

function renderMaintenance() {
    const tbody = document.querySelector('#maintenanceTable tbody');
    if (!tbody) return;

    let html = '';
    appState.maintenance.filter(m => m.status === 'Open').forEach(item => {
        const t = appState.tools.find(x => x.id == item.tool_id); // == intentional, ids can be strings sometimes
        if (!t) return;
        html += '<tr>' +
            '<td>' + escapeHtml(t.name) + ' (' + escapeHtml(t.internal_id) + ')</td>' +
            '<td>' + escapeHtml(item.issue) + '</td>' +
            '<td>' + item.date_reported + '</td>' +
            '<td><span class="status-badge status-maintenance">' + escapeHtml(item.status) + '</span></td>' +
            '<td><button class="btn btn-primary" data-action="resolveMaintenance" data-maintenance-id="' + item.id + '">Resolve & Release</button></td>' +
        '</tr>';
    });
    tbody.innerHTML = html || '<tr><td colspan="5" style="text-align:center;">No tools in maintenance</td></tr>';
}

async function resolveMaintenance(id) {
    const res = await apiRequest('/maintenance/' + id + '/resolve', 'POST', {});
    if (res.success) {
        await loadData();
        renderMaintenance();
        showNotification('Resolved - tool is available again', 'success');
    } else {
        showNotification('Error: ' + (res.error || 'something went wrong'), 'error');
    }
}

// employee management

function renderEmployees() {
    const tbody = document.querySelector('#employeesTable tbody');
    if (!tbody) return;

    if (!appState.employees || !appState.employees.length) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No employees yet. Add one above.</td></tr>';
        return;
    }

    let html = '';
    [...appState.employees].sort((a, b) => a.name.localeCompare(b.name)).forEach(emp => {
        const loans   = appState.checkouts.filter(c => c.employee_id === emp.id && c.status === 'Active').length;
        const loanCls = loans > 0 ? 'status-in-use' : 'status-available';
        const roleTxt = emp.role ? '<br><small>' + escapeHtml(emp.role) + '</small>' : '';

        html += '<tr>' +
            '<td><strong>' + escapeHtml(emp.badge) + '</strong></td>' +
            '<td>' + escapeHtml(emp.name) + roleTxt + '</td>' +
            '<td>' + escapeHtml(emp.department) + '</td>' +
            '<td><span class="status-badge ' + loanCls + '">' + loans + '</span></td>' +
            '<td>' +
                '<button class="btn action-btn edit-btn" data-action="editEmployee" data-id="' + emp.id + '" title="Edit"><i class="fas fa-edit"></i></button>' +
                '<button class="btn action-btn delete-btn" data-action="deleteEmployee" data-id="' + emp.id + '" title="Delete"><i class="fas fa-trash"></i></button>' +
                '<button class="btn action-btn reset-btn" data-action="resetEmployeePassword" data-id="' + emp.id + '" title="Reset Password"><i class="fas fa-key"></i></button>' +
            '</td>' +
        '</tr>';
    });

    tbody.innerHTML = html;
}

async function saveEmployee(e) {
    e.preventDefault();

    const existingId = (document.getElementById('employeeId') && document.getElementById('employeeId').value) || '';
    const isNew = !existingId;

    const payload = {
        id:    existingId ? parseInt(existingId) : null,
        badge: (document.getElementById('employeeBadge') && document.getElementById('employeeBadge').value) || '',
        name:  (document.getElementById('employeeName')  && document.getElementById('employeeName').value)  || '',
        dept:  (document.getElementById('employeeDept')  && document.getElementById('employeeDept').value)  || '',
        role:  (document.getElementById('employeeRole')  && document.getElementById('employeeRole').value)  || 'Technician',
        email: (document.getElementById('employeeEmail') && document.getElementById('employeeEmail').value) || '',
        phone: (document.getElementById('employeePhone') && document.getElementById('employeePhone').value) || ''
    };

    if (!payload.badge.trim()) { showNotification('Badge number is required', 'error'); return; }
    if (!payload.name.trim())  { showNotification('Name is required', 'error'); return; }
    if (!payload.dept)         { showNotification('Please select a department', 'error'); return; }

    const btn = e.submitter;
    let origTxt = '';
    if (btn) { origTxt = btn.innerHTML; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...'; btn.disabled = true; }

    try {
        const outcome = await saveEmployeeToServer(payload, existingId);
        if (outcome.success) {
            await loadData();
            renderEmployees();
            closeModal('employeeModal');
            if (isNew) {
                Swal.fire({
                    title: 'Employee Added',
                    html: '<strong>' + escapeHtml(payload.name) + '</strong> added.<br><br>' +
                          '<div style="background:#f3f4f6;padding:12px;border-radius:8px;margin:10px 0;">' +
                          '<strong>Initial Password:</strong><br>' +
                          '<code style="font-size:20px;">' + escapeHtml(outcome.badge) + '</code></div>' +
                          'Give this to the employee.',
                    icon: 'success', confirmButtonText: 'Got it'
                });
            } else {
                showNotification(payload.name + ' updated', 'success');
            }
        } else {
            showNotification(outcome.error || 'Failed to save', 'error');
        }
    } catch (err) {
        console.error('saveEmployee ui error:', err);
        showNotification('Something went wrong.', 'error');
    } finally {
        if (btn) { btn.innerHTML = origTxt; btn.disabled = false; }
    }
}

function editEmployee(empId) {
    const emp = appState.employees.find(e => e.id === empId);
    if (!emp) { showNotification('Employee not found', 'error'); return; }

    // populate the dept dropdown before setting the value
    populateModalSelects();

    document.getElementById('employeeId').value    = emp.id || '';
    document.getElementById('employeeName').value  = emp.name || '';
    document.getElementById('employeeBadge').value = emp.badge || '';
    document.getElementById('employeeDept').value  = emp.department || '';
    document.getElementById('employeeRole').value  = emp.role || 'Technician';
    document.getElementById('employeeEmail').value = emp.email || '';
    document.getElementById('employeePhone').value = emp.phone || '';
    openModal('employeeModal');
}

async function deleteEmployee(empId) {
    const emp = appState.employees.find(e => e.id === empId);
    if (!emp) { showNotification('Employee not found', 'error'); return; }

    const hasLoans = appState.checkouts.some(c => c.employee_id === empId && c.status === 'Active');
    if (hasLoans) { showNotification('Cannot delete ' + emp.name + ': has active loans.', 'error'); return; }

    const ok = await Swal.fire({
        title: 'Delete Employee?',
        html: 'Delete <strong>' + escapeHtml(emp.name) + '</strong>? Cannot be undone.',
        icon: 'warning', showCancelButton: true,
        confirmButtonText: 'Yes, delete', confirmButtonColor: '#ef4444'
    });

    if (!ok.isConfirmed) return;

    Swal.fire({ title: 'Deleting...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    const done = await deleteEmployeeFromServer(empId);
    if (done) {
        await loadData();
        renderEmployees();
        Swal.fire({ title: 'Deleted!', text: emp.name + ' removed.', icon: 'success', timer: 2000, showConfirmButton: false });
    } else {
        Swal.fire({ title: 'Error', text: 'Failed to delete.', icon: 'error' });
    }
}

async function resetEmployeePassword(empId) {
    const emp = appState.employees.find(e => e.id === empId);
    if (!emp) { showNotification('Employee not found', 'error'); return; }

    const ok = await Swal.fire({
        title: 'Reset Password',
        html: 'Reset password for <strong>' + escapeHtml(emp.name) + '</strong>?',
        icon: 'question', showCancelButton: true,
        confirmButtonText: 'Yes, reset', confirmButtonColor: '#f59e0b'
    });

    if (!ok.isConfirmed) return;

    Swal.fire({ title: 'Resetting...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        const result = await resetEmployeePasswordOnServer(empId);
        if (result.success) {
            try { await navigator.clipboard.writeText(result.newPassword); } catch(e) {}
            Swal.fire({
                title: 'Password Reset',
                html: 'New password for <strong>' + escapeHtml(emp.name) + '</strong>:<br><br>' +
                      '<code style="font-size:24px;padding:10px 20px;background:#f3f4f6;border-radius:8px;">' + escapeHtml(result.newPassword) + '</code>',
                icon: 'success', confirmButtonText: 'Done'
            });
        } else {
            Swal.fire({ title: 'Error', text: result.error || 'Reset failed', icon: 'error' });
        }
    } catch(err) {
        Swal.fire({ title: 'Error', text: 'Network error.', icon: 'error' });
    }
}

// audit log

var currentSortOrder = 'desc';

// tried toLocaleString() but it gives different formats per browser
// doing it manually so its consistent everywhere
function prettyTimestamp(ts) {
    if (!ts) return '?';
    const d = new Date(ts);
    if (isNaN(d.getTime())) return ts;
    const p = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth()+1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
}

function renderAuditLog() {
    const box = document.getElementById('auditLogContainer');
    if (!box) return;

    const logs = [...appState.activityLog].sort((a, b) => {
        const diff = new Date(a.timestamp) - new Date(b.timestamp);
        return currentSortOrder === 'asc' ? diff : -diff;
    });

    if (!logs.length) { box.innerHTML = '<div class="audit-empty">No audit entries yet</div>'; return; }

    box.innerHTML = logs.map(log =>
        '<div class="audit-entry">' +
            '<div class="audit-time">' + escapeHtml(prettyTimestamp(log.timestamp)) + '</div>' +
            '<div class="audit-action">' + escapeHtml(log.action) + '</div>' +
        '</div>'
    ).join('');
}

function sortAuditLog(dir) {
    currentSortOrder = dir === 'asc' ? 'asc' : 'desc';
    renderAuditLog();
}

// settings page - reads from appState.settings

function loadSettingsIntoUI() {
    const s = appState.settings;
    if (!s) return;

    // not using helpers here anymore, just doing it directly
    // was using setCheck/setVal but kept having issues with undefined ids

    // -- toolkeeper permissions --
    if (s.permissions && s.permissions.toolkeeper) {
        const tk = s.permissions.toolkeeper;
        const tkAdd  = document.getElementById('tkCanAdd');    if (tkAdd)  tkAdd.checked  = !!tk.add;
        const tkEdit = document.getElementById('tkCanEdit');   if (tkEdit) tkEdit.checked = !!tk.edit;
        const tkDel  = document.getElementById('tkCanDelete'); if (tkDel)  tkDel.checked  = !!tk.delete;
        const tkMnt  = document.getElementById('tkCanMaint');  if (tkMnt)  tkMnt.checked  = !!tk.maint;
        const tkExp  = document.getElementById('tkCanExport'); if (tkExp)  tkExp.checked  = !!tk.export;
    }

    if (s.permissions && s.permissions.technician) {
        const tech = s.permissions.technician;
        const tCo  = document.getElementById('techCanCheckout'); if (tCo)  tCo.checked  = !!tech.checkout;
        const tCi  = document.getElementById('techCanCheckin');  if (tCi)  tCi.checked  = !!tech.checkin;
        const tRep = document.getElementById('techCanReport');   if (tRep) tRep.checked = !!tech.report;
        const tVw  = document.getElementById('techCanView');     if (tVw)  tVw.checked  = !!tech.view;
        // techCanRequest - forgot to add this the first time around
        const tReq = document.getElementById('techCanRequest'); if (tReq) tReq.checked = !!tech.request;
    }

    // -- workflows --
    const wf = s.workflows || {};
    const hvA = document.getElementById('needsHighValueApproval'); if (hvA) hvA.checked = !!wf.requireHighValueApproval;
    const hvC = document.getElementById('highValueCutoff');        if (hvC) hvC.value   = wf.highValueThreshold != null ? wf.highValueThreshold : 1000;
    const otA = document.getElementById('needsOvertimeApproval'); if (otA) otA.checked  = !!wf.requireOvertimeApproval;
    const mA  = document.getElementById('needsMaintApproval');    if (mA)  mA.checked   = !!wf.requireMaintApproval;
    const mxT = document.getElementById('maxToolsAtOnce');         if (mxT) mxT.value   = wf.maxToolsPerCheckout != null ? wf.maxToolsPerCheckout : 10;
    const mxD = document.getElementById('maxDaysOut');             if (mxD) mxD.value   = wf.maxCheckoutDays != null ? wf.maxCheckoutDays : 14;
    const wkn = document.getElementById('allowWeekends');          if (wkn) wkn.checked = wf.allowWeekendCheckout !== false;

    // -- tool add permissions --
    const tc = s.toolControls || {};
    const radioEl = document.querySelector('input[name="toolAddPermission"][value="' + (tc.addPermission || 'both') + '"]');
    if (radioEl) radioEl.checked = true;
    const nTA = document.getElementById('needsToolApproval'); if (nTA) nTA.checked = !!tc.requireApproval;
    toggleApprovalSettingsUI();

    renderDepartments();
    renderCategories();

    // -- alerts --
    const al = s.alerts || {};
    const lsOn = document.getElementById('lowStockAlertsOn'); if (lsOn) lsOn.checked = !!(al.lowStock && al.lowStock.enabled);
    const lsMin = document.getElementById('lowStockMin');     if (lsMin) lsMin.value  = (al.lowStock && al.lowStock.threshold != null) ? al.lowStock.threshold : 5;
    const lmOn = document.getElementById('longMaintAlertOn'); if (lmOn) lmOn.checked  = !!(al.maintenance && al.maintenance.enabled);
    const pmOn = document.getElementById('preventiveMaintOn'); if (pmOn) pmOn.checked = !!(al.maintenance && al.maintenance.preventive);
    const mLd  = document.getElementById('maintLeadDays');    if (mLd)  mLd.value     = (al.maintenance && al.maintenance.reminderDays != null) ? al.maintenance.reminderDays : 7;
    const exOn = document.getElementById('expiryTrackingOn'); if (exOn) exOn.checked  = !!(al.expiration && al.expiration.enabled);
    const exD  = document.getElementById('expiryWarningDays'); if (exD) exD.value     = (al.expiration && al.expiration.alertDays != null) ? al.expiration.alertDays : 30;

    // -- notifications --
    const notif = s.notifications || {};
    const nm = notif.methods || {};
    const nEm = document.getElementById('notifyByEmail');    if (nEm)  nEm.checked  = !!nm.email;
    const nEA = document.getElementById('notifEmailAddr');   if (nEA)  nEA.value    = notif.email || '';
    const nSm = document.getElementById('notifyBySMS');      if (nSm)  nSm.checked  = !!nm.sms;
    const nPh = document.getElementById('notifPhoneNum');    if (nPh)  nPh.value    = notif.phone || '';
    const nDs = document.getElementById('notifyOnDashboard');if (nDs)  nDs.checked  = nm.dashboard !== false;
    const ne  = notif.events || {};
    const aCo = document.getElementById('alertOnCheckout'); if (aCo) aCo.checked  = !!ne.checkout;
    const aOv = document.getElementById('alertOnOverdue');  if (aOv) aOv.checked  = ne.overdue !== false;
    const aMn = document.getElementById('alertOnMaint');    if (aMn) aMn.checked  = ne.maint !== false;
    // alertOnNewTool - added late, almost missed it
    const aNT = document.getElementById('alertOnNewTool');  if (aNT) aNT.checked  = !!ne.newTool;

    // -- backup --
    const bk = s.backup || {};
    const bkOn  = document.getElementById('autoBackupOn');    if (bkOn)  bkOn.checked = !!bk.autoBackup;
    const bkFq  = document.getElementById('backupFreqSelect');if (bkFq)  bkFq.value   = bk.frequency || 'weekly';
    const bkKp  = document.getElementById('backupKeepDays'); if (bkKp)  bkKp.value   = bk.retention != null ? bk.retention : 30;
    drawBackupList(bk.backups || []);
}

function renderDepartments() {
    const el = document.getElementById('departmentList');
    if (!el) return;
    const depts = appState.settings.departments || ['Mechanical', 'Avionics', 'Electrical', 'Ground Support'];
    let html = '';
    for (let i = 0; i < depts.length; i++) {
        html += '<div class="permission-item"><label>' + escapeHtml(depts[i]) + '</label>' +
                '<button class="btn btn-danger btn-sm" data-action="removeDepartment" data-department="' + escapeHtml(depts[i]) + '"><i class="fas fa-times"></i></button></div>';
    }
    el.innerHTML = html || '<p class="text-muted">No departments.</p>';
}

function renderCategories() {
    const el = document.getElementById('categoryList');
    if (!el) return;
    const cats = appState.settings.categories || ['Hand Tools', 'Power Tools', 'Measuring Tools', 'Safety Equipment', 'Testing Equipment'];
    let html = '';
    for (let i = 0; i < cats.length; i++) {
        html += '<div class="permission-item"><label>' + escapeHtml(cats[i]) + '</label>' +
                '<button class="btn btn-danger btn-sm" data-action="removeCategory" data-category="' + escapeHtml(cats[i]) + '"><i class="fas fa-times"></i></button></div>';
    }
    el.innerHTML = html || '<p class="text-muted">No categories.</p>';
}

function drawBackupList(entries) {
    const el = document.getElementById('backupList');
    if (!el) return;
    if (!entries || !entries.length) { el.innerHTML = '<p class="text-muted">No backups yet.</p>'; return; }
    let html = '';
    for (let i = 0; i < entries.length; i++) {
        const b = entries[i];
        html += '<div class="backup-item">' +
            '<div class="backup-info"><strong>Backup ' + escapeHtml(b.date) + '</strong>' +
            '<small>Size: ' + escapeHtml(b.size) + ' • By ' + escapeHtml(b.createdBy) + '</small></div>' +
            '<div>' +
            '<button class="btn btn-secondary" data-action="downloadBackup" data-backup-date="' + escapeHtml(b.date) + '"><i class="fas fa-download"></i></button>' +
            '<button class="btn btn-danger" data-action="deleteBackup" data-backup-date="' + escapeHtml(b.date) + '"><i class="fas fa-trash"></i></button>' +
            '</div></div>';
    }
    el.innerHTML = html;
}

var renderBackups = drawBackupList;

function toggleApprovalSettingsUI() {
    const cb  = document.getElementById('needsToolApproval');
    const blk = document.getElementById('approvalSettings');
    if (blk) blk.style.display = (cb && cb.checked) ? 'block' : 'none';
}

// NOTE: if you add a new UI field, add it here too - burned myself with techCanRequest
async function saveRolePermissions() {
    const checked = id => { const el = document.getElementById(id); return el ? el.checked : false; };
    const strVal  = (id, def) => { const el = document.getElementById(id); return el ? el.value : (def || ''); };
    const numVal  = (id, def) => { const el = document.getElementById(id); const n = el ? parseInt(el.value) : NaN; return isNaN(n) ? def : n; };
    const radio   = document.querySelector('input[name="toolAddPermission"]:checked');

    const payload = {
        permissions: {
            toolkeeper: {
                add: checked('tkCanAdd'), edit: checked('tkCanEdit'),
                delete: checked('tkCanDelete'), maint: checked('tkCanMaint'),
                export: checked('tkCanExport')
            },
            technician: {
                checkout: checked('techCanCheckout'), checkin: checked('techCanCheckin'),
                report: checked('techCanReport'), view: checked('techCanView'),
                request: checked('techCanRequest')
            }
        },
        workflows: {
            requireHighValueApproval: checked('needsHighValueApproval'),
            highValueThreshold: parseFloat(strVal('highValueCutoff', 1000)),
            requireOvertimeApproval: checked('needsOvertimeApproval'),
            requireMaintApproval: checked('needsMaintApproval'),
            maxToolsPerCheckout: numVal('maxToolsAtOnce', 10),
            maxCheckoutDays: numVal('maxDaysOut', 14),
            allowWeekendCheckout: checked('allowWeekends')
        },
        toolControls: {
            addPermission: radio ? radio.value : 'both',
            requireApproval: checked('needsToolApproval')
        },
        departments: appState.settings.departments || [],
        categories:  appState.settings.categories  || [],
        alerts: {
            lowStock:    { enabled: checked('lowStockAlertsOn'), threshold: numVal('lowStockMin', 5) },
            maintenance: { enabled: checked('longMaintAlertOn'), preventive: checked('preventiveMaintOn'), reminderDays: numVal('maintLeadDays', 7) },
            expiration:  { enabled: checked('expiryTrackingOn'), alertDays: numVal('expiryWarningDays', 30) }
        },
        notifications: {
            methods: { email: checked('notifyByEmail'), sms: checked('notifyBySMS'), dashboard: checked('notifyOnDashboard') },
            email:   strVal('notifEmailAddr', ''),
            phone:   strVal('notifPhoneNum', ''),
            events:  { checkout: checked('alertOnCheckout'), overdue: checked('alertOnOverdue'), maint: checked('alertOnMaint'), newTool: checked('alertOnNewTool') }
        },
        backup: {
            autoBackup: checked('autoBackupOn'),
            frequency:  strVal('backupFreqSelect', 'weekly'),
            retention:  numVal('backupKeepDays', 30),
            backups: (appState.settings.backup && appState.settings.backup.backups) || []
        }
    };

    try {
        const result = await apiRequest('/settings', 'POST', { settings: payload });
        if (result.success) {
            showNotification('Settings saved', 'success');
            await loadData();
        } else {
            showNotification('Error: ' + (result.error || 'Could not save'), 'error');
        }
    } catch(err) {
        showNotification('Network error - not saved', 'error');
    }
}

// auth stuff

async function logout() {
    try {
        // tell the server (for activity log)
        await apiRequest('/auth/logout', 'POST', {});
    } catch(e) {
        // dont block logout if request fails
    }
    localStorage.removeItem('toolroom_token');
    window.location.href = 'login.html';
}

async function changePassword(e) {
    e.preventDefault();
    const cur  = document.getElementById('currentPassword').value;
    const nw   = document.getElementById('newPassword').value;
    const conf = document.getElementById('confirmPassword').value;

    if (nw !== conf) { showNotification('Passwords do not match', 'error'); return; }

    try {
        const result = await apiRequest('/auth/change-password', 'POST', { current: cur, newPassword: nw });
        if (result.success) {
            showNotification('Password changed', 'success');
            closeModal('changePasswordModal');
        } else {
            showNotification('Error: ' + (result.error || 'Failed'), 'error');
        }
    } catch(err) {
        showNotification('Error changing password', 'error');
    }
}

// departments

function addDepartment() {
    var nameEl = document.getElementById('newDeptName');
    var name = nameEl ? nameEl.value.trim() : '';

    if (!name) {
        showNotification('Enter a department name first', 'error');
        return;
    }

    if (!appState.settings.departments) appState.settings.departments = [];

    // check for duplicate
    var exists = appState.settings.departments.some(function(d) {
        return d.toLowerCase() === name.toLowerCase();
    });
    if (exists) {
        showNotification(name + ' already exists', 'error');
        return;
    }

    appState.settings.departments.push(name);
    if (nameEl) nameEl.value = '';

    renderDepartments();
    populateModalSelects();

    // save to server straight away
    saveRolePermissions().then(function() {
        showNotification('Department added', 'success');
    });
}

function removeDepartment(name) {
    if (!name || !appState.settings.departments) return;

    // check if any tools use this dept before removing
    var inUse = appState.tools.some(function(t) { return t.dept === name; });
    if (inUse) {
        showNotification('Cannot remove "' + name + '" - tools are assigned to it', 'error');
        return;
    }

    appState.settings.departments = appState.settings.departments.filter(function(d) {
        return d !== name;
    });

    renderDepartments();
    populateModalSelects();

    saveRolePermissions().then(function() {
        showNotification('Department removed', 'success');
    });
}

// categories

function addCategory() {
    var nameEl = document.getElementById('newCategoryName');
    var name = nameEl ? nameEl.value.trim() : '';

    if (!name) {
        showNotification('Enter a category name first', 'error');
        return;
    }

    if (!appState.settings.categories) appState.settings.categories = [];

    var exists = appState.settings.categories.some(function(c) {
        return c.toLowerCase() === name.toLowerCase();
    });
    if (exists) {
        showNotification(name + ' already exists', 'error');
        return;
    }

    appState.settings.categories.push(name);
    if (nameEl) nameEl.value = '';

    renderCategories();
    populateModalSelects();

    saveRolePermissions().then(function() {
        showNotification('Category added', 'success');
    });
}

function removeCategory(name) {
    if (!name || !appState.settings.categories) return;

    appState.settings.categories = appState.settings.categories.filter(function(c) {
        return c !== name;
    });

    renderCategories();
    populateModalSelects();

    saveRolePermissions().then(function() {
        showNotification('Category removed', 'success');
    });
}

// backup stuff

async function createBackup() {
    var btn = document.querySelector('[data-action="createBackup"]');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Backing up...'; }

    try {
        // build a snapshot of all current data
        var snapshot = {
            date:      new Date().toISOString().split('T')[0],
            time:      new Date().toTimeString().split(' ')[0],
            createdBy: appState.loggedInUser.name || 'Admin',
            tools:     appState.tools.length,
            employees: appState.employees.length,
            data: {
                tools:       appState.tools,
                employees:   appState.employees,
                checkouts:   appState.checkouts,
                maintenance: appState.maintenance,
                settings:    appState.settings
            }
        };

        // download as JSON file
        var blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
        var url  = URL.createObjectURL(blob);
        var a    = document.createElement('a');
        a.href     = url;
        a.download = 'toolroom-backup-' + snapshot.date + '.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        // record it in settings
        if (!appState.settings.backup) appState.settings.backup = {};
        if (!appState.settings.backup.backups) appState.settings.backup.backups = [];

        appState.settings.backup.backups.unshift({
            date:      snapshot.date + ' ' + snapshot.time,
            size:      (blob.size / 1024).toFixed(1) + ' KB',
            createdBy: snapshot.createdBy
        });

        // keep only the last 10
        if (appState.settings.backup.backups.length > 10) {
            appState.settings.backup.backups = appState.settings.backup.backups.slice(0, 10);
        }

        drawBackupList(appState.settings.backup.backups);
        await saveRolePermissions();
        showNotification('Backup downloaded successfully', 'success');

    } catch (err) {
        console.error('createBackup error:', err);
        showNotification('Backup failed: ' + err.message, 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> Backup Now'; }
    }
}

function restoreBackup() {
    // create a hidden file input for the json file
    var fi = document.createElement('input');
    fi.type   = 'file';
    fi.accept = '.json';
    fi.style.display = 'none';
    document.body.appendChild(fi);

    fi.addEventListener('change', async function() {
        var file = fi.files[0];
        if (!file) return;

        var confirmed = await Swal.fire({
            title: 'Restore Backup?',
            html: 'This will reload the page after importing <strong>' + escapeHtml(file.name) + '</strong>.<br><br>Current data is not deleted - the backup file is loaded for viewing only.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Yes, restore',
            confirmButtonColor: '#ef4444'
        });
        if (!confirmed.isConfirmed) { document.body.removeChild(fi); return; }

        var reader = new FileReader();
        reader.onload = function(e) {
            try {
                var snap = JSON.parse(e.target.result);
                if (!snap.data) throw new Error('Invalid backup file format');

                // load the snapshot into appState
                appState.tools       = snap.data.tools       || [];
                appState.employees   = snap.data.employees   || [];
                appState.checkouts   = snap.data.checkouts   || [];
                appState.maintenance = snap.data.maintenance || [];
                appState.settings    = snap.data.settings    || {};

                // re-render everything
                refreshDashboardCounts();
                loadSettingsIntoUI();

                Swal.fire({
                    title: 'Backup Loaded',
                    html: 'Data from <strong>' + escapeHtml(snap.date) + '</strong> loaded into view.<br><small>Note: this only affects your current session. To permanently restore, contact the DB admin.</small>',
                    icon: 'success'
                });
            } catch (err) {
                Swal.fire({ title: 'Error', text: 'Could not read backup: ' + err.message, icon: 'error' });
            }
        };
        reader.readAsText(file);
        document.body.removeChild(fi);
    });

    fi.click();
}

function downloadBackup(dateStr) {
    // re-export current data as a fresh backup download
    // dateStr is just for the filename label
    var snapshot = {
        date:      dateStr || new Date().toISOString().split('T')[0],
        createdBy: appState.loggedInUser.name || 'Admin',
        data: {
            tools:       appState.tools,
            employees:   appState.employees,
            checkouts:   appState.checkouts,
            maintenance: appState.maintenance,
            settings:    appState.settings
        }
    };
    var blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement('a');
    a.href     = url;
    a.download = 'toolroom-backup-' + (dateStr || 'export').replace(/[: ]/g, '-') + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showNotification('Backup downloaded', 'success');
}

async function deleteBackup(dateStr) {
    var confirmed = await Swal.fire({
        title: 'Delete Backup Record?',
        text: 'Remove the record for ' + dateStr + '?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Yes, delete',
        confirmButtonColor: '#ef4444'
    });
    if (!confirmed.isConfirmed) return;

    if (appState.settings.backup && appState.settings.backup.backups) {
        appState.settings.backup.backups = appState.settings.backup.backups.filter(function(b) {
            return b.date !== dateStr;
        });
        drawBackupList(appState.settings.backup.backups);
        await saveRolePermissions();
        showNotification('Backup record removed', 'success');
    }
}

// data management / danger zone

async function archiveOldData() {
    var confirmed = await Swal.fire({
        title: 'Archive Old Data',
        html: 'This will export all <strong>Returned</strong> checkouts and <strong>Resolved</strong> maintenance records older than 90 days to a file, then remove them from the active view.<br><br>No data is deleted from the database.',
        icon: 'info',
        showCancelButton: true,
        confirmButtonText: 'Archive & Export',
        confirmButtonColor: '#f59e0b'
    });
    if (!confirmed.isConfirmed) return;

    var cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);

    var oldCheckouts = appState.checkouts.filter(function(c) {
        return c.status === 'Returned' && c.return_date && new Date(c.return_date) < cutoff;
    });
    var oldMaintenance = appState.maintenance.filter(function(m) {
        return m.status === 'Resolved' && m.date_resolved && new Date(m.date_resolved) < cutoff;
    });

    if (oldCheckouts.length === 0 && oldMaintenance.length === 0) {
        showNotification('No records older than 90 days to archive', 'info');
        return;
    }

    var archive = {
        exportedAt: new Date().toISOString(),
        checkouts:  oldCheckouts,
        maintenance: oldMaintenance
    };

    var blob = new Blob([JSON.stringify(archive, null, 2)], { type: 'application/json' });
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement('a');
    a.href     = url;
    a.download = 'toolroom-archive-' + new Date().toISOString().split('T')[0] + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showNotification(oldCheckouts.length + ' checkouts and ' + oldMaintenance.length + ' maintenance records archived', 'success');
}

function exportAllData() {
    var all = {
        exportedAt:  new Date().toISOString(),
        exportedBy:  appState.loggedInUser.name || 'Admin',
        tools:       appState.tools,
        employees:   appState.employees,
        checkouts:   appState.checkouts,
        maintenance: appState.maintenance,
        activityLog: appState.activityLog,
        settings:    appState.settings
    };

    var blob = new Blob([JSON.stringify(all, null, 2)], { type: 'application/json' });
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement('a');
    a.href     = url;
    a.download = 'toolroom-full-export-' + new Date().toISOString().split('T')[0] + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showNotification('Full data export downloaded', 'success');
}

async function resetData() {
    // two-step confirmation - this is destructive
    var step1 = await Swal.fire({
        title: 'Reset All Data?',
        html: '<strong style="color:#ef4444;">This will permanently delete all tools, checkouts, employees and logs from the database.</strong><br><br>This cannot be undone. Make a backup first.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'I understand, continue',
        confirmButtonColor: '#ef4444',
        cancelButtonText: 'Cancel'
    });
    if (!step1.isConfirmed) return;

    var step2 = await Swal.fire({
        title: 'Are you absolutely sure?',
        input: 'text',
        inputLabel: 'Type RESET to confirm',
        inputPlaceholder: 'RESET',
        showCancelButton: true,
        confirmButtonText: 'Delete everything',
        confirmButtonColor: '#ef4444',
        preConfirm: function(val) {
            if (val !== 'RESET') {
                Swal.showValidationMessage('You must type RESET exactly');
            }
            return val;
        }
    });
    if (!step2.isConfirmed || step2.value !== 'RESET') return;

    Swal.fire({ title: 'Resetting...', allowOutsideClick: false, didOpen: function() { Swal.showLoading(); } });

    try {
        var result = await apiRequest('/settings/reset-data', 'POST', {});
        if (result.success) {
            await loadData();
            Swal.fire({ title: 'Done', text: 'System has been reset.', icon: 'success' });
        } else {
            Swal.fire({ title: 'Error', text: result.error || 'Reset failed', icon: 'error' });
        }
    } catch (err) {
        Swal.fire({ title: 'Error', text: 'Network error: ' + err.message, icon: 'error' });
    }
}
