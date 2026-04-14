const express = require('express');
const router = express.Router();
const multer = require('multer');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const Student = require('../models/Student');
const Result = require('../models/Result');
const UploadHistory = require('../models/UploadHistory');
const DataFile = require('../models/DataFile');

// Multer config for Excel uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, `upload_${Date.now()}${path.extname(file.originalname)}`);
  }
});
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.xlsx' || ext === '.xls') return cb(null, true);
    cb(new Error('Only Excel files are allowed!'));
  }
});

// Multer for general DATA files (PDF, JPG, PNG, DOCX, XLSX, etc.)
const dataUpload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// ─── Admin Auth Middleware ────────────────────────────────────────────────────
const isAdmin = (req, res, next) => {
  if (!req.session.admin)
    return res.status(401).json({ success: false, message: 'Unauthorized. Admin login required.' });
  next();
};

// ─── Helper: Calculate Grade ──────────────────────────────────────────────────
const calculateGrade = (percentage) => {
  if (percentage >= 90) return { grade: 'O',  gradePoints: 10 };
  if (percentage >= 80) return { grade: 'A+', gradePoints: 9 };
  if (percentage >= 70) return { grade: 'A',  gradePoints: 8 };
  if (percentage >= 60) return { grade: 'B+', gradePoints: 7 };
  if (percentage >= 50) return { grade: 'B',  gradePoints: 6 };
  if (percentage >= 40) return { grade: 'C',  gradePoints: 5 };
  return { grade: 'F', gradePoints: 0 };
};

// ─── Helper: Fuzzy Column Matcher ─────────────────────────────────────────────
const findVal = (row, keys) => {
  const rowKeys = Object.keys(row);
  for (const k of keys) {
    const found = rowKeys.find(rk => rk.toLowerCase().replace(/[^a-z0-9]/g, '') === k.toLowerCase().replace(/[^a-z0-9]/g, ''));
    if (found) return row[found];
  }
  return null;
};

// ─── Upload Students from Excel ───────────────────────────────────────────────
router.post('/upload-students', isAdmin, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });

    const workbook = XLSX.readFile(req.file.path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(sheet);

    if (!data.length) return res.status(400).json({ success: false, message: 'Excel file is empty' });

    const history = new UploadHistory({
      filename: req.file.originalname,
      uploadType: 'Students',
      uploadedBy: req.session.admin.username,
      status: 'In Progress'
    });
    await history.save();

    const bulkOps = [];
    let processed = 0;

    for (const row of data) {
      const rollRaw = findVal(row, ['HallTicketNo', 'Admissionno', 'Roll Number', 'Roll No', 'RollNo', 'HTNO', 'HT No', 'Student ID', 'Reg No']);
      const rollNumber = String(rollRaw || '').trim().toUpperCase();
      if (!rollNumber) continue;

      const nameRaw = findVal(row, ['StudentName', 'name', 'Student Name', 'Full Name', 'Name of the Student']);
      const emailRaw= findVal(row, ['StudentEmail', 'studentemail', 'Email', 'Email ID', 'Student Email', 'Mail ID']);
      
      const name      = String(nameRaw || 'Student').trim();
      const email     = String(emailRaw || '').trim().toLowerCase() || `${rollNumber.toLowerCase()}@college.edu`;
      const branch    = String(findVal(row, ['BranchName', 'branchname', 'Branch', 'Dept']) || 'CSE').trim();
      const year      = parseInt(findVal(row, ['Semester', 'batch', 'Year']) || 1);
      
      const updateData = {
        name, 
        email, 
        branch, 
        year,
        uploadId: history._id,
        phone: String(findVal(row, ['StudMobile', 'Phone', 'Mobile']) || '').trim(),
        fatherName: String(findVal(row, ['FatherName', 'Father Name']) || '').trim(),
        dob: String(findVal(row, ['DateOfBirth', 'DOB']) || '').trim(),
        isActive: true,
        hasDataAccess: true
      };

      bulkOps.push({
        updateOne: {
          filter: { rollNumber },
          update: { 
            $set: updateData,
            $setOnInsert: { password: rollNumber.toLowerCase() } 
          },
          upsert: true
        }
      });
      processed++;
    }

    if (bulkOps.length > 0) {
      await Student.bulkWrite(bulkOps);
    }

    req.app.get('io').emit('upload_progress', { 
        type: 'Students',
        processed, 
        total: processed,
        percent: 100
    });

    await UploadHistory.findByIdAndUpdate(history._id, { recordsCount: processed, status: 'Success' });
    if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    
    res.json({ success: true, message: `Upload Complete!`, details: `Processed ${processed} students.` });
  } catch (err) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ success: false, message: 'Upload failed: ' + err.message });
  }
});

// ─── Upload Results from Excel ────────────────────────────────────────────────
router.post('/upload-results', isAdmin, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });

    const workbook = XLSX.readFile(req.file.path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    // 🚀 LOSSLESS READER: Ensures 100% data capture
    const data = XLSX.utils.sheet_to_json(sheet, { raw: false, defval: "" });

    if (!data.length) return res.status(400).json({ success: false, message: 'Excel file is empty' });

    // 📜 Create History Record First
    const history = new UploadHistory({
      filename:   req.file.originalname,
      uploadType: 'Results',
      semester:   req.body.semester ? parseInt(req.body.semester) : null,
      examType:   req.body.examType || '',
      examSession: req.body.examSession || '',
      uploadedBy: req.session.admin.username,
      status:     'In Progress'
    });
    await history.save();

    let created = 0, failedRows = 0;
    let errors = [];
    const grouped = {};
    const parseNum = (val) => {
      if (typeof val === 'number') return val;
      if (!val) return 0;
      const cleaned = String(val).replace(/[^0-9.]/g, '');
      return parseFloat(cleaned) || 0;
    };

    for (const row of data) {
      const rollNumber   = String(findVal(row, ['Admissionno', 'Roll Number', 'RollNo', 'ID']) || '').trim().toUpperCase();
      const semester     = req.body.semester ? parseInt(req.body.semester) : parseNum(findVal(row, ['semester', 'Sem']));
      const examType     = req.body.examType || String(findVal(row, ['program name', 'Exam Type', 'ExamType']) || 'Regular').trim();
      const examSession  = req.body.examSession || String(findVal(row, ['Exam Session', 'Session', 'MonthYear']) || '').trim();
      const academicYear = String(findVal(row, ['Ac year', 'Academic Year', 'AY']) || '2023-24').trim();
      
      if (!rollNumber) {
        failedRows++;
        continue;
      }

      const key = `${rollNumber}_${semester}_${examType}_${examSession}_${academicYear}`;
      
      // 🛰️ HIGH-PRECISION HORIZONTAL PARSING: Handle 5 Courses per Row (Mid Format)
      const subjectsArray = [];
      const isInternal = examType.toLowerCase().includes('mid') || examType.toLowerCase().includes('assign');

      if (isInternal && findVal(row, ['Course1Name'])) {
        for (let i = 1; i <= 5; i++) {
          const name = String(findVal(row, [`Course${i}Name`, `CourseId${i}`]) || '').trim();
          const code = String(findVal(row, [`Course${i}Code`, `Course${i}Code`]) || '').trim();
          const desc = parseNum(findVal(row, [`Course${i}DescriptiveMarks`, `Course${i}Descriptive Marks`]));
          const assn = parseNum(findVal(row, [`Course${i}AssigmentMarks`, `Course${i}Assignment Marks`]));
          const obj  = parseNum(findVal(row, [`Course${i}ObjectiveMarks`, `Course${i}Objective Marks`]));

          if (name) {
            const total = desc + assn; // 🎯 STRICT CALCULATION: Total = DESC + ASSN
            const max = 25; // Adjusted typical Mid Max (15 Desc + 10 Assn)
            subjectsArray.push({
              name,
              code: code || `C0${i}`,
              courseType: 'Theory',
              internalMarks: total,
              maxMarks: max,
              finalPassedName: total >= (max * 0.4) ? 'Pass' : 'Fail',
              status: total >= (max * 0.4) ? 'Pass' : 'Fail',
              // Metadata for Rank Card & Individual Display
              descriptiveMarks: desc,
              assignmentMarks: assn,
              objectiveMarks: obj,
              description: `Desc: ${desc} | Assn: ${assn} | Obj: ${obj}`,
              credits: 0 // Typically internal doesn't carry independent credits
            });
          }
        }
      }

      if (!grouped[key]) {
        grouped[key] = {
          rollNumber,
          studentName: String(findVal(row, ['name', 'Student Name', 'FullName']) || 'Student').trim(),
          branch: String(findVal(row, ['branchname', 'Branch', 'Dept']) || 'CSE').trim(),
          year: parseNum(findVal(row, ['batch', 'Year'])),
          semester, section: 'A', examType, examSession, academicYear,
          uploadId: history._id,
          subjects: []
        };
      }
      
      if (subjectsArray.length > 0) {
        grouped[key].subjects.push(...subjectsArray);
      } else {
        // Fallback for Vertical Format
        const fallbackSubCode = String(findVal(row, ['coursecode', 'CourseCode', 'Subject Code', 'Code', 'courseId']) || '').trim();
        const fallbackSubName = String(findVal(row, ['coursename', 'CourseName', 'course name', 'Subject Name', 'Subject']) || '').trim();
        if (fallbackSubCode || fallbackSubName) {
            const internal = parseNum(findVal(row, ['TotalMarks', 'Marks', 'Internal']));
            const max = parseNum(findVal(row, ['Internalmax', 'MaxMarks', 'Internal max'])) || 50;
            grouped[key].subjects.push({
                code: fallbackSubCode || 'N/A',
                name: fallbackSubName || fallbackSubCode || 'Unknown',
                internalMarks: internal,
                maxMarks: max,
                status: internal >= max * 0.4 ? 'Pass' : 'Fail'
            });
        }
      }
    } // End of main data loop

    // ─── Phase 2: Persist Grouped Results ───
    for (const key of Object.keys(grouped)) {
      try {
        const entry = grouped[key];
        const isExternalType = !entry.examType.toLowerCase().includes('mid') && !entry.examType.toLowerCase().includes('assign');

        const totalObtained = entry.subjects.reduce((s, sub) => s + (sub.totalMarks || sub.internalMarks || 0), 0);
        const totalMax      = entry.subjects.reduce((s, sub) => s + (sub.maxMarks || 0), 0);
        const percentage    = totalMax > 0 ? parseFloat(((totalObtained / totalMax) * 100).toFixed(2)) : 0;

        const totalCredits  = entry.subjects.reduce((s, sub) => s + (sub.credits || 0), 0);
        
        // Use SGPA from row if external, else calculate (Simplified for Mid)
        const sgpa = isExternalType && entry.sgpa ? entry.sgpa : 0; 
        const cgpa = isExternalType && entry.cgpa ? entry.cgpa : 0;

        const hasFail      = entry.subjects.some(s => s.status === 'Fail' || s.status === 'Absent');
        const resultStatus = hasFail ? 'Fail' : 'Pass';

        await Result.findOneAndUpdate(
          { 
            rollNumber: entry.rollNumber, 
            semester: entry.semester, 
            examType: entry.examType, 
            examSession: entry.examSession, 
            academicYear: entry.academicYear 
          },
          { ...entry, totalMarksObtained: totalObtained, totalMaxMarks: totalMax, percentage, sgpa, cgpa, result: resultStatus, uploadedBy: req.session.admin.username },
          { upsert: true, new: true }
        );

        created++;
        
        // Socket Progress
        if (created % 10 === 0) {
            req.app.get('io').emit('upload_progress', { type: 'Results', processed: created, total: Object.keys(grouped).length });
        }
      } catch (e) {
        errors.push(`Error for record ${key}: ${e.message}`);
      }
    }

    await UploadHistory.findByIdAndUpdate(history._id, { recordsCount: created, status: 'Success' });
    if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    req.app.get('io').emit('results_updated', { message: 'New results published!' });

    res.json({ success: true, message: `Results Uploaded!`, details: `${created} records processed.` });
  } catch (err) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Rollback Specific Upload ────────────────────────────────────────────────
router.delete('/upload-history/:id/rollback', isAdmin, async (req, res) => {
  try {
    const history = await UploadHistory.findById(req.params.id);
    if (!history) return res.status(404).json({ success: false, message: 'History record not found' });

    // 1. Remove associated data
    if (history.uploadType === 'Students') {
      await Student.deleteMany({ uploadId: history._id });
    } else {
      await Result.deleteMany({ uploadId: history._id });
    }

    // 2. Remove the history record
    await UploadHistory.findByIdAndDelete(history._id);

    // ⚡ Notify students to refresh
    req.app.get('io').emit('results_updated', { message: 'Results were updated/removed' });

    res.json({ success: true, message: `Rollback successful. ${history.uploadType} batch removed.` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Get All Students ─────────────────────────────────────────────────────────
router.get('/students', isAdmin, async (req, res) => {
  try {
    const { branch, year, search } = req.query;
    const filter = {};
    if (branch) filter.branch = branch;
    if (year) filter.year = parseInt(year);
    if (search) filter.$or = [{ rollNumber: { $regex: search, $options: 'i' } }, { name: { $regex: search, $options: 'i' } }];
    const students = await Student.find(filter).select('-password').sort({ rollNumber: 1 });
    res.json({ success: true, students });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ─── Dashboard Stats ──────────────────────────────────────────────────────────
router.get('/stats', isAdmin, async (req, res) => {
  try {
    const totalStudents = await Student.countDocuments();
    const activeStudents = await Student.countDocuments({ isActive: true });
    const totalResults = await Result.countDocuments();
    const passCount = await Result.countDocuments({ result: 'Pass' });
    const failCount = await Result.countDocuments({ result: 'Fail' });
    const branches = await Student.distinct('branch');
    res.json({ success: true, stats: { totalStudents, activeStudents, totalResults, passCount, failCount, branches } });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ─── Individual Student Controls ──────────────────────────────────────────────
router.patch('/students/:id/toggle', isAdmin, async (req, res) => {
  try {
    const student = await Student.findById(req.params.id);
    if (!student) return res.status(404).json({ success: false });
    student.isActive = !student.isActive;
    await student.save();
    res.json({ success: true, isActive: student.isActive });
  } catch (err) { res.status(500).json({ success: false }); }
});

router.patch('/students/:id/password', isAdmin, async (req, res) => {
  try {
    const { password } = req.body;
    const student = await Student.findById(req.params.id);
    if (!student) return res.status(404).json({ success: false });
    student.password = password; // Middleware hashes it
    await student.save();
    res.json({ success: true, message: 'Password reset successful' });
  } catch (err) { res.status(500).json({ success: false }); }
});

router.patch('/students/:id/timer', isAdmin, async (req, res) => {
  try {
    const { minutes } = req.body;
    const student = await Student.findById(req.params.id);
    if (!student) return res.status(404).json({ success: false });
    
    if (minutes > 0) {
      student.sessionExpiry = new Date(Date.now() + minutes * 60000);
      student.sessionDuration = minutes;
    } else {
      student.sessionExpiry = null;
      student.sessionDuration = 0;
    }
    await student.save();
    
    // Notify student via socket
    req.app.get('io').emit('timer_updated', { rollNumber: student.rollNumber, expiry: student.sessionExpiry });
    res.json({ success: true, message: 'Session timer updated' });
  } catch (err) { res.status(500).json({ success: false }); }
});

// Toggle Data Repo Access
router.patch('/students/:id/data-access', isAdmin, async (req, res) => {
  try {
    const student = await Student.findById(req.params.id);
    if (!student) return res.status(404).json({ success: false });
    student.hasDataAccess = !student.hasDataAccess;
    await student.save();

    // ⚡ REAL-TIME SYNC
    const io = req.app.get('io');
    if (io) {
      io.to(`room_${student.rollNumber}`).emit('access_updated', { hasDataAccess: student.hasDataAccess });
    }

    res.json({ success: true, hasDataAccess: student.hasDataAccess });
  } catch (err) { res.status(500).json({ success: false }); }
});

router.delete('/students/:id', isAdmin, async (req, res) => {
  try {
    await Student.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false }); }
});

// ─── Get Upload History ──────────────────────────────────────────────────────
router.get('/upload-history', isAdmin, async (req, res) => {
  try {
    const history = await UploadHistory.find().sort({ timestamp: -1 });
    res.json({ success: true, history });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ─── Bulk Clear Data (Targeted) ──────────────────────────────────────────────
router.delete('/bulk/clear/:target', isAdmin, async (req, res) => {
  try {
    const { target } = req.params;
    if (target === 'students') await Student.deleteMany({});
    else if (target === 'results') await Result.deleteMany({});
    else if (target === 'all') { await Student.deleteMany({}); await Result.deleteMany({}); }
    
    // ⚡ Notify students to refresh
    req.app.get('io').emit('results_updated', { message: 'Results were removed' });

    res.json({ success: true, message: 'Data cleared successfully' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ─── DATA UPLOAD ROUTES ───────────────────────────────────────────────────────
router.post('/data-upload', isAdmin, dataUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file selected' });
    
    let { title, description, category, branch, role } = req.body;
    title = title || req.file.originalname.split('.')[0];
    description = description || 'Institutional document';
    category = category || 'General';
    branch = branch || 'All';

    const isExcel = req.file.originalname.match(/\.(xlsx|xls)$/i);
    let excelData = [];
    
    if (isExcel) {
      try {
        const workbook = XLSX.readFile(req.file.path);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        excelData = XLSX.utils.sheet_to_json(sheet);
      } catch (e) {
        console.error("Excel Parsing Error:", e);
      }
    }

    const dataFile = new DataFile({
      title,
      description,
      category,
      branch,
      role: role || 'Students',
      filename: req.file.filename,
      originalName: req.file.originalname,
      path: `/uploads/${req.file.filename}`,
      isSpreadsheet: !!isExcel,
      excelData,
      uploadedBy: req.session.admin.username
    });

    await dataFile.save();
    
    // Notify students
    req.app.get('io').emit('results_updated', { message: 'New institutional dataset published' });

    res.json({ success: true, message: isExcel ? 'Excel Dataset published!' : 'File uploaded successfully!' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/data-files', isAdmin, async (req, res) => {
  try {
    const files = await DataFile.find().sort({ uploadedAt: -1 });
    res.json({ success: true, files });
  } catch (err) { res.status(500).json({ success: false }); }
});

router.delete('/data-files/:id', isAdmin, async (req, res) => {
  try {
    const file = await DataFile.findById(req.params.id);
    if (!file) return res.status(404).json({ success: false });

    // Remove from disk
    const filePath = path.join(__dirname, '../public', file.path);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    await DataFile.findByIdAndDelete(req.params.id);

    // ⚡ Notify students to refresh data list
    req.app.get('io').emit('results_updated', { message: 'Data file removed' });

    res.json({ success: true, message: 'File deleted' });
  } catch (err) { res.status(500).json({ success: false }); }
});

router.put('/upload-history/:id', isAdmin, async (req, res) => {
  try {
    const { examType, examSession } = req.body;
    const history = await UploadHistory.findById(req.params.id);
    if (!history) return res.status(404).json({ success: false, message: 'History not found' });

    // 1. Update history record
    history.examType = examType || history.examType;
    history.examSession = examSession || history.examSession;
    await history.save();

    // 2. Cascade update ALL results associated with this upload
    if (history.uploadType === 'Results') {
        await Result.updateMany(
            { uploadId: history._id },
            { 
                $set: { 
                    examType: history.examType,
                    examSession: history.examSession
                } 
            }
        );
    }

    res.json({ success: true, message: 'Category updated and results synchronized!' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── BULK STUDENT OPERATIONS ───────────────────────────────────────────────
router.patch('/bulk/students/status', isAdmin, async (req, res) => {
    try {
        const { studentIds, active } = req.body;
        if (!studentIds || !Array.isArray(studentIds)) return res.status(400).json({ success: false });

        await Student.updateMany(
            { _id: { $in: studentIds } },
            { $set: { isActive: !!active } }
        );

        res.json({ success: true, message: `Successfully ${active ? 'activated' : 'deactivated'} ${studentIds.length} students!` });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.patch('/bulk/students/data-access', isAdmin, async (req, res) => {
    try {
        const { studentIds, allowed } = req.body;
        if (!studentIds || !Array.isArray(studentIds)) return res.status(400).json({ success: false });

        await Student.updateMany(
            { _id: { $in: studentIds } },
            { $set: { hasDataAccess: !!allowed } }
        );

        res.json({ success: true, message: `Data access ${allowed ? 'unlocked' : 'locked'} for ${studentIds.length} students!` });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;
