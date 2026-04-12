let currentStudent = null;
let allResults = [];

// Format Semester (1 -> 1-1, 2 -> 1-2, etc)
function formatSem(num) {
    const s = parseInt(num);
    const map = { 1:'1-1', 2:'1-2', 3:'2-1', 4:'2-2', 5:'3-1', 6:'3-2', 7:'4-1', 8:'4-2' };
    return map[s] || s;
}

// Initialize
let socket;
let currentDataRole = null;
let currentDataBranch = 'All';
let resultsInitialized = false;
document.addEventListener('DOMContentLoaded', async () => {
    const session = await checkSession();
    if (session.loggedIn && session.role === 'student') {
        currentStudent = session.user;
        showDashboard();

        // ⚡ WEBSOCKET ENGINE
        if (!socket) socket = io();
        
        // Join my private room for timer/personal updates
        socket.emit('join', `room_${currentStudent.rollNumber}`);

        // Listen for Real-Time Events
        socket.on('results_updated', (data) => {
            console.log('📢 Real-time update: New assets published!');
            loadDashboardData(true);
            // If user is already on a DATA tab, refresh it instantly
            if (currentDataRole) loadStudentDataFiles();
        });

        socket.on('timer_updated', (data) => {
            console.log('⏰ Timer updated by admin');
            currentStudent.sessionExpiry = data.expiry;
            startSessionTimer(data.expiry);
        });

        socket.on('new_message', (data) => {
            if (document.querySelector('.content-section.active').id === 'section-chat') {
                loadMyChats();
            }
        });

        socket.on('access_updated', (data) => {
            console.log('🛡️ Security update: Data Access modified');
            currentStudent.hasDataAccess = data.hasDataAccess;
            const activeSec = document.querySelector('.content-section.active');
            if (activeSec && activeSec.id === 'section-data') {
                showSection('data', document.querySelector('[data-section=data]'));
            }
        });

    } else {
        showLogin();
    }
});

async function checkSession() {
    try {
        const res = await fetch('/api/auth/check');
        return await res.json();
    } catch (e) {
        return { loggedIn: false };
    }
}

function showLogin() {
    document.getElementById('loginScreen').classList.remove('hidden');
    document.getElementById('dashboard').classList.add('hidden');
}

function showDashboard() {
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('dashboard').classList.remove('hidden');
    
    // Update Sidebar/Topbar
    document.getElementById('sidebarName').textContent = currentStudent.name;
    document.getElementById('sidebarRoll').textContent = currentStudent.rollNumber;
    document.getElementById('sidebarBranch').textContent = currentStudent.branch;
    document.getElementById('topbarGreeting').textContent = `Hello, ${currentStudent.name.split(' ')[0]}!`;
    document.getElementById('sidebarAvatar').textContent = currentStudent.name[0];
    
    // Start Session Timer if active
    if (currentStudent.sessionExpiry) {
        startSessionTimer(currentStudent.sessionExpiry);
    }

    loadDashboardData();

    // Re-attach result filter listeners
    document.getElementById('filterSemester').onchange = handleSemChange;
    // (filterExamSub onchange is handled in handleSubChange now)
}

let timerInterval = null;
function startSessionTimer(expiryStr) {
    const timerBox = document.getElementById('sessionTimerBox');
    const timerDisplay = document.getElementById('sessionCountdown');
    const expiry = new Date(expiryStr).getTime();

    if (timerInterval) clearInterval(timerInterval);
    timerBox.classList.remove('hidden');

    timerInterval = setInterval(() => {
        const now = new Date().getTime();
        const distance = expiry - now;

        if (distance < 0) {
            clearInterval(timerInterval);
            timerDisplay.textContent = "00:00";
            alert("🔒 Your session has expired. You will be logged out.");
            logout();
            return;
        }

        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((distance % (1000 * 60)) / 1000);
        
        timerDisplay.textContent = 
            `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }, 1000);
}

function toggleSidebar() {
    document.querySelector('.sidebar').classList.toggle('active');
}

// ─── Auth View Toggling ───────────────────────────────────────────────────────
function toggleAuth(isRegister) {
    if (isRegister) {
        document.getElementById('loginView').classList.add('hidden');
        document.getElementById('registerView').classList.remove('hidden');
    } else {
        document.getElementById('registerView').classList.add('hidden');
        document.getElementById('loginView').classList.remove('hidden');
    }
}

// Login Handler
document.getElementById('loginForm').onsubmit = async (e) => {
    e.preventDefault();
    const rollNumber = document.getElementById('rollNumber').value.trim();
    const password = document.getElementById('password').value.trim();
    const errorEl = document.getElementById('loginError');
    const btn = document.getElementById('loginBtn');
    
    errorEl.classList.add('hidden');
    btn.disabled = true;
    btn.querySelector('.btn-loader').classList.remove('hidden');

    try {
        const res = await fetch('/api/auth/student/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rollNumber, password })
        });
        const data = await res.json();
        
        if (data.success) {
            currentStudent = data.student;
            showDashboard();
        } else {
            errorEl.textContent = data.message;
            errorEl.classList.remove('hidden');
        }
    } catch (err) {
        errorEl.textContent = "Connection error. Try again.";
        errorEl.classList.remove('hidden');
    } finally {
        btn.disabled = false;
        btn.querySelector('.btn-loader').classList.add('hidden');
    }
};

// Registration Handler
document.getElementById('registerForm').onsubmit = async (e) => {
    e.preventDefault();
    const btn = document.getElementById('registerBtn');
    const msg = document.getElementById('registerMsg');
    
    const body = {
        rollNumber: document.getElementById('regRoll').value.trim(),
        name:       document.getElementById('regName').value.trim(),
        email:      document.getElementById('regEmail').value.trim(),
        branch:     document.getElementById('regBranch').value,
        year:       document.getElementById('regYear').value,
        password:   document.getElementById('regPass').value.trim()
    };

    msg.classList.add('hidden');
    btn.disabled = true;

    try {
        const res = await fetch('/api/auth/student/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await res.json();

        if (data.success) {
            msg.textContent = data.message;
            msg.style.backgroundColor = '#dcfce7';
            msg.style.color = '#15803d';
            msg.style.borderColor = '#bbf7d0';
            msg.classList.remove('hidden');
            setTimeout(() => { toggleAuth(false); e.target.reset(); }, 2000);
        } else {
            msg.textContent = data.message;
            msg.style.backgroundColor = '#fee2e2';
            msg.style.color = '#991b1b';
            msg.style.borderColor = '#fecaca';
            msg.classList.remove('hidden');
        }
    } catch (err) {
        msg.textContent = "Registration failed. Server error.";
        msg.classList.remove('hidden');
    } finally {
        btn.disabled = false;
    }
};

async function loadDashboardData(isSilent) {
    try {
        // 1. Refresh Student Profile/Session (to catch Timer updates from Admin)
        const sessionRes = await fetch('/api/auth/check');
        const sessionData = await sessionRes.json();
        if (sessionData.loggedIn) {
            currentStudent = sessionData.user;
            if (currentStudent.sessionExpiry) {
                startSessionTimer(currentStudent.sessionExpiry);
            }
        }

        // 2. Load Results
        const res = await fetch('/api/results/my');
        const data = await res.json();
        
        if (data.success) {
            allResults = data.results;
            renderOverview();
            renderResults();
            renderProfile();
        }
    } catch (e) {
        console.error("Failed to load data", e);
    }
}

function renderOverview() {
    const stats = calculateStats(allResults);
    document.getElementById('statSemesters').textContent = stats.semCount;
    document.getElementById('statBestSgpa').textContent = stats.bestSgpa || '--';
    document.getElementById('statAvgPct').textContent = stats.avgPct ? stats.avgPct + '%' : '--';
    document.getElementById('statStatus').textContent = stats.overallResult;

    const container = document.getElementById('semesterCards');
    if (allResults.length === 0) {
        container.innerHTML = `<div class="info-msg">No results published yet.</div>`;
        return;
    }

    container.innerHTML = allResults.map(res => {
        const isSupply = res.examType.toLowerCase().includes('supply');
        const themeColor = isSupply ? '#7c3aed' : '#2563eb';
        const themeBg = isSupply ? '#f5f3ff' : '#eff6ff';
        
        return `
        <div class="sem-card modern" onclick="viewResultDetail('${res._id}')" style="border-left: 5px solid ${themeColor}; background: linear-gradient(to right, #ffffff, ${themeBg})">
            <div class="sem-card-main">
                <div class="sem-card-top">
                    <div class="sem-info-group">
                        <h3 class="sem-display-title">Semester ${formatSem(res.semester)}</h3>
                        <div class="sem-type-tag" style="background: ${themeColor}15; color: ${themeColor}">
                            ${isSupply ? '🎓 Supplementary' : '📜 Regular Examination'}
                        </div>
                    </div>
                    <div class="sem-session-badge">
                        <span class="session-lbl">EXAM MONTH</span>
                        <span class="session-val">${res.examSession || 'N/A'}</span>
                    </div>
                </div>

                <div class="sem-card-meta">
                    <div class="meta-item">📅 <span>Academic Year: <b>${res.academicYear}</b></span></div>
                    <div class="meta-item">📢 <span>Released: <b>${new Date(res.publishedAt).toLocaleDateString()}</b></span></div>
                </div>

                <div class="sem-card-bottom">
                    <div class="sem-score-grid">
                        <div class="score-box">
                            <label>SGPA</label>
                            <strong>${res.sgpa}</strong>
                        </div>
                        <div class="score-box">
                            <label>CGPA</label>
                            <strong>${res.cgpa || '--'}</strong>
                        </div>
                        <div class="score-box status">
                            <label>RESULT</label>
                            <strong class="${res.result.toLowerCase()}">${res.result.toUpperCase()}</strong>
                        </div>
                    </div>
                    <button class="btn-view-modern">
                        View Report <span class="arrow">→</span>
                    </button>
                </div>
            </div>
        </div>
        `;
    }).join('');
}

function calculateStats(results) {
    if (!results.length) return { semCount: 0, bestSgpa: 0, avgPct: 0, overallResult: 'N/A' };
    
    const sgpas = results.map(r => r.sgpa);
    const pcts = results.map(r => r.percentage);
    const hasFail = results.some(r => r.result === 'Fail');

    return {
        semCount: results.length,
        bestSgpa: Math.max(...sgpas),
        avgPct: (pcts.reduce((a, b) => a + b, 0) / pcts.length).toFixed(1),
        overallResult: hasFail ? 'Arrears' : 'Clear'
    };
}

async function viewResultDetail(id) {
    // ... logic exists ...
}

async function handleSemChange() {
    const sem = document.getElementById('filterSemester').value;
    const categoryWrap = document.getElementById('categoryPillsWrap');
    const subTypeWrap = document.getElementById('subTypeWrapper');
    
    // Reset state
    resultsInitialized = false;
    document.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
    document.getElementById('filterExamClass').value = '';
    subTypeWrap.style.display = 'none';

    if (sem) {
        categoryWrap.style.display = 'block';
    } else {
        categoryWrap.style.display = 'none';
    }
    renderResults();
}

function setPill(btn, val) {
    // UI Update
    document.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    
    // Logic Update
    document.getElementById('filterExamClass').value = val;
    resultsInitialized = false; // Still waiting for next step
    updateExamSubTypes();
}

function handleSubChange() {
    const val = document.getElementById('filterExamSub').value;
    resultsInitialized = !!val; // Only true if a specific type is selected
    renderResults();
}

function updateExamSubTypes() {
    const parent = document.getElementById('filterExamClass').value;
    const wrapper = document.getElementById('subTypeWrapper');
    const subSelect = document.getElementById('filterExamSub');
    const subLabel = document.getElementById('subTypeLabel');
    
    if (!parent) {
        wrapper.style.display = 'none';
        subSelect.innerHTML = '';
        renderResults();
        return;
    }

    wrapper.style.display = 'block';
    
    if (parent === 'Internal') {
        subLabel.textContent = "Internal Exam Type";
        subSelect.innerHTML = `
            <option value="">Select Exam Type</option>
            <option value="Mid-1">Mid-1 Exam</option>
            <option value="Mid-2">Mid-2 Exam</option>
            <option value="Assignment">Assignment</option>
        `;
    } else if (parent === 'External') {
        subLabel.textContent = "External Exam Type";
        subSelect.innerHTML = `
            <option value="">Select Exam Type</option>
            <option value="Regular">Regular (Main)</option>
            <option value="Supply">Supplementary (Supply)</option>
        `;
    }
    renderResults();
}


function renderResults() {
    const container = document.getElementById('resultsContainer');
    const semFilter = document.getElementById('filterSemester').value;
    const examClass = document.getElementById('filterExamClass').value;
    const examSub = document.getElementById('filterExamSub').value;
    const countLBL = document.getElementById('resultCountLBL');

    if (!resultsInitialized) {
        container.innerHTML = `
            <div class="section-card" style="box-shadow: none; border: 1px dashed var(--border); background: #f8fafc;">
              <div class="empty-state">
                <div class="empty-icon">📋</div>
                <h3>Your Results Portfolio</h3>
                <p>Please select a <b>Semester</b> or <b>Category</b> above to view your academic records.</p>
              </div>
            </div>
        `;
        countLBL.textContent = 'Awaiting selection...';
        return;
    }

    let filtered = allResults;
    if (semFilter) filtered = filtered.filter(r => r.semester == semFilter);
    
    if (examClass === 'Internal') {
        filtered = filtered.filter(r => r.examType.toLowerCase().includes('mid') || r.examType.toLowerCase().includes('assignment'));
    } else if (examClass === 'External') {
        filtered = filtered.filter(r => !r.examType.toLowerCase().includes('mid') && !r.examType.toLowerCase().includes('assignment'));
    }

    if (examSub) {
        filtered = filtered.filter(r => r.examType.toLowerCase() === examSub.toLowerCase() || r.examType.toLowerCase().includes(examSub.toLowerCase()));
    }

    // Update count label
    countLBL.textContent = filtered.length === allResults.length ? `Showing all ${filtered.length} records` : `Found ${filtered.length} matches`;


    if (!filtered.length) {
        container.innerHTML = `<div class="section-card"><p style="text-align:center;padding:2rem;">No results match your filters.</p></div>`;
        return;
    }

    container.innerHTML = filtered.map(res => {
        const isExt = !res.examType.toLowerCase().includes('mid') && !res.examType.toLowerCase().includes('assignment');
        return `
        <div class="section-card" style="margin-bottom:1.5rem;padding:1.5rem;animation:slideIn 0.3s ease-out">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:1rem">
                <div>
                    <h3 style="margin:0;color:var(--secondary)">Semester ${res.semester} — ${res.examType}</h3>
                    <small style="color:grey">${res.academicYear} | Published: ${new Date(res.publishedAt).toLocaleDateString()}</small>
                    ${isExt ? `<div style="margin-top:4px;font-size:0.82rem;color:var(--text-muted)">SGPA: <strong>${res.sgpa}</strong>${res.cgpa ? ` &nbsp;|&nbsp; CGPA: <strong>${res.cgpa}</strong>` : ''}</div>` : ''}
                </div>
                <button class="btn-browse" onclick="viewResultDetail('${res._id}')">View Details</button>
            </div>
        </div>`;
    }).join('');
}


async function viewResultDetail(id) {
    try {
        const res = await fetch(`/api/results/${id}`);
        const data = await res.json();

        if (data.success) {
            const r = data.result;
            const modal = document.getElementById('resultModal');
            const isInternal = r.examType.toLowerCase().includes('mid') || r.examType.toLowerCase().includes('assignment');
            const isPassed   = r.result === 'Pass';

            // ── Grade colour map ──
            const gradeColor = (g) => {
                g = (g || '').toUpperCase();
                if (g === 'O')  return { bg:'#fef9c3', color:'#854d0e', border:'#fde047' };
                if (g === 'A+') return { bg:'#dcfce7', color:'#15803d', border:'#86efac' };
                if (g === 'A')  return { bg:'#d1fae5', color:'#065f46', border:'#6ee7b7' };
                if (g === 'B+') return { bg:'#dbeafe', color:'#1e40af', border:'#93c5fd' };
                if (g === 'B')  return { bg:'#ede9fe', color:'#5b21b6', border:'#c4b5fd' };
                if (g === 'C')  return { bg:'#fff7ed', color:'#c2410c', border:'#fed7aa' };
                if (g === 'F')  return { bg:'#fee2e2', color:'#991b1b', border:'#fca5a5' };
                return           { bg:'#f1f5f9', color:'#475569', border:'#cbd5e1' };
            };

            // ── Status pill for FinalPassedName ──
            const statusPill = (s) => {
                s = (s || '').toLowerCase();
                if (s.includes('fail'))   return `<span style="background:#fee2e2;color:#991b1b;padding:3px 12px;border-radius:20px;font-size:0.78rem;font-weight:700;letter-spacing:.3px">FAILED</span>`;
                if (s.includes('absent')) return `<span style="background:#fef9c3;color:#854d0e;padding:3px 12px;border-radius:20px;font-size:0.78rem;font-weight:700">ABSENT</span>`;
                if (s.includes('with'))   return `<span style="background:#ede9fe;color:#5b21b6;padding:3px 12px;border-radius:20px;font-size:0.78rem;font-weight:700">WITHHELD</span>`;
                return `<span style="background:#dcfce7;color:#15803d;padding:3px 12px;border-radius:20px;font-size:0.78rem;font-weight:700;letter-spacing:.3px">PASSED</span>`;
            };

            // ── Grade badge ──
            const gradeBadge = (g) => {
                const c = gradeColor(g);
                return `<span style="background:${c.bg};color:${c.color};border:1.5px solid ${c.border};padding:3px 12px;border-radius:20px;font-size:0.82rem;font-weight:800;min-width:36px;display:inline-block;text-align:center">${g || '—'}</span>`;
            };

            // ── Course type pill ──
            const typePill = (t) => {
                const isLab = (t||'').toLowerCase().includes('lab') || (t||'').toLowerCase().includes('practical');
                const isDraw = (t||'').toLowerCase().includes('draw');
                const bg    = isLab ? '#f0fdf4' : isDraw ? '#fff7ed' : '#eff6ff';
                const cl    = isLab ? '#15803d' : isDraw ? '#c2410c' : '#1d4ed8';
                const bd    = isLab ? '#86efac' : isDraw ? '#fed7aa' : '#93c5fd';
                return `<span style="background:${bg};color:${cl};border:1px solid ${bd};padding:2px 10px;border-radius:20px;font-size:0.75rem;font-weight:600;white-space:nowrap">${t || '—'}</span>`;
            };

            const totalCredits = r.subjects.reduce((a, s) => a + (s.credits || 0), 0);

            // ── Premium Result Card HTML ──
            document.getElementById('modalContent').innerHTML = `

                <!-- ── Institution Header ── -->
                <div style="background:linear-gradient(135deg,#1e3a5f 0%,#2563eb 100%);padding:1.5rem 2rem;border-radius:16px 16px 0 0;margin:-1.5rem -1.5rem 0 -1.5rem;display:flex;justify-content:space-between;align-items:center">
                    <div>
                        <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px">
                            <span style="font-size:1.6rem">🎓</span>
                            <span style="color:#fff;font-size:1.15rem;font-weight:800;letter-spacing:.5px">Kits Result</span>
                        </div>
                        <p style="margin:0;color:rgba(255,255,255,0.75);font-size:0.82rem">
                            ${isInternal ? 'Internal Assessment' : 'Examination'} Result Card &nbsp;·&nbsp;
                            Semester ${formatSem(r.semester)} &nbsp;·&nbsp; ${r.examType}${r.examSession ? ` (${r.examSession})` : ''}
                        </p>
                    </div>
                    <div style="display:flex;align-items:center;gap:1rem">
                        <div style="background:${isPassed?'rgba(34,197,94,0.25)':'rgba(239,68,68,0.25)'};border:2px solid ${isPassed?'#4ade80':'#f87171'};border-radius:12px;padding:6px 18px;text-align:center">
                            <div style="color:${isPassed?'#4ade80':'#fca5a5'};font-size:0.7rem;font-weight:600;letter-spacing:1px">${isPassed?'RESULT':'RESULT'}</div>
                            <div style="color:${isPassed?'#4ade80':'#f87171'};font-size:1.1rem;font-weight:800">${r.result.toUpperCase()}</div>
                        </div>
                        <button onclick="closeModal()" style="background:rgba(255,255,255,0.15);border:none;color:white;width:36px;height:36px;border-radius:50%;font-size:1.2rem;cursor:pointer;display:flex;align-items:center;justify-content:center">&times;</button>
                    </div>
                </div>

                <!-- ── Student Info Grid ── -->
                <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:0;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;margin:1.5rem 0 1rem 0">
                    ${[
                        ['Roll Number', r.rollNumber],
                        ['Student Name', r.studentName],
                        ['Branch', r.branch],
                        ['Academic Year', r.academicYear],
                        ['Semester', `Sem ${formatSem(r.semester)}`],
                        ['SGPA', r.sgpa],
                        ['CGPA', r.cgpa || '--'],
                        ['Examination Year', r.examSession || '--']
                    ].map((item, i) => `
                        <div style="padding:0.85rem 1.1rem;background:${i%2===0?'#f8fafc':'#fff'};border-right:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0">
                            <div style="font-size:0.65rem;font-weight:700;color:#94a3b8;letter-spacing:.8px;text-transform:uppercase;margin-bottom:3px">${item[0]}</div>
                            <div style="font-size:0.95rem;font-weight:700;color:#1e293b">${item[1]}</div>
                        </div>`).join('')}
                </div>

                <!-- ── Subjects Table ── -->
                <div style="border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;margin-bottom:1rem;overflow-x:auto;-webkit-overflow-scrolling:touch">
                    <table style="width:100%;border-collapse:collapse;min-width:${isInternal?'500px':'700px'}">
                        <thead>
                            <tr style="background:linear-gradient(90deg,#1e3a5f,#2563eb)">
                                ${isInternal ? `
                                <th style="padding:10px 14px;color:#fff;font-size:0.72rem;font-weight:700;letter-spacing:.6px;text-align:left">SUBJECT NAME</th>
                                <th style="padding:10px 14px;color:#fff;font-size:0.72rem;font-weight:700;letter-spacing:.6px;text-align:center">MARKS</th>
                                <th style="padding:10px 14px;color:#fff;font-size:0.72rem;font-weight:700;letter-spacing:.6px;text-align:center">MAX</th>
                                <th style="padding:10px 14px;color:#fff;font-size:0.72rem;font-weight:700;letter-spacing:.6px;text-align:center">GRADE</th>
                                <th style="padding:10px 14px;color:#fff;font-size:0.72rem;font-weight:700;letter-spacing:.6px;text-align:center">STATUS</th>
                                ` : `
                                <th style="padding:10px 14px;color:#fff;font-size:0.72rem;font-weight:700;letter-spacing:.6px;text-align:left">COURSE CODE</th>
                                <th style="padding:10px 14px;color:#fff;font-size:0.72rem;font-weight:700;letter-spacing:.6px;text-align:left">COURSE NAME</th>
                                <th style="padding:10px 14px;color:#fff;font-size:0.72rem;font-weight:700;letter-spacing:.6px;text-align:center">TYPE</th>
                                <th style="padding:10px 14px;color:#fff;font-size:0.72rem;font-weight:700;letter-spacing:.6px;text-align:center">RESULT</th>
                                <th style="padding:10px 14px;color:#fff;font-size:0.72rem;font-weight:700;letter-spacing:.6px;text-align:center">GRADE</th>
                                <th style="padding:10px 14px;color:#fff;font-size:0.72rem;font-weight:700;letter-spacing:.6px;text-align:center">CREDITS</th>
                                `}
                            </tr>
                        </thead>
                        <tbody>
                            ${r.subjects.map((s, i) => isInternal ? `
                            <tr style="background:${i%2===0?'#fff':'#f8fafc'};border-bottom:1px solid #f1f5f9">
                                <td style="padding:11px 14px;font-size:0.88rem;color:#1e293b">${s.name}</td>
                                <td style="padding:11px 14px;font-size:0.88rem;font-weight:700;color:#1e293b;text-align:center">${s.internalMarks}</td>
                                <td style="padding:11px 14px;font-size:0.88rem;color:#64748b;text-align:center">${s.maxMarks}</td>
                                <td style="padding:11px 14px;text-align:center">${gradeBadge(s.grade)}</td>
                                <td style="padding:11px 14px;text-align:center">${statusPill(s.finalPassedName || s.status)}</td>
                            </tr>` : `
                            <tr style="background:${i%2===0?'#fff':'#f8fafc'};border-bottom:1px solid #f1f5f9">
                                <td style="padding:11px 14px;font-size:0.82rem;font-weight:700;color:#2563eb;font-family:monospace">${s.code}</td>
                                <td style="padding:11px 14px;font-size:0.88rem;color:#1e293b;min-width:180px">${s.name}</td>
                                <td style="padding:11px 14px;text-align:center">${typePill(s.courseType)}</td>
                                <td style="padding:11px 14px;text-align:center">${statusPill(s.finalPassedName)}</td>
                                <td style="padding:11px 14px;text-align:center">${gradeBadge(s.grade)}</td>
                                <td style="padding:11px 14px;text-align:center;font-weight:700;color:#1e293b;font-size:0.95rem">${s.credits}</td>
                            </tr>`).join('')}
                        </tbody>
                    </table>
                </div>

                <!-- ── Summary Footer ── -->
                <div style="background:linear-gradient(135deg,#f8fafc,#eff6ff);border:1px solid #e2e8f0;border-radius:12px;padding:1rem 1.5rem;display:flex;flex-wrap:wrap;gap:1.5rem;align-items:center;justify-content:space-between">
                    <div style="display:flex;flex-wrap:wrap;gap:1.5rem">
                        ${!isInternal ? `
                        <div style="text-align:center">
                            <div style="font-size:0.65rem;font-weight:700;color:#94a3b8;letter-spacing:.8px">SGPA</div>
                            <div style="font-size:1.4rem;font-weight:800;color:#2563eb">${r.sgpa}</div>
                        </div>
                        ${r.cgpa ? `<div style="text-align:center">
                            <div style="font-size:0.65rem;font-weight:700;color:#94a3b8;letter-spacing:.8px">CGPA</div>
                            <div style="font-size:1.4rem;font-weight:800;color:#7c3aed">${r.cgpa}</div>
                        </div>` : ''}
                        <div style="text-align:center">
                            <div style="font-size:0.65rem;font-weight:700;color:#94a3b8;letter-spacing:.8px">TOTAL CREDITS</div>
                            <div style="font-size:1.4rem;font-weight:800;color:#0f766e">${totalCredits}</div>
                        </div>` : `
                        <div style="text-align:center">
                            <div style="font-size:0.65rem;font-weight:700;color:#94a3b8;letter-spacing:.8px">PERCENTAGE</div>
                            <div style="font-size:1.4rem;font-weight:800;color:#2563eb">${r.percentage}%</div>
                        </div>`}
                    </div>
                    <div style="background:${isPassed?'#dcfce7':'#fee2e2'};border:2px solid ${isPassed?'#86efac':'#fca5a5'};border-radius:10px;padding:8px 24px;text-align:center">
                        <div style="font-size:0.65rem;font-weight:700;color:${isPassed?'#15803d':'#991b1b'};letter-spacing:1px">FINAL RESULT</div>
                        <div style="font-size:1.25rem;font-weight:800;color:${isPassed?'#15803d':'#dc2626'}">${r.result.toUpperCase()}</div>
                    </div>
                </div>
            `;
            modal.classList.remove('hidden');
        }
    } catch (e) {
        alert("Could not load result details.");
    }
}

function renderProfile() {
    const s = currentStudent;
    document.getElementById('profileDetails').innerHTML = `
        <div class="profile-item"><label>Full Name</label><span>${s.name}</span></div>
        <div class="profile-item"><label>Roll Number</label><span>${s.rollNumber}</span></div>
        <div class="profile-item"><label>Email Address</label><span>${s.email || '--'}</span></div>
        <div class="profile-item"><label>Branch / Dept</label><span>${s.branch}</span></div>
        <div class="profile-item"><label>Current Year</label><span>Year ${s.year}</span></div>
        <div class="profile-item"><label>Section</label><span>${s.section}</span></div>
        <div class="profile-item"><label>Father's Name</label><span>${s.fatherName || '--'}</span></div>
        <div class="profile-item"><label>Phone</label><span>${s.phone || '--'}</span></div>
    `;
}

function showSection(sectionId, el) {
    document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(`section-${sectionId}`);
    target.classList.add('active');
    
    // Auto-close sidebar on mobile
    if (window.innerWidth <= 1024) {
        document.querySelector('.sidebar').classList.remove('active');
    }
    
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    el.classList.add('active');
    
    // 🔒 DATA Access Control
    if (sectionId === 'data') {
        const wrapper = document.getElementById('dataContentWrapper');
        const locked = document.getElementById('dataLockedScreen');
        if (currentStudent.hasDataAccess) {
            wrapper.classList.remove('hidden');
            locked.classList.add('hidden');
            document.getElementById('topbarTitle').textContent = "Data Repository";
            loadStudentDataFiles();
        } else {
            wrapper.classList.add('hidden');
            locked.classList.remove('hidden');
            document.getElementById('topbarTitle').textContent = "Access Restricted";
        }
    } else {
        document.getElementById('topbarTitle').textContent = el.textContent.trim().replace(/[^\w\s]/gi, '');
    }
}

function closeModal() {
    document.getElementById('resultModal').classList.add('hidden');
}

async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.reload();
}

function togglePw(id, btn) {
    const input = document.getElementById(id);
    const isPw = input.type === 'password';
    input.type = isPw ? 'text' : 'password';
    btn.textContent = isPw ? '🔒' : '👁️';
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

let currentChatReplyId = null;

// Initialize Socket listeners for Chat
if (typeof io !== 'undefined' && !socket) socket = io();
if (socket) {
    socket.on('new_message', () => loadMyChats());
    socket.on('messages_seen', () => loadMyChats());
    socket.on('message_updated', () => loadMyChats());
}

async function loadMyChats() {
    try {
        const res = await fetch('/api/chat/my');
        const data = await res.json();
        if (data.success) {
            renderChats(data.chats, 'studentChatMsgs', currentStudent.rollNumber);
            if (document.getElementById('section-chat').classList.contains('active')) {
                markSeen('admin');
            }
        }
    } catch (e) {}
}

async function sendStudentChat() {
    const input = document.getElementById('studentChatInput');
    const msg = input.value.trim();
    if (!msg) return;

    try {
        const res = await fetch('/api/chat/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                message: msg, 
                receiverRoll: 'admin',
                replyTo: currentChatReplyId
            })
        });
        if ((await res.json()).success) {
            input.value = '';
            cancelReply();
            loadMyChats();
        }
    } catch (e) {}
}

function renderChats(chats, containerId, myRoll) {
    const container = document.getElementById(containerId);
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

                <div class="chat-sender">${isMe ? 'You' : 'Admin'}</div>
                
                ${replyMsg ? `
                    <div class="reply-quote">
                        <strong>${replyMsg.senderRoll === myRoll ? 'You' : 'Admin'}:</strong> ${replyMsg.message}
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
    currentChatReplyId = id;
    const preview = document.getElementById('chatReplyPreview');
    preview.innerHTML = `
        <div class="reply-preview">
            <span class="reply-preview-text">Replying to: "${text}"</span>
            <button onclick="cancelReply()" style="background:none; border:none; cursor:pointer">✕</button>
        </div>
    `;
    document.getElementById('studentChatInput').focus();
    toggleMsgMenu(id);
}

function cancelReply() {
    currentChatReplyId = null;
    document.getElementById('chatReplyPreview').innerHTML = '';
}

function copyMsg(text) {
    navigator.clipboard.writeText(text);
    alert("Message copied!");
}

async function editMsg(id, oldText) {
    const newText = prompt("Edit your message:", oldText);
    if (!newText || newText === oldText) return;
    try {
        await fetch(`/api/chat/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: newText })
        });
        loadMyChats();
    } catch (e) {}
}

async function deleteMsg(id) {
    if (!confirm("Delete this message for everyone?")) return;
    try {
        await fetch(`/api/chat/${id}`, { method: 'DELETE' });
        loadMyChats();
    } catch (e) {}
}

function switchDataTab(role, btn) {
    currentDataRole = role;
    currentDataBranch = 'All'; // Reset branch on role switch
    document.querySelectorAll('.data-tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');

    // Clear student info card when switching tabs
    document.getElementById('studentProfileInfo').innerHTML = '';

    // Show/Hide branch sidebar
    const sidebar = document.getElementById('dataBranchSidebar');
    if (role === 'Students') {
        sidebar.style.display = 'flex';
        // Reset sub-nav highlight to 'All'
        document.querySelectorAll('.branch-nav-item').forEach(b => b.classList.remove('active'));
        document.querySelector('.branch-nav-item[onclick*="All"]').classList.add('active');
    } else {
        sidebar.style.display = 'none';
    }

    loadStudentDataFiles();
}

function switchBranchData(branch, btn) {
    currentDataBranch = branch;
    document.querySelectorAll('.branch-nav-item').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    loadStudentDataFiles();
}

async function handleHtnoSearch() {
    const searchVal = document.getElementById('dataSearchInput').value.trim();
    if (!searchVal) return alert("Please enter a Hall Ticket Number to search.");

    try {
        const res = await fetch(`/api/results/student-info/${searchVal}`);
        const data = await res.json();
        const infoBox = document.getElementById('studentProfileInfo');
        
        if (data.success) {
            const s = data.student;
            infoBox.innerHTML = `
                <div class="profile-card-modern">
                    <div class="profile-avatar-big">${s.name.charAt(0)}</div>
                    <div class="profile-details-modern">
                        <h3>${s.name}</h3>
                        <p>${s.rollNumber} | ${s.email || 'No Email'}</p>
                        <div class="profile-meta-chips">
                            <span class="profile-chip">${s.branch}</span>
                            <span class="profile-chip">Year ${s.year}</span>
                            <span class="profile-chip">Section ${s.section || 'A'}</span>
                        </div>
                    </div>
                </div>
            `;
        } else {
            infoBox.innerHTML = `<div class="error-msg" style="margin-bottom:1rem">Note: No matching student profile found. Showing related files only.</div>`;
        }
    } catch (err) {
        console.error("Profile fetch error:", err);
    }

    // Force switch to Students tab
    currentDataRole = 'Students';
    currentDataBranch = 'All';
    
    // UI Update
    document.querySelectorAll('.data-tab').forEach(t => t.classList.remove('active'));
    document.getElementById('tab-Students').classList.add('active');
    
    // Hide branch sidebar during direct Htno search as requested
    const sidebar = document.getElementById('dataBranchSidebar');
    sidebar.style.display = 'none';

    loadStudentDataFiles();
}

async function loadStudentDataFiles() {
    const container = document.getElementById('dataFilesContainer');
    if (!currentDataRole) {
        container.innerHTML = `
            <div class="section-card">
              <div class="empty-state">
                <div class="empty-icon">📂</div>
                <h3>Welcome to Data Repository</h3>
                <p>Please select <b>Students</b> or <b>Faculty</b>, or search by <b>Htno</b> to view resources.</p>
              </div>
            </div>
        `;
        return;
    }

    try {
        const search = document.getElementById('dataSearchInput').value.trim();
        const query = `role=${currentDataRole}&branch=${currentDataBranch}&search=${encodeURIComponent(search)}`;
        const res = await fetch(`/api/results/data/files?${query}`);
        const data = await res.json();
        
        if (data.success) {
            if (data.files.length === 0) {
                container.innerHTML = `
                    <div class="section-card">
                        <div class="empty-state" style="padding: 4rem 1rem; text-align: center;">
                            <div style="font-size: 3rem; margin-bottom: 1rem;">📂</div>
                            <h3>No data files yet</h3>
                            <p style="color: grey;">Check back later for academic resources or notices.</p>
                        </div>
                    </div>
                `;
                return;
            }

            container.innerHTML = `
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1.5rem;">
                    ${data.files.map(f => `
                        <div class="section-card result-history-item" style="flex-direction: column; align-items: flex-start; gap: 1rem; border-left: 5px solid var(--primary);">
                            <div style="width: 100%;">
                                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                                    <span class="grade-badge" style="background: var(--primary-light); color: var(--primary); font-size: 0.65rem;">${f.category}</span>
                                    <small style="color: grey;">${new Date(f.uploadedAt).toLocaleDateString()}</small>
                                </div>
                                <h3 style="margin: 0.5rem 0 0.25rem 0; font-size: 1.1rem; color: var(--secondary)">${f.title}</h3>
                                <p style="margin: 0; font-size: 0.85rem; color: #64748b; line-height: 1.4;">${f.description || 'Institutional document'}</p>
                            </div>
                            <div style="width: 100%; padding-top: 1rem; border-top: 1px solid #f1f5f9; display: flex; justify-content: space-between; align-items: center;">
                                <div style="display: flex; align-items: center; gap: 0.5rem;">
                                    <span style="font-size: 1.2rem;">📄</span>
                                    <span style="font-size: 0.75rem; color: grey;">${f.originalName}</span>
                                </div>
                                <a href="${f.path}" target="_blank" class="btn-primary" style="padding: 0.5rem 1rem; font-size: 0.8rem; text-decoration: none; border-radius: 6px;">View</a>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
        }
    } catch (e) {
        console.error("Failed to load data files", e);
    }
}

async function handlePasswordUpdate(e) {
    e.preventDefault();
    const oldPassword = document.getElementById('oldPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const btn = document.getElementById('pwUpdateBtn');
    const msg = document.getElementById('pwUpdateMsg');

    if (newPassword.length < 6) return alert("New password must be at least 6 characters long.");

    try {
        btn.disabled = true;
        btn.textContent = "Updating...";
        
        const res = await fetch('/api/auth/student/update-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ oldPassword, newPassword })
        });
        const data = await res.json();
        
        msg.classList.remove('hidden');
        if (data.success) {
            msg.style.color = "var(--success)";
            msg.textContent = "✅ " + data.message;
            e.target.reset();
        } else {
            msg.style.color = "var(--danger)";
            msg.textContent = "❌ " + data.message;
        }
    } catch (err) {
        alert("Failed to connect to server");
    } finally {
        btn.disabled = false;
        btn.textContent = "Update Password";
        setTimeout(() => { msg.classList.add('hidden'); }, 4000);
    }
}

function toggleSidebar() {
    const sidebar = document.querySelector('.sidebar');
    sidebar.classList.toggle('active');
}

// Close menus on click outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('.chat-bubble')) {
        document.querySelectorAll('.msg-menu').forEach(m => m.style.display = 'none');
    }
});
async function lookupStudentInfo() {
    const roll = document.getElementById('lookupRoll').value.trim().toUpperCase();
    const resultBox = document.getElementById('lookupResult');
    const errorBox = document.getElementById('lookupError');

    if (!roll) { alert("Please enter a Hall Ticket Number."); return; }

    try {
        const res = await fetch(`/api/results/student-info/${roll}`);
        const data = await res.json();

        if (data.success) {
            const s = data.student;
            document.getElementById('lookupName').textContent = s.name;
            document.getElementById('lookupRollDisplay').textContent = s.rollNumber;
            document.getElementById('lookupBranch').textContent = s.branch;
            document.getElementById('lookupInitial').textContent = s.name.charAt(0);
            
            resultBox.classList.remove('hidden');
            errorBox.classList.add('hidden');
        } else {
            resultBox.classList.add('hidden');
            errorBox.classList.remove('hidden');
        }
    } catch (e) {
        alert("Error connecting to server.");
    }
}
