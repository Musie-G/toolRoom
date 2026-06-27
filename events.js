// events.js
// app init, window.app surface, and all the event listeners
// event wiring + app init
// split out from ui.js when that file got too big
// then got big enough to deserve its own file

var isDebugOn = true;
if (isDebugOn) console.log('events.js loaded');

// init

window.app = {};

window.app.init = async function() {
    try {
        // check JWT token first
        var token = localStorage.getItem('toolroom_token');
        if (!token) {
            window.location.href = 'login.html';
            return;
        }

        // verify token is still valid + get current user
        var userResp = await fetch('/api/auth/me', {
            headers: {
                'Authorization':    'Bearer ' + token,
                'X-Requested-With': 'XMLHttpRequest'
            }
        });

        if (!userResp.ok) {
            localStorage.removeItem('toolroom_token');
            window.location.href = 'login.html';
            return;
        }

        var user = await userResp.json();
        appState.loggedInUser = user;

        // load all data, then set up the UI
        await loadData();

        applyPermissions(user.role);
        navigate('dashboard');
        populateEmployeeDropdown();
        showCurrentUserInSidebar(user);

        // settings page reads from appState.settings so needs data loaded first
        loadSettingsIntoUI();

        document.body.classList.remove('js-loading');

        // handle sidebar collapse/expand on resize
        // 768px is the mobile breakpoint in style.css
        window.addEventListener('resize', function() {
            var sb = document.getElementById('sidebar');
            var mc = document.getElementById('mainContent');
            if (!sb || !mc) return;
            if (window.innerWidth <= 768) {
                mc.classList.remove('collapsed-margin');
                sb.classList.remove('active');
            } else if (sb.classList.contains('collapsed')) {
                mc.classList.add('collapsed-margin');
            }
        });

        console.log('init complete -', user.name, '/', user.role);

    } catch (err) {
        console.error('init error:', err);
        window.location.href = 'login.html';
    }
};

// window.app - built this up over time
// grew this incrementally so the grouping is a bit loose

// core stuff
window.app.loadData = loadData;
window.app.state = appState;
window.app.updateDashboard = refreshDashboardCounts;
window.app.nav = navigate;
window.app.toggleSidebar = toggleSidebar;
window.app.toggleTheme = toggleTheme;

// notifications + modals
window.app.showNotification = showNotification;
window.app.notify = notify;
window.app.openModal = openModal;
window.app.closeModal = closeModal;
window.app.exportToExcel = exportToExcel;

// tools
window.app.renderTools = renderTools;
window.app.openAddToolModal = openAddToolModal;
window.app.populateModalSelects = populateModalSelects;
window.app.editTool = editTool;
window.app.deleteTool = deleteTool;
window.app.saveTool = saveTool;
window.app.uploadExcel = uploadExcel;
window.app.downloadTemplate = downloadTemplate;

// checkout page
window.app.renderCheckoutTable = renderCheckoutTable;
window.app.handleCheckout = handleCheckout;
window.app.toggleSelect = toggleToolSelection;
window.app.selectedTools = pickedToolIds;
window.app.clearCheckoutSelections = clearCheckoutSelections;
window.app.renderEmployeeSelect = populateEmployeeDropdown;
window.app.updateCheckoutSummary = refreshCheckoutSummary;

// checkin / returns
window.app.renderCheckinTable = renderCheckinTable;
window.app.bulkReturn = bulkReturn;
window.app.initReturn = openReturnModal;
window.app.confirmReturn = confirmReturn;
window.app.clearCheckinSelections = clearCheckinSelections;
window.app.selectedCheckouts = pickedCheckoutIds;
window.app.toggleSelectAllCheckins = toggleSelectAllCheckins;
window.app.updateSelectedCheckouts = syncPickedCheckouts;
window.app.toggleReturnFields = toggleReturnConditionFields;

// maintenance
window.app.renderMaintenance = renderMaintenance;
window.app.resolveMaintenance = resolveMaintenance;

// employees
window.app.renderEmployees = renderEmployees;
window.app.editEmployee = editEmployee;
window.app.deleteEmployee = deleteEmployee;
window.app.saveEmployee = saveEmployee;
window.app.resetEmployeePassword = resetEmployeePassword;
window.app.logout = logout;
window.app.changePassword = changePassword;

// audit
window.app.renderAuditLog = renderAuditLog;
window.app.sortAuditLog = sortAuditLog;

// settings - added these in chunks as each section was built
window.app.loadSettingsIntoUI = loadSettingsIntoUI;
window.app.saveRolePermissions = saveRolePermissions;
window.app.renderDepartments = renderDepartments;
window.app.renderCategories = renderCategories;
window.app.addDepartment = addDepartment;
window.app.removeDepartment = removeDepartment;
window.app.addCategory = addCategory;
window.app.removeCategory = removeCategory;
window.app.toggleApprovalSettings = toggleApprovalSettingsUI;
window.app.renderBackups = drawBackupList;

// backup / data management
window.app.createBackup = createBackup;
window.app.restoreBackup = restoreBackup;
window.app.downloadBackup = downloadBackup;
window.app.deleteBackup = deleteBackup;
window.app.archiveOldData = archiveOldData;
window.app.exportAllData = exportAllData;
window.app.resetData = resetData;

window.app.isDebugOn = isDebugOn;

// event wiring
// using delegation so we dont have to reattach after table re-renders

document.addEventListener('change', function(e) {
    var t = e.target;

    // tool checkboxes in the checkout table
    if (t.classList && t.classList.contains('tool-select')) {
        var tid = parseInt(t.dataset.id);
        if (t.checked) pickedToolIds.add(tid);
        else pickedToolIds.delete(tid);
        refreshCheckoutSummary();
        return;
    }

    // checkboxes in the checkin table
    if (t.classList && t.classList.contains('checkin-checkbox')) {
        var cid = parseInt(t.dataset.id);
        if (t.checked) pickedCheckoutIds.add(cid);
        else pickedCheckoutIds.delete(cid);
        return;
    }

    // return condition dropdown - show/hide damage fields
    if (t.id === 'returnCondition') {
        toggleReturnConditionFields();
        return;
    }

    // fallback for anything using data-action on a change event
    var actionEl = t.closest('[data-action]');
    if (!actionEl) return;
    var act = actionEl.dataset.action;
    if (act === 'selectAllCheckins') toggleSelectAllCheckins(actionEl);
    else if (act === 'updateSelectedCheckouts') syncPickedCheckouts();
    else if (act === 'toggleSelect') toggleToolSelection(parseInt(actionEl.dataset.toolId), actionEl);
    else if (act === 'filterCheckin') renderCheckinTable();
});

document.addEventListener('click', function(e) {
    // checkboxes handled by the change listener above
    if (e.target.type === 'checkbox') return;

    var el = e.target.closest('[data-action]');
    if (el) {
        var action = el.dataset.action;

        // pull out all the possible data attrs up front
        var modalName  = el.dataset.modal;
        var navTarget  = el.dataset.nav;
        var tableId    = el.dataset.table;
        var fileName   = el.dataset.filename;
        var sortOrder  = el.dataset.order;
        var dept       = el.dataset.department;
        var cat        = el.dataset.category;
        var backupDate = el.dataset.backupDate;

        // numeric id - could be in any of these attrs depending on which button it is
        var rawId = el.dataset.id || el.dataset.toolId || el.dataset.employeeId
                    || el.dataset.maintenanceId || el.dataset.checkoutId;
        var numId = rawId ? parseInt(rawId) : null;
        var coId  = el.dataset.checkoutId ? parseInt(el.dataset.checkoutId) : null;

        // grew this as i needed it - dont judge the length
        if (action === 'nav') {
            e.preventDefault();
            navigate(navTarget);

        } else if (action === 'logout') {
            e.preventDefault();
            logout();

        } else if (action === 'openModal') {
            e.preventDefault();
            // populate dept/category dropdowns before opening
            // - toolModal needs toolDept + toolCategory
            // - employeeModal needs employeeDept
            if (modalName === 'toolModal' || modalName === 'employeeModal') {
                populateModalSelects();
            }
            openModal(modalName);

        } else if (action === 'closeModal') {
            e.preventDefault();
            closeModal(modalName);

        } else if (action === 'editTool') {
            e.preventDefault();
            editTool(numId);

        } else if (action === 'deleteTool') {
            e.preventDefault();
            deleteTool(numId);

        } else if (action === 'saveTool') {
            // do nothing here - the submit listener handles this
            // dont preventDefault or the submit event gets killed
            return;

        } else if (action === 'searchTools') {
            renderTools();

        } else if (action === 'uploadExcel') {
            e.preventDefault();
            uploadExcel();

        } else if (action === 'downloadTemplate') {
            e.preventDefault();
            downloadTemplate();

        } else if (action === 'exportExcel') {
            e.preventDefault();
            exportToExcel(tableId, fileName);

        } else if (action === 'filterCheckout') {
            renderCheckoutTable();

        } else if (action === 'filterCheckin') {
            renderCheckinTable();

        } else if (action === 'bulkReturn') {
            e.preventDefault();
            bulkReturn();

        } else if (action === 'returnTool' || action === 'initReturn') {
            // two different data attrs that do the same thing, pick whichever is set
            e.preventDefault();
            openReturnModal(numId || coId);

        } else if (action === 'resolveMaintenance') {
            e.preventDefault();
            resolveMaintenance(numId);

        } else if (action === 'editEmployee') {
            e.preventDefault();
            editEmployee(numId);

        } else if (action === 'deleteEmployee') {
            e.preventDefault();
            deleteEmployee(numId);

        } else if (action === 'resetEmployeePassword') {
            e.preventDefault();
            resetEmployeePassword(numId);

        } else if (action === 'sortAudit') {
            e.preventDefault();
            sortAuditLog(sortOrder);

        } else if (action === 'saveSettings') {
            e.preventDefault();
            saveRolePermissions();

        } else if (action === 'addDepartment') {
            e.preventDefault();
            addDepartment();

        } else if (action === 'removeDepartment') {
            e.preventDefault();
            removeDepartment(dept);

        } else if (action === 'addCategory') {
            e.preventDefault();
            addCategory();

        } else if (action === 'removeCategory') {
            e.preventDefault();
            removeCategory(cat);

        } else if (action === 'createBackup') {
            e.preventDefault();
            createBackup();

        } else if (action === 'restoreBackup') {
            e.preventDefault();
            restoreBackup();

        } else if (action === 'downloadBackup') {
            e.preventDefault();
            downloadBackup(backupDate);

        } else if (action === 'deleteBackup') {
            e.preventDefault();
            deleteBackup(backupDate);

        } else if (action === 'archiveOldData') {
            e.preventDefault();
            archiveOldData();

        } else if (action === 'exportAllData') {
            e.preventDefault();
            exportAllData();

        } else if (action === 'resetData') {
            e.preventDefault();
            resetData();

        } else if (action === 'toggleTheme') {
            toggleTheme();

        } else if (action === 'toggleSidebar') {
            toggleSidebar();

        } else {
            if (isDebugOn) console.warn('click handler: unknown action "' + action + '"');
        }

        if (isDebugOn) {
            // skip logging the noisy filter/search actions
            if (action !== 'searchTools' && action !== 'filterCheckout' && action !== 'filterCheckin') {
                console.log('action:', action, numId ? '(id=' + numId + ')' : '');
            }
        }
        return;
    }

    // nav links not using data-action
    var navEl = e.target.closest('[data-nav]');
    if (navEl) {
        e.preventDefault();
        navigate(navEl.dataset.nav);
        return;
    }

    // stop href="#" from jumping to top of page
    var emptyHref = e.target.closest('a[href="#"]');
    if (emptyHref && !emptyHref.dataset.action && !emptyHref.dataset.nav) {
        e.preventDefault();
    }
});

document.addEventListener('submit', function(e) {
    var form = e.target.closest('form[data-action]');
    if (!form) return;
    e.preventDefault();

    var action = form.dataset.action;
    if (action === 'saveTool')           saveTool(e);
    else if (action === 'saveEmployee')  saveEmployee(e);
    else if (action === 'handleCheckout') handleCheckout(e);
    else if (action === 'confirmReturn') confirmReturn(e);
    else if (action === 'changePassword') changePassword(e);
    else console.warn('submit: unhandled form action', action);
});

// live search/filter as user types
document.addEventListener('input', function(e) {
    var id = e.target.id;
    if (id === 'toolSearchBox') renderTools();
    else if (id === 'checkoutFilterInput') renderCheckoutTable();
    else if (id === 'checkinFilterInput') renderCheckinTable();
});

// enter key in search boxes
document.addEventListener('keydown', function(e) {
    if (e.key !== 'Enter') return;
    var id = e.target.id;
    if (id === 'toolSearchBox') { e.preventDefault(); renderTools(); }
    else if (id === 'checkoutFilterInput') { e.preventDefault(); renderCheckoutTable(); }
    else if (id === 'checkinFilterInput') { e.preventDefault(); renderCheckinTable(); }
});

document.addEventListener('DOMContentLoaded', function() {
    window.app.init();
});

// console helpers for debugging - only available when isDebugOn is true
if (isDebugOn) {
    window.dbg = {
        state: function() { return appState; },
        tools: function() { return appState.tools; },
        checkouts: function() { return appState.checkouts; },
        picked: function() { return Array.from(pickedToolIds); },
        pickedCo: function() { return Array.from(pickedCheckoutIds); },
        reload: function() { return loadData(); }
    };
    console.log('debug helpers on window.dbg');
}
