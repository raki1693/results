let currentAdmin = null;
let socket;

// Format Semester (1 -> 1-1, 2 -> 1-2, etc)
function formatSem(num) {
    const s = parseInt(num);
    const map = { 1:'1-1', 2:'1-2', 3:'2-1', 4:'2-2', 5:'3-1', 6:'3-2', 7:'4-1', 8:'4-2' };
    return map[s] || s;
}

document.addEventListener('DOMContentLoaded', async () => {
    const session = await checkSession();
    if (session.loggedIn && session.role === 'admin') {
        currentAdmin = session.user;
        showAdminDashboard();

        // ⚡ WEBSOCKET ENGINE
        socket = io();
        
        socket.on('admin_new_message', () => {
            const activeSec = document.querySelector('.content-section.active');
            if (activeSec && activeSec.id === 'section-admChat') {
                loadChatList();
                loadStudentChats();
            } else {
                loadStats(true);
            }
        });

        socket.on('messages_seen', () => loadStudentChats());
        socket.on('message_updated', () => loadStudentChats());

        // Refresh lists if results are updated
        socket.on('results_updated', () => {
            const activeSec = document.querySelector('.content-section.active');
            if (activeSec && activeSec.id === 'section-admResults') loadAdminResults(true);
            loadStats(true);
        });

        // 🚀 LIVE UPLOAD PROGRESS
        socket.on('upload_progress', (data) => {
            const isResults = data.type === 'Results';
            const prefix = isResults ? 'res' : 'stu';
            
            const progressWrap = document.getElementById(`${prefix}UploadProgress`);
            const progressBar = document.getElementById(`${prefix}ProgressBar`);
            const statusLabel = document.getElementById(`${prefix}UploadStatus`);
            const percentLabel = document.getElementById(`${prefix}UploadPercent`);

            if (progressWrap) progressWrap.classList.remove('hidden');
            if (progressBar) progressBar.style.width = `${data.percent}%`;
            if (percentLabel) percentLabel.textContent = `${data.percent}%`;
            
            if (statusLabel) {
                if (data.percent < 100) {
                    statusLabel.textContent = `⚙️ Processing ${data.processed} of ${data.total} records...`;
                } else {
                    statusLabel.textContent = `✅ Wrapping up...`;
                }
            }
        });

        // Start live UI timer
        startLiveTimer();

        // Admin Profile Form Listener
        const profileForm = document.getElementById('adminProfileForm');
        if (profileForm) {
            profileForm.addEventListener('submit', handleAdminProfileUpdate);
        }

    } else {
        showAdminLogin();
    }
});

function startLiveTimer() {
    setInterval(() => {
        document.querySelectorAll('.timer-cell[data-expiry]').forEach(cell => {
            const expiry = new Date(cell.getAttribute('data-expiry'));
            const now = new Date();
            const diff = expiry - now;

            if (diff <= 0) {
                cell.textContent = 'Expired';
                cell.classList.add('text-danger');
                return;
            }

            const mins = Math.floor(diff / 60000);
            const secs = Math.floor((diff % 60000) / 1000);
            cell.textContent = `${mins}m ${secs}s`;
            
            if (mins < 2) cell.classList.add('text-danger');
            else cell.classList.remove('text-danger');
        });
    }, 1000);
}

async function checkSession() {
    try {
        const res = await fetch('/api/auth/check');
        return await res.json();
    } catch (e) {
        return { loggedIn: false };
    }
}

function showAdminLogin() {
    document.getElementById('adminLoginScreen').classList.remove('hidden');
    document.getElementById('adminDashboard').classList.add('hidden');
}

function showAdminDashboard() {
    document.getElementById('adminLoginScreen').classList.add('hidden');
    document.getElementById('adminDashboard').classList.remove('hidden');
    document.getElementById('adminSidebarName').textContent = currentAdmin.name;
    document.getElementById('adminGreeting').textContent = `Welcome, ${currentAdmin.username}!`;
    loadStats();
}

// Security Tracking
let pinAttempts = 5;
const CORRECT_PIN = "965216";
const UNLOCK_ANSWER = "Junnu";
let pendingAdminData = null;

async function generateKitsReport(e) {
    if (e) e.preventDefault();
    console.log("Generating KITS Report...");
    
    const btn = document.getElementById('kitsReportBtn');
    const preview = document.getElementById('kitsReportPreview');
    
    if (!btn || !preview) return;

    const payload = {
        batch: document.getElementById('kitsBatch').value,
        regulation: document.getElementById('kitsRegulation').value,
        program: document.getElementById('kitsProgram').value,
        branch: document.getElementById('kitsBranch').value,
        status: document.getElementById('kitsStatus').value,
        format: document.getElementById('kitsFormat').value
    };

    try {
        btn.disabled = true;
        btn.innerHTML = '<span class="btn-content">⏳ Fetching...</span>';
        preview.innerHTML = '<div class="spinner-small"></div><p style="margin-top:1rem">Connecting to KITS portal...</p>';

        const res = await fetch('/api/admin/kits-reports', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.message || 'Server error while fetching report');
        }

        const blob = await res.blob();
        const url = URL.createObjectURL(blob);

        if (payload.format === 'PDF') {
            preview.innerHTML = `<iframe src="${url}" style="width:100%; height:100%; border:none; border-radius:12px;"></iframe>`;
        } else {
            preview.innerHTML = `
                <div style="text-align:center">
                    <p style="color:var(--success); font-weight:700">✅ Excel Report Generated!</p>
                    <a href="${url}" download="KITS_Report.xlsx" class="btn-primary" style="display:inline-block; margin-top:1rem; padding:0.5rem 2rem; text-decoration:none">📥 Download Excel</a>
                </div>
            `;
        }
    } catch (err) {
        console.error("Report Error:", err);
        preview.innerHTML = `<p style="color:var(--danger); text-align:center; padding: 2rem;">❌ Error: ${err.message}<br/><small>Check backend logs on Render.</small></p>`;
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<span class="btn-content">⚡ Generate KITS Report</span>';
    }
}

// Admin Login - Step 1 (Authentication)
document.getElementById('adminLoginForm').onsubmit = async (e) => {
    e.preventDefault();
    const username = document.getElementById('adminUser').value;
    const password = document.getElementById('adminPass').value;
    const errorEl = document.getElementById('adminLoginError');
    const submitBtn = e.target.querySelector('button[type="submit"]');

    try {
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = "Verifying...";
        }

        const res = await fetch('/api/auth/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        
        if (data.success) {
            // Credentials correct, move to Step 2 (PIN)
            pendingAdminData = data.admin;
            document.getElementById('adminLoginForm').classList.add('hidden');
            document.getElementById('adminPinForm').classList.remove('hidden');
        } else {
            errorEl.textContent = data.message;
            errorEl.classList.remove('hidden');
        }
    } catch (err) {
        errorEl.textContent = "Server error.";
        errorEl.classList.remove('hidden');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = "🛡️ Admin Sign In";
        }
    }
};

// Admin PIN - Step 2 (Verification)
const pinForm = document.getElementById('adminPinForm');
if (pinForm) {
    pinForm.onsubmit = (e) => {
        e.preventDefault();
        const pin = document.getElementById('adminPin').value;
        const errorEl = document.getElementById('adminPinError');
        const attemptEl = document.getElementById('pinAttempts');

        // Check against the dynamically fetched PIN
        if (pin === (pendingAdminData.securityPin || "965216")) {
            currentAdmin = pendingAdminData;
            showAdminDashboard();
            
            // Startlive socket
            if (typeof io !== 'undefined') {
                socket = io();
                socket.on('admin_new_message', () => {
                    const activeSec = document.querySelector('.content-section.active');
                    if (activeSec && activeSec.id === 'section-admChat') {
                        loadChatList();
                        loadStudentChats();
                    } else {
                        loadStats(true);
                    }
                });
            }
            // Reset
            pinAttempts = 5;
            document.getElementById('adminPin').value = "";
        } else {
            pinAttempts--;
            if (pinAttempts <= 0) {
                document.getElementById('adminPinForm').classList.add('hidden');
                document.getElementById('adminUnlockForm').classList.remove('hidden');
            } else {
                errorEl.textContent = "Incorrect PIN!";
                errorEl.classList.remove('hidden');
                attemptEl.textContent = `${pinAttempts} attempts remaining`;
                document.getElementById('adminPin').value = "";
            }
        }
    };
}

// Admin Unlock - Step 3 (Recovery)
const unlockForm = document.getElementById('adminUnlockForm');
if (unlockForm) {
    unlockForm.onsubmit = (e) => {
        e.preventDefault();
        const answer = document.getElementById('unlockAnswer').value.trim();
        const errorEl = document.getElementById('adminUnlockError');

        // Check against the dynamically fetched Nickname
        if (answer.toLowerCase() === (pendingAdminData.securityNickname || "Junnu").toLowerCase()) {
            alert("Account Unlocked! Try signing in again.");
            pinAttempts = 5;
            document.getElementById('pinAttempts').textContent = "5 attempts remaining";
            document.getElementById('adminPinError').classList.add('hidden');
            document.getElementById('adminPin').value = "";
            document.getElementById('unlockAnswer').value = "";
            
            // Go back to Step 1
            document.getElementById('adminUnlockForm').classList.add('hidden');
            document.getElementById('adminLoginForm').classList.remove('hidden');
        } else {
            errorEl.textContent = "Incorrect answer!";
            errorEl.classList.remove('hidden');
        }
    };
}

async function loadStats() {
    try {
        const res = await fetch('/api/admin/stats');
        const data = await res.json();
        if (data.success) {
            const s = data.stats;
            document.getElementById('dTotalStudents').textContent = s.totalStudents;
            document.getElementById('dActiveStudents').textContent = s.activeStudents;
            document.getElementById('dTotalResults').textContent = s.totalResults;
            document.getElementById('dPassCount').textContent = s.passCount;
            document.getElementById('dFailCount').textContent = s.failCount;
        }
    } catch (e) {}
}

// Student Management
async function loadStudents() {
    const search = document.getElementById('stuSearch').value;
    const branch = document.getElementById('stuBranch').value;
    const year = document.getElementById('stuYear').value;
    
    const query = new URLSearchParams({ search, branch, year }).toString();
    const wrap = document.getElementById('studentsTableWrap');
    
    try {
        const res = await fetch(`/api/admin/students?${query}`);
        const data = await res.json();
        
        if (data.success) {
            if (!data.students.length) {
                wrap.innerHTML = `<p style="padding: 2rem; text-align: center">No students found.</p>`;
                return;
            }
            
            wrap.innerHTML = `
                <table class="data-table">
                    <thead>
                        <tr>
                            <th class="chk-col"><input type="checkbox" id="selectAllStu" onchange="toggleSelectAll(this)"></th>
                            <th>Roll Number</th>
                            <th>Name</th>
                            <th>Branch</th>
                            <th>Year</th>
                            <th>Account</th>
                            <th>Data Access</th>
                            <th>Session Timer</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.students.map(s => {
                            let timeLeft = '--';
                            let timeClass = '';
                            let expiryAttr = '';
                            if (s.sessionExpiry) {
                                expiryAttr = `data-expiry="${s.sessionExpiry}"`;
                                const diff = new Date(s.sessionExpiry) - new Date();
                                if (diff > 0) {
                                    const mins = Math.floor(diff / 60000);
                                    const secs = Math.floor((diff % 60000) / 1000);
                                    timeLeft = `${mins}m ${secs}s`;
                                    if (mins < 2) timeClass = 'text-danger'; // Highlight last 2 mins
                                } else {
                                    timeLeft = 'Expired';
                                    timeClass = 'text-danger';
                                }
                            }
                            
                            return `
                            <tr>
                                <td class="chk-col"><input type="checkbox" class="stu-checkbox" value="${s._id}" onchange="updateBulkUI()"></td>
                                <td><strong>${s.rollNumber}</strong></td>
                                <td>${s.name}</td>
                                <td>${s.branch}</td>
                                <td>Year ${s.year}</td>
                                <td><span class="status-pill ${s.isActive ? 'active' : 'inactive'}">${s.isActive ? 'Active' : 'Inactive'}</span></td>
                                <td>
                                    <button class="btn-toggle ${s.hasDataAccess ? 'enabled' : 'disabled'}" onclick="toggleDataAccess('${s._id}')">
                                        ${s.hasDataAccess ? '🔓 Allowed' : '🔒 Locked'}
                                    </button>
                                </td>
                                <td class="timer-cell ${timeClass}" ${expiryAttr} style="font-weight:700">${timeLeft}</td>
                                <td>
                                    <div class="action-btns">
                                        <button class="btn-icon-only" onclick="toggleStudentStatus('${s._id}')" title="Toggle Active">🔄</button>
                                        <button class="btn-icon-only" onclick="setStudentTimer('${s._id}', '${s.rollNumber}')" title="Set Timer">⏱️</button>
                                        <button class="btn-icon-only" onclick="clearStudentTimer('${s._id}', '${s.rollNumber}')" title="Clear Timer" style="color: var(--danger)">✖️</button>
                                        <button class="btn-icon-only" onclick="resetStudentPassword('${s._id}', '${s.rollNumber}')" title="Change Password">🔑</button>
                                        <button class="btn-icon-only delete" onclick="deleteStudent('${s._id}')" title="Delete">🗑️</button>
                                    </div>
                                </td>
                            </tr>
                        `;}).join('')}
                    </tbody>
                </table>
            `;
        }
        updateBulkUI(); // Reset UI after load
    } catch (e) {
        wrap.innerHTML = `<p style="padding: 2rem; color: var(--danger)">Failed to load data.</p>`;
    }
}

async function setStudentTimer(id, roll) {
    const mins = prompt(`Set session duration for ${roll} (in minutes). \nEnter 0 to disable timer:`, "10");
    if (mins === null) return;

    try {
        const res = await fetch(`/api/admin/students/${id}/timer`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ minutes: parseInt(mins) })
        });
        const data = await res.json();
        if (data.success) {
            alert(data.message);
            loadStudents();
        }
    } catch (e) {
        alert("Server error.");
    }
}

async function resetStudentPassword(id, roll) {
    const newPass = prompt(`Enter new password for ${roll}:`);
    if (newPass === null || newPass.trim() === "") return;

    try {
        const res = await fetch(`/api/admin/students/${id}/password`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: newPass })
        });
        const data = await res.json();
        if (data.success) {
            alert("Password updated successfully!");
        } else {
            alert("Error: " + data.message);
        }
    } catch (e) {
        alert("Server error.");
    }
}

async function toggleStudentStatus(id) {
    const res = await fetch(`/api/admin/students/${id}/toggle`, { method: 'PATCH' });
    const data = await res.json();
    if (data.success) loadStudents();
}

async function deleteStudent(id) {
    if (!confirm("Are you sure? This will delete the student permanently.")) return;
    const res = await fetch(`/api/admin/students/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) loadStudents();
}

// ⚡ BULK ACTION HANDLERS
function toggleSelectAll(master) {
    document.querySelectorAll('.stu-checkbox').forEach(chk => chk.checked = master.checked);
    updateBulkUI();
}

function updateBulkUI() {
    const selected = document.querySelectorAll('.stu-checkbox:checked');
    const toolbar = document.getElementById('bulkActionToolbar');
    const countLbl = document.getElementById('selectedCount');
    
    if (selected.length > 0) {
        toolbar.classList.remove('hidden');
        countLbl.textContent = `${selected.length} Selected`;
    } else {
        toolbar.classList.add('hidden');
        if (document.getElementById('selectAllStu')) {
            document.getElementById('selectAllStu').checked = false;
        }
    }
}

async function handleBulkStatus(active) {
    const selected = Array.from(document.querySelectorAll('.stu-checkbox:checked')).map(c => c.value);
    if (!selected.length) return;
    
    if (!confirm(`Switch ${selected.length} students to ${active ? 'ACTIVE' : 'INACTIVE'}?`)) return;

    try {
        const res = await fetch('/api/admin/bulk/students/status', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ studentIds: selected, active })
        });
        const data = await res.json();
        if (data.success) {
            alert(data.message);
            loadStudents();
        }
    } catch (e) { alert("Bulk update failed."); }
}

async function handleBulkData(allowed) {
    const selected = Array.from(document.querySelectorAll('.stu-checkbox:checked')).map(c => c.value);
    if (!selected.length) return;
    
    if (!confirm(`${allowed ? 'UNLOCK' : 'LOCK'} data access for ${selected.length} students?`)) return;

    try {
        const res = await fetch('/api/admin/bulk/students/data-access', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ studentIds: selected, allowed })
        });
        const data = await res.json();
        if (data.success) {
            alert(data.message);
            loadStudents();
        }
    } catch (e) { alert("Bulk update failed."); }
}

// Result Management
async function loadAdminResults() {
    const branch = document.getElementById('resBranch').value;
    const semester = document.getElementById('resSemester').value;
    const examType = document.getElementById('resExam').value;
    
    const query = new URLSearchParams({ branch, semester, examType }).toString();
    const wrap = document.getElementById('resultsTableWrap');
    
    try {
        const res = await fetch(`/api/admin/results?${query}`);
        const data = await res.json();
        
        if (data.success) {
            if (!data.results.length) {
                wrap.innerHTML = `<p style="padding: 2rem; text-align: center">No result records found.</p>`;
                return;
            }
            
            wrap.innerHTML = `
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Roll Number</th>
                            <th>Name</th>
                            <th>Sem</th>
                            <th>Exam</th>
                            <th>SGPA</th>
                            <th>Result</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.results.map(r => `
                            <tr>
                                <td><strong>${r.rollNumber}</strong></td>
                                <td>${r.studentName}</td>
                                <td>Sem ${formatSem(r.semester)}</td>
                                <td>${r.examType} ${r.examSession ? `<small style="display:block;color:#64748b">(${r.examSession})</small>` : ''}</td>
                                <td>${r.sgpa}</td>
                                <td><span class="status-pill ${r.result === 'Pass' ? 'active' : 'inactive'}">${r.result}</span></td>
                                <td>
                                    <button class="btn-icon-only delete" onclick="deleteResult('${r._id}')">🗑️</button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
        }
    } catch (e) {}
}

async function deleteResult(id) {
    if (!confirm("Delete this result record?")) return;
    const res = await fetch(`/api/admin/results/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) loadAdminResults();
}

async function handleStudentUpload() {
    const fileInput = document.getElementById('stuFile');
    if (!fileInput.files.length) return;
    
    const formData = new FormData();
    formData.append('file', fileInput.files[0]);
    
    const progressWrap = document.getElementById('stuUploadProgress');
    const progressBar = document.getElementById('stuProgressBar');
    const status = document.getElementById('stuUploadStatus');
    const resultBox = document.getElementById('stuUploadResult');
    const percentLbl = document.getElementById('stuUploadPercent');
    
    progressWrap.classList.remove('hidden');
    resultBox.classList.add('hidden');
    progressBar.style.width = '0%';
    percentLbl.textContent = '0%';
    status.textContent = '⏳ Initializing Upload...';

    try {
        const res = await fetch('/api/admin/upload-students', {
            method: 'POST',
            body: formData
        });
        const data = await res.json();
        
        if (data.success) {
            progressBar.style.width = '100%';
            percentLbl.textContent = '100%';
            status.textContent = '✅ Finalizing...';
            
            setTimeout(() => {
                status.textContent = 'Upload Complete!';
                resultBox.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <p style="color: var(--success); margin:0">✅ ${data.message}</p>
                        <button onclick="clearUploadStatus('stu')" style="background:none; border:none; cursor:pointer; font-size:1.2rem;">✕</button>
                    </div>`;
                resultBox.classList.remove('hidden');
                loadUploadHistory('students', 'stuHistoryContainer');
            }, 500);
        } else {
            status.textContent = 'Upload Failed';
            resultBox.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <p style="color: var(--danger); margin:0">❌ ${data.message}</p>
                    <button onclick="clearUploadStatus('stu')" style="background:none; border:none; cursor:pointer; font-size:1.2rem;">✕</button>
                </div>`;
            resultBox.classList.remove('hidden');
        }
    } catch (e) {
        status.textContent = 'Network Error';
    } finally {
        fileInput.value = '';
    }
}

function updateUploadSubTypes() {
    const parent = document.getElementById('uploadResType').value;
    const subSelect = document.getElementById('uploadResSub');
    const subLabel = document.getElementById('uploadSubLabel');
    
    if (parent === 'Internal') {
        subLabel.textContent = "Internal Type";
        subSelect.innerHTML = `
            <option value="Mid-1">Mid-1 Exam</option>
            <option value="Mid-2">Mid-2 Exam</option>
            <option value="Assignment">Assignment</option>
        `;
    } else {
        subLabel.textContent = "External Type";
        subSelect.innerHTML = `
            <option value="Regular">Regular (Main)</option>
            <option value="Supply">Supplementary (Supply)</option>
        `;
    }
}

async function handleResultUpload() {
    const fileInput = document.getElementById('resFile');
    if (!fileInput.files.length) return;

    const sem = document.getElementById('uploadResSem').value;
    const type = document.getElementById('uploadResSub').value;
    const session = document.getElementById('uploadResSession').value.trim();

    const formData = new FormData();
    formData.append('file', fileInput.files[0]);
    formData.append('semester', sem);
    formData.append('examType', type);
    formData.append('examSession', session);

    const progressWrap = document.getElementById('resUploadProgress');
    const progressBar = document.getElementById('resProgressBar');
    const statusText = document.getElementById('resUploadStatus');
    const percentLbl = document.getElementById('resUploadPercent');
    const resultDiv = document.getElementById('resUploadResult');

    try {
        progressWrap.classList.remove('hidden');
        resultDiv.classList.add('hidden');
        progressBar.style.width = '0%';
        percentLbl.textContent = '0%';
        statusText.textContent = '⏳ Initializing Upload...';

        const res = await fetch('/api/admin/upload-results', {
            method: 'POST',
            body: formData
        });
        
        const data = await res.json();
        
        if (data.success) {
            progressBar.style.width = '100%';
            percentLbl.textContent = '100%';
            statusText.textContent = '✅ Finalizing...';

            setTimeout(() => {
                statusText.textContent = 'Processing Complete!';
                resultDiv.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <p style="color:green; margin:0">✅ ${data.message}<br/>${data.details}</p>
                        <button onclick="clearUploadStatus('res')" style="background:none; border:none; cursor:pointer; font-size:1.2rem;">✕</button>
                    </div>`;
                resultDiv.classList.remove('hidden');
                loadStats();
                loadUploadHistory('results', 'resHistoryContainer');
            }, 500);
        } else {
            statusText.textContent = 'Upload Failed';
            resultDiv.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <p style="color:red; margin:0">❌ ${data.message}</p>
                    <button onclick="clearUploadStatus('res')" style="background:none; border:none; cursor:pointer; font-size:1.2rem;">✕</button>
                </div>`;
            resultDiv.classList.remove('hidden');
        }
    } catch (e) {
        statusText.textContent = 'Network Error';
    } finally {
        fileInput.value = '';
    }
}

function clearUploadStatus(prefix) {
    document.getElementById(`${prefix}UploadProgress`).classList.add('hidden');
    document.getElementById(`${prefix}UploadResult`).classList.add('hidden');
    document.getElementById(`${prefix}UploadResult`).innerHTML = '';
    document.getElementById(`${prefix}ProgressBar`).style.width = '0%';
    document.getElementById(`${prefix}UploadPercent`).textContent = '0%';
}

// Manual Add Student
async function submitAddStudent(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const body = Object.fromEntries(formData.entries());
    const msg = document.getElementById('addStudentMsg');
    
    try {
        const res = await fetch('/api/admin/students', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await res.json();
        
        msg.classList.remove('hidden');
        if (data.success) {
            msg.className = 'upload-result';
            msg.style.color = 'var(--success)';
            msg.textContent = 'Student added successfully!';
            e.target.reset();
        } else {
            msg.className = 'upload-result';
            msg.style.color = 'var(--danger)';
            msg.textContent = 'Error: ' + data.message;
        }
    } catch (e) {
        msg.textContent = "Error connecting to server.";
    }
}

// UI Helpers
function adminShowSection(id, btn) {
    document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    
    // Auto-fix ID to match HTML format (section-XXXX)
    const targetId = id.startsWith('section-') ? id : `section-${id}`;
    const target = document.getElementById(targetId);
    
    if (target) {
        target.classList.add('active');
        // Update title bar
        const titleText = btn.textContent.trim().replace(/^[^a-zA-Z0-9\s]+/, '');
        document.getElementById('adminTopTitle').textContent = titleText;
    }
    btn.classList.add('active');

    if (id.includes('Dashboard')) loadStats();
    if (id.includes('Students') && !id.includes('Upload')) loadStudents();
    if (id.includes('Results') && !id.includes('Upload')) loadAdminResults();
    if (id.includes('UploadStudents')) {
        loadUploadHistory('students', 'stuHistoryContainer');
    }
    if (id.includes('UploadResults')) {
        loadUploadHistory('results', 'resHistoryContainer');
    }
    if (id.includes('Chat')) {
        loadChatList();
        loadStudentChats();
    }
    if (id.includes('Data')) {
        loadAdminDataFiles();
    }
    if (id.includes('Profile')) {
        document.getElementById('admUsername').value = currentAdmin.username;
        document.getElementById('admPin').value = currentAdmin.securityPin || '';
        document.getElementById('admNickname').value = currentAdmin.securityNickname || '';
        document.getElementById('admProfileMsg').className = 'hidden';
    }

    // Auto-close sidebar on mobile
    if (window.innerWidth <= 1024) {
        document.querySelector('.sidebar').classList.remove('active');
    }
}



async function loadUploadHistory(type, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    try {
        const res = await fetch('/api/admin/upload-history');
        const data = await res.json();
        
        if (data.success) {
            let history = data.history;
            if (type) {
                history = history.filter(h => h.uploadType.toLowerCase() === type.toLowerCase());
            }

            if (history.length === 0) {
                container.innerHTML = `<p style="text-align:center; padding: 2rem;">No ${type || 'upload'} history found.</p>`;
                return;
            }

            container.innerHTML = `
                <div class="table-wrap">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Timestamp</th>
                            <th>Filename</th>
                            ${type === 'results' ? '<th>Category</th>' : ''}
                            <th>Records</th>
                            <th>Admin</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${history.map(h => {
                            const cat = (h.semester || h.examType)
                                ? `<span style="display:inline-flex;align-items:center;gap:4px;background:#eff6ff;border:1px solid #93c5fd;border-radius:20px;padding:3px 10px;font-size:0.75rem;font-weight:700;color:#1d4ed8;white-space:nowrap">📚 Sem ${formatSem(h.semester) || '?'} &nbsp;·&nbsp; ${h.examType || '?'}${h.examSession ? ` (${h.examSession})` : ''}</span>`
                                : `<span style="color:#94a3b8;font-size:0.8rem">—</span>`;
                            return `
                            <tr>
                                <td>${new Date(h.timestamp).toLocaleString()}</td>
                                <td style="color:var(--primary)">${h.filename}</td>
                                ${type === 'results' ? `<td>${cat}</td>` : ''}
                                <td>
                                    <div style="font-size:0.85rem">
                                        <div>✅ Processed: <b>${h.recordsCount}</b></div>
                                        <div style="font-size:0.7rem; color:grey">📄 Excel Rows: ${h.totalRows || h.recordsCount}</div>
                                        ${h.failedCount > 0 ? `<div style="font-size:0.7rem; color:var(--danger)">❌ Failed: ${h.failedCount}</div>` : ''}
                                    </div>
                                </td>
                                <td>${h.uploadedBy}</td>
                                <td>
                                    <div style="display:flex;gap:5px">
                                        ${type === 'results' ? `
                                            <button class="btn-secondary" style="background:#f0f9ff;color:#0369a1;border:none;padding:4px 8px;border-radius:6px;cursor:pointer"
                                                onclick="editUploadCategory('${h._id}','${h.examType}','${h.examSession || ''}','results','${containerId}')">
                                                ✏️ Edit
                                            </button>
                                        ` : ''}
                                        <button class="btn-secondary" style="background:#fee2e2;color:#b91c1c;border:none;padding:4px 8px;border-radius:6px;cursor:pointer"
                                            onclick="rollbackUpload('${h._id}','${h.uploadType}','${type}','${containerId}')">
                                            🗑️ Rollback
                                        </button>
                                    </div>
                                </td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>
                </div>
            `;
        }
    } catch (e) { container.innerHTML = 'Error loading history.'; }
}

async function rollbackUpload(id, rollbackType, filterType, containerId) {
    if (!confirm(`Warning: This will PERMANENTLY remove all ${rollbackType} from this Excel file. Are you sure?`)) return;

    try {
        const res = await fetch(`/api/admin/upload-history/${id}/rollback`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
            alert(data.message);
            loadUploadHistory(filterType, containerId);
            loadStats();
        } else {
            alert("Rollback failed: " + data.message);
        }
    } catch (e) { alert("Error connecting to server."); }
}

async function editUploadCategory(id, oldType, oldSession, filterType, containerId) {
    const newType = prompt("Update Exam Category (e.g. Regular, Supply, Mid-1):", oldType);
    if (newType === null) return;

    const newSession = prompt("Update Exam Session (e.g. Nov 2023):", oldSession);
    if (newSession === null) return;

    try {
        const res = await fetch(`/api/admin/upload-history/${id}`, { 
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ examType: newType, examSession: newSession })
        });
        const data = await res.json();
        if (data.success) {
            alert(data.message);
            loadUploadHistory(filterType, containerId);
            loadStats(); // Stats might change if result counts by type are used
            if (filterType === 'results') loadAdminResults(); // Refresh current table view
        } else {
            alert("Update failed: " + data.message);
        }
    } catch (e) { alert("Error connecting to server."); }
}

async function handleAdminProfileUpdate(e) {
    if (e) e.preventDefault();
    
    const btn = document.querySelector('#adminProfileForm button[type="submit"]');
    const originalText = btn ? btn.textContent : 'Update Profile';
    
    const usernameEl = document.getElementById('admUsername');
    const oldPasswordEl = document.getElementById('admOldPassword');
    const newPasswordEl = document.getElementById('admNewPassword');
    const msgEl = document.getElementById('admProfileMsg');

    if (!usernameEl || !msgEl) {
        alert('Internal Error: Form elements missing!');
        return;
    }

    const username = usernameEl.value.trim();
    const oldPassword = oldPasswordEl ? oldPasswordEl.value : '';
    const newPassword = newPasswordEl ? newPasswordEl.value : '';
    const securityPin = document.getElementById('admPin').value.trim();
    const securityNickname = document.getElementById('admNickname').value.trim();

    if (newPassword && !oldPassword) {
        msgEl.textContent = "Current password is required to change password.";
        msgEl.className = "error-msg";
        msgEl.classList.remove('hidden');
        return;
    }

    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Updating...';
    }

    try {
        const res = await fetch('/api/auth/admin/update-profile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, oldPassword, newPassword, securityPin, securityNickname })
        });
        const data = await res.json();

        msgEl.classList.remove('hidden');
        if (data.success) {
            msgEl.textContent = data.message;
            msgEl.className = "success-msg";
            
            // Update local state and UI
            if (currentAdmin) currentAdmin.username = username;
            const greet = document.getElementById('adminGreeting');
            if (greet) greet.textContent = `Welcome, ${username}!`;
            
            // Clear passwords
            if (oldPasswordEl) oldPasswordEl.value = '';
            if (newPasswordEl) newPasswordEl.value = '';
        } else {
            msgEl.textContent = data.message;
            msgEl.className = "error-msg";
        }
    } catch (err) {
        alert('Server connection error!');
        msgEl.textContent = "Server error. Try again.";
        msgEl.className = "error-msg";
        msgEl.classList.remove('hidden');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    }
}

function toggleSidebar() {
    document.querySelector('.sidebar').classList.toggle('active');
}

function clearUploadStatus(prefix) {
    document.getElementById(`${prefix}UploadProgress`).classList.add('hidden');
    document.getElementById(`${prefix}UploadResult`).classList.add('hidden');
    document.getElementById(`${prefix}UploadResult`).innerHTML = '';
    document.getElementById(`${prefix}ProgressBar`).style.width = '0%';
}

function adminLogout() {
    fetch('/api/auth/logout', { method: 'POST' }).then(() => window.location.reload());
}

// Drag & Drop Helpers
function addDragOver(id) { document.getElementById(id).classList.add('dragover'); }
function removeDragOver(id) { document.getElementById(id).classList.remove('dragover'); }
function handleDrop(e, inputId) {
    e.preventDefault();
    const dropZoneId = e.currentTarget.id;
    removeDragOver(dropZoneId);
    if (e.dataTransfer.files.length) {
        document.getElementById(inputId).files = e.dataTransfer.files;
        if (inputId === 'stuFile') handleStudentUpload();
        if (inputId === 'resFile') handleResultUpload();
    }
}

function togglePw(id, btn) {
    const input = document.getElementById(id);
    input.type = input.type === 'password' ? 'text' : 'password';
    btn.textContent = input.type === 'password' ? '👁️' : '🔒';
}

async function loadChatList() {
    try {
        const res = await fetch('/api/chat/admin/list');
        const data = await res.json();
        if (data.success) {
            const list = document.getElementById('adminChatList');
            if (data.list.length === 0) {
                list.innerHTML = `<p style="padding: 2rem; text-align:center">No active chats.</p>`;
                return;
            }
            list.innerHTML = data.list.map(c => `
                <div class="chat-list-item ${activeChatRoll === c._id ? 'active' : ''}" onclick="openChat('${c._id}', '${c.name}')">
                    <div class="chat-list-name">${c.name || 'Student'} (${c._id})</div>
                    <div class="chat-list-msg">${c.lastMsg}</div>
                    <div class="chat-list-time">${new Date(c.time).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</div>
                </div>
            `).join('');
        }
    } catch (e) {}
}

let activeChatRoll = null;
let currentAdminReplyId = null;

async function openChat(roll, name) {
    activeChatRoll = roll;
    document.getElementById('adminChatArea').style.visibility = 'visible';
    document.getElementById('activeChatStudent').textContent = `Chatting with: ${name} (${roll})`;
    loadStudentChats();
    markSeen(roll);
}

async function markSeen(otherRoll) {
    try {
        await fetch('/api/chat/mark-read', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ otherRoll })
        });
    } catch (e) {}
}

async function loadStudentChats() {
    if (!activeChatRoll) return;
    try {
        const res = await fetch(`/api/chat/student/${activeChatRoll}`);
        const data = await res.json();
        if (data.success) {
            renderChats(data.chats, 'adminChatMsgs', 'admin');
        }
    } catch (e) {}
}

async function sendAdminChat() {
    if (!activeChatRoll) return;
    const input = document.getElementById('adminChatInput');
    const msg = input.value.trim();
    if (!msg) return;

    try {
        const res = await fetch('/api/chat/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: msg, receiverRoll: activeChatRoll, replyTo: currentAdminReplyId })
        });
        if ((await res.json()).success) {
            input.value = '';
            cancelAdminReply();
            loadStudentChats();
            loadChatList();
        }
    } catch (e) {}
}

async function clearStudentTimer(id, roll) {
    if (!confirm(`Clear session timer for Student ${roll}?`)) return;
    try {
        const res = await fetch(`/api/admin/students/${id}/timer`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ minutes: 0 })
        });
        const data = await res.json();
        if (data.success) {
            loadStudents(); // Refresh list
        }
    } catch (e) { alert("Error clearing timer."); }
}

async function clearAllChats() {
    if (!confirm("⚠️ This will DELETE ALL chat history for ALL students. Continue?")) return;
    try {
        const res = await fetch('/api/chat/clear-all', { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
            alert(data.message);
            location.reload();
        }
    } catch (e) { alert("Error clearing chats."); }
}

function renderChats(chats, containerId, myRoll) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const scrollAtBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 100;

    const chatMap = new Map(chats.map(c => [c._id, c]));

    const html = chats.map(c => {
        const isMe = c.senderRoll === myRoll;
        const replyMsg = c.replyTo ? chatMap.get(c.replyTo) : null;

        return `
            <div class="chat-bubble ${isMe ? 'me' : 'them'}" id="msg-${c._id}">
                ${isMe ? `<button class="msg-actions-btn" onclick="toggleMsgMenu('${c._id}')">▼</button>` : ''}
                
                <div class="msg-menu" id="menu-${c._id}">
                    <button onclick="replyToMsg('${c._id}', '${c.message.replace(/'/g, "\\'")}')">↩ Reply</button>
                    <button onclick="copyMsg('${c.message.replace(/'/g, "\\'")}')">📋 Copy</button>
                    ${isMe && !c.isDeleted ? `
                        <button onclick="editMsg('${c._id}', '${c.message.replace(/'/g, "\\'")}')">📝 Edit</button>
                        <button class="btn-delete" onclick="deleteMsg('${c._id}')">🗑️ Delete</button>
                    ` : ''}
                </div>

                <div class="chat-sender">${isMe ? 'You' : (c.studentName || 'Student')}</div>
                
                ${replyMsg ? `
                    <div class="reply-quote">
                        <strong>${replyMsg.senderRoll === myRoll ? 'You' : 'Student'}:</strong> ${replyMsg.message}
                    </div>
                ` : ''}

                <div class="chat-msg">
                    ${c.message}
                    ${c.isEdited ? '<span style="font-size:0.6rem; opacity:0.6; margin-left:5px">(edited)</span>' : ''}
                </div>

                <div class="chat-meta">
                    <span class="chat-time">${new Date(c.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                    ${isMe ? `
                        <span class="chat-status ${c.status}">
                            ${c.status === 'seen' ? '✓✓' : '✓'}
                        </span>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');
    
    if (container.innerHTML !== html) {
        container.innerHTML = html;
        if (scrollAtBottom) container.scrollTop = container.scrollHeight;
    }
}

function toggleMsgMenu(id) {
    const menu = document.getElementById(`menu-${id}`);
    const allMenus = document.querySelectorAll('.msg-menu');
    allMenus.forEach(m => { if(m !== menu) m.style.display = 'none'; });
    menu.style.display = menu.style.display === 'flex' ? 'none' : 'flex';
}

function replyToMsg(id, text) {
    currentAdminReplyId = id;
    const preview = document.getElementById('adminChatReplyPreview');
    preview.innerHTML = `
        <div class="reply-preview">
            <span class="reply-preview-text">Replying to: "${text}"</span>
            <button onclick="cancelAdminReply()" style="background:none; border:none; cursor:pointer">✕</button>
        </div>
    `;
    document.getElementById('adminChatInput').focus();
    toggleMsgMenu(id);
}

function cancelAdminReply() {
    currentAdminReplyId = null;
    document.getElementById('adminChatReplyPreview').innerHTML = '';
}

function copyMsg(text) {
    navigator.clipboard.writeText(text);
    alert("Message copied!");
}

async function editMsg(id, oldText) {
    const newText = prompt("Edit message:", oldText);
    if (!newText || newText === oldText) return;
    try {
        await fetch(`/api/chat/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: newText })
        });
        loadStudentChats();
    } catch (e) {}
}

async function deleteMsg(id) {
    if (!confirm("Delete message for everyone?")) return;
    try {
        await fetch(`/api/chat/${id}`, { method: 'DELETE' });
        loadStudentChats();
    } catch (e) {}
}

document.addEventListener('click', (e) => {
    if (!e.target.closest('.chat-bubble')) {
        document.querySelectorAll('.msg-menu').forEach(m => m.style.display = 'none');
    }
});

async function bulkClearData() {
    document.getElementById('clearDataModal').classList.remove('hidden');
}

function closeClearModal() {
    document.getElementById('clearDataModal').classList.add('hidden');
}

async function confirmDelete(target) {
    const doubleCheck = confirm(`Are you absolutely sure you want to delete all ${target}? This cannot be undone.`);
    if (!doubleCheck) return;

    try {
        const res = await fetch(`/api/admin/bulk/clear/${target}`, { method: 'DELETE' });
        
        // If server returns error page instead of JSON
        if (!res.ok) {
            const errorText = await res.text();
            console.error('Server Response:', errorText);
            alert(`Server Error (${res.status}): Please restart your server and try again.`);
            return;
        }

        const data = await res.json();
        if (data.success) {
            alert(data.message);
            location.reload();
        } else {
            alert("Error: " + data.message);
        }
    } catch (e) {
        console.error('Fetch Error:', e);
        alert("Connection error. Is the server running?");
    } finally {
        closeClearModal();
    }
}

function toggleUploadMode(mode) {
    const dropZone = document.getElementById('dataFileDropZone');
    const inputLabel = document.getElementById('fileInputLabel');
    const zoneIcon = document.getElementById('dropZoneIcon');
    const zoneText = document.getElementById('dropZoneText');
    const zoneSub = document.getElementById('dropZoneSub');
    
    if (mode === 'database') {
        dropZone.className = 'modern-drop-zone mode-database';
        inputLabel.textContent = 'Database Attachment (Excel Only)';
        zoneIcon.textContent = '📊';
        zoneText.innerHTML = 'Drag & Drop or <span>Click to Browse Excel</span>';
        zoneSub.textContent = 'Only .xlsx or .xls files accepted for Database mode';
    } else {
        dropZone.className = 'modern-drop-zone mode-document';
        inputLabel.textContent = 'File Attachment (General)';
        zoneIcon.textContent = '📄';
        zoneText.innerHTML = 'Drag & Drop or <span>Click to Browse Files</span>';
        zoneSub.textContent = 'PDF, Images, or Documents (Max 10MB)';
    }
}

async function handleDataUpload(e) {
    if (e) e.preventDefault();
    const btn = document.getElementById('dataUploadBtn');
    const fileField = document.getElementById('dataFileField');
    const mode = document.querySelector('input[name="uploadMode"]:checked').value;
    
    const file = fileField.files[0];
    if (!file) { alert("Please select a file to upload."); return; }

    const isExcel = file.name.match(/\.(xlsx|xls)$/i);
    
    if (mode === 'database' && !isExcel) {
        alert("❌ Error: You selected DATABASE mode, but provided a non-Excel file. Please provide an .xlsx or .xls file for database ingestion.");
        return;
    }

    const titleVal = document.getElementById('dataTitle').value.trim() || file.name.split('.')[0];
    const descVal = document.getElementById('dataDesc').value.trim() || 'Institutional document';

    const formData = new FormData();
    formData.append('title', titleVal);
    formData.append('description', descVal);
    formData.append('category', document.getElementById('dataCategory').value);
    formData.append('branch', document.getElementById('dataBranch').value);
    formData.append('role', document.getElementById('dataRole').value);
    formData.append('file', file);

    btn.disabled = true;
    const loadingMsg = mode === 'database' ? '⚙️ Ingesting Records into Database...' : '🚀 Publishing Document...';
    btn.innerHTML = `<div style="display:flex; align-items:center; justify-content:center; gap:10px;"><div class="spinner-small"></div> ${loadingMsg}</div>`;

    try {
        const res = await fetch('/api/admin/upload-data', {
            method: 'POST',
            body: formData
        });
        const data = await res.json();
        if (data.success) {
            const statusBox = document.getElementById('dataUploadStatus');
            const statusText = document.getElementById('dataStatusText');
            
            statusBox.classList.remove('hidden');
            statusText.textContent = data.message || "Data Published Successfully!";
            
            // Reset UI
            if (e && e.target) e.target.reset();
            resetFileLabel();
            loadAdminDataFiles();
            
            // Auto hide
            setTimeout(() => { statusBox.classList.add('hidden'); }, 5000);
        } else {
            alert("❌ Upload Failed: " + data.message);
        }
    } catch (err) { 
        alert("❌ Connection error. Upload failed."); 
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<span class="btn-content">⚡ Upload & Publish to Portal</span>';
    }
}

// Drag & Drop for Data
function handleDataDrop(e) {
    e.preventDefault();
    const dropZone = document.getElementById('dataFileDropZone');
    dropZone.classList.remove('dragover');
    
    const files = e.dataTransfer.files;
    if (files.length) {
        document.getElementById('dataFileField').files = files;
        updateFileLabel(document.getElementById('dataFileField'));
    }
}

function updateFileLabel(input) {
    const label = document.getElementById('fileSelectedLabel');
    if (input.files && input.files[0]) {
        label.textContent = `✅ Selected: ${input.files[0].name}`;
        label.classList.remove('hidden');
    } else {
        resetFileLabel();
    }
}

function resetFileLabel() {
    const label = document.getElementById('fileSelectedLabel');
    label.classList.add('hidden');
    label.textContent = '';
}

async function loadAdminDataFiles() {
    const list = document.getElementById('adminDataFileList');
    try {
        const res = await fetch('/api/admin/data-files');
        const data = await res.json();
        
        if (data.success) {
            if (data.files.length === 0) {
                list.innerHTML = `
                    <div style="flex-grow:1; display:flex; flex-direction:column; align-items:center; justify-content:center; opacity:0.5; padding:3rem 0;">
                        <span style="font-size:3rem; margin-bottom:1rem;">📂</span>
                        <p>No assets uploaded yet.</p>
                    </div>
                `;
                return;
            }

            list.innerHTML = data.files.map(f => {
                let icon = '📄';
                const ext = f.originalName.split('.').pop().toLowerCase();
                if (['jpg','jpeg','png','gif'].includes(ext)) icon = '🖼️';
                if (ext === 'pdf') icon = '📕';
                if (['xlsx','xls'].includes(ext)) icon = '📊';
                if (['doc','docx'].includes(ext)) icon = '📝';

                return `
                <div class="file-item-premium">
                    <div class="file-icon-box">${icon}</div>
                    <div class="file-meta-premium">
                        <h4>${f.title}</h4>
                        <p>${new Date(f.uploadedAt).toLocaleDateString()} | ${f.originalName}</p>
                    </div>
                    <div class="file-badge-premium">${f.category}</div>
                    <div class="action-btns">
                        <a href="${f.path}" target="_blank" class="btn-icon-only" title="View Resource">👁️</a>
                        <button class="btn-icon-only delete" onclick="deleteDataFile('${f._id}')" title="Delete Permanent">🗑️</button>
                    </div>
                </div>
                `;
            }).join('');
        }
    } catch (e) {
        list.innerHTML = `<p style="color:var(--danger); text-align:center; padding:1rem;">Failed to synchronize assets.</p>`;
    }
}

async function deleteDataFile(id) {
    if (!confirm("Delete this file permanently?")) return;
    try {
        const res = await fetch(`/api/admin/data-files/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) loadAdminDataFiles();
    } catch (e) { alert("Delete failed"); }
}

async function toggleDataAccess(id) {
    try {
        const res = await fetch(`/api/admin/students/${id}/data-access`, { method: 'PATCH' });
        const data = await res.json();
        if (data.success) {
            loadStudents(); 
        }
    } catch (e) {
        console.error("Access toggle failed", e);
    }
}

function togglePw(id, btn) {
    const input = document.getElementById(id);
    const isPw = input.type === 'password';
    input.type = isPw ? 'text' : 'password';
    btn.textContent = isPw ? '🔒' : '👁️';
}

function toggleSidebar() {
    const sidebar = document.querySelector('.sidebar');
    sidebar.classList.toggle('active');
}

function updateResultsFileLabel(input) {
    updateFileLabel(input, 'resSelectedBadge');
}

function updateFileLabel(input, badgeId = 'fileSelectedLabel') {
    const badge = document.getElementById(badgeId);
    if (input.files && input.files[0]) {
        badge.textContent = `✅ Selected: ${input.files[0].name}`;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}

async function handleResultsUpload() {
    const fileField = document.getElementById('resFile');
    const btn = document.getElementById('resultsMainUploadBtn');
    
    const file = fileField.files[0];
    if (!file) { alert("Please select an Excel results file first."); return; }

    const sem = document.getElementById('uploadResSem').value;
    const type = document.getElementById('uploadResType').value;
    const sub = document.getElementById('uploadResSub') ? document.getElementById('uploadResSub').value : '';
    const session = document.getElementById('uploadResSession').value;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('semester', sem);
    formData.append('examType', type);
    formData.append('examSession', session);

    try {
        btn.disabled = true;
        btn.innerHTML = `<div style="display:flex; align-items:center; justify-content:center; gap:10px;"><div class="spinner-small"></div> 🚀 Ingesting Records...</div>`;
        
        const res = await fetch('/api/admin/upload-results', {
            method: 'POST',
            body: formData
        });
        const data = await res.json();
        
        if (data.success) {
            alert("✅ Results Published Successfully!");
            fileField.value = '';
            document.getElementById('resSelectedBadge').classList.add('hidden');
            if (typeof loadAdminResults === 'function') loadAdminResults();
        } else {
            alert("❌ Upload failed: " + (data.message || 'Server error'));
        }
    } catch (err) {
        alert("❌ Error: " + err.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = `🚀 Upload & Publish Results`;
    }
}

// 📂 PREMIUM DATA ASSET ENGINE
function toggleUploadMode(mode) {
    const icon = document.getElementById('dropZoneIcon');
    const text = document.getElementById('dropZoneText');
    const label = document.getElementById('fileInputLabel');
    const dropZone = document.getElementById('dataFileDropZone');

    if (mode === 'database') {
        icon.textContent = '📊';
        text.innerHTML = 'Drag & Drop or <span>Click to Browse Excel</span>';
        label.textContent = 'Database Attachment (Excel Only)';
        dropZone.classList.add('mode-database');
        dropZone.classList.remove('mode-document');
    } else {
        icon.textContent = '📄';
        text.innerHTML = 'Drag & Drop or <span>Click to Browse Document</span>';
        label.textContent = 'Resource File (PDF / Image / Doc)';
        dropZone.classList.add('mode-document');
        dropZone.classList.remove('mode-database');
    }
}

function handleDataDrop(e) {
    e.preventDefault();
    const dropZone = e.currentTarget;
    dropZone.classList.remove('dragover');
    
    if (e.dataTransfer.files.length) {
        const fileField = document.getElementById('dataFileField');
        fileField.files = e.dataTransfer.files;
        updateFileLabel(fileField, 'fileSelectedLabel');
    }
}

async function handleDataUpload(e) {
    e.preventDefault();
    const btn = document.getElementById('dataUploadBtn');
    const status = document.getElementById('dataUploadStatus');
    const statusText = document.getElementById('dataStatusText');
    const fileField = document.getElementById('dataFileField');

    const title = document.getElementById('dataTitle').value;
    const desc = document.getElementById('dataDesc').value;
    const cat = document.getElementById('dataCategory').value;
    const branch = document.getElementById('dataBranch').value;
    const mode = document.querySelector('input[name="uploadMode"]:checked').value;

    if (!fileField.files[0]) { alert("Please select a file to publish."); return; }

    const formData = new FormData();
    formData.append('file', fileField.files[0]);
    formData.append('title', title);
    formData.append('description', desc);
    formData.append('category', cat);
    formData.append('branch', branch);
    formData.append('mode', mode);

    try {
        btn.disabled = true;
        btn.innerHTML = `<div style="display:flex; align-items:center; justify-content:center; gap:10px;"><div class="spinner-small"></div> Publishing...</div>`;
        
        const res = await fetch('/api/admin/data-upload', {
            method: 'POST',
            body: formData
        });
        const result = await res.json();
        
        if (result.success) {
            statusText.textContent = "Data Published Successfully!";
            status.classList.remove('hidden');
            document.getElementById('uploadDataForm').reset();
            document.getElementById('fileSelectedLabel').classList.add('hidden');
            toggleUploadMode('database'); // Reset to default
            setTimeout(() => status.classList.add('hidden'), 5000);
            if (typeof loadAdminDataFiles === 'function') loadAdminDataFiles();
        } else {
            alert("❌ Publication failed: " + result.message);
        }
    } catch (err) {
        alert("❌ Network Error: " + err.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = `⚡ Upload & Publish to Portal`;
    }
}
