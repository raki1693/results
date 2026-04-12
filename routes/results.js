const express = require('express');
const router = express.Router();
const Result = require('../models/Result');
const Student = require('../models/Student');
const DataFile = require('../models/DataFile');

// ─── Student Auth Middleware (With Timer Enforcement) ──────────────────────────
const isStudent = async (req, res, next) => {
  if (!req.session.student)
    return res.status(401).json({ success: false, message: 'Unauthorized. Please login.' });

  try {
    // Fetch latest data from DB to check Timer
    const student = await Student.findOne({ rollNumber: req.session.student.rollNumber });
    
    if (!student || !student.isActive) {
      req.session.destroy();
      return res.status(403).json({ success: false, message: 'Account deactivated.' });
    }

    // 🔥 SECURE KICK-OFF: Check if timer has ended
    if (student.sessionExpiry && new Date() > new Date(student.sessionExpiry)) {
      req.session.destroy();
      return res.status(403).json({ 
        success: false, 
        message: '🔒 Your authorized session has ended. Access revoked.',
        expired: true 
      });
    }

    next();
  } catch (e) {
    res.status(500).json({ success: false, message: 'Security check failed.' });
  }
};

// ─── Get My Results (logged-in student) ───────────────────────────────────────
router.get('/my', isStudent, async (req, res) => {
  try {
    const results = await Result.find({ rollNumber: req.session.student.rollNumber })
      .sort({ publishedAt: -1 });
    res.json({ success: true, results });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Get My Result for Specific Semester ──────────────────────────────────────
router.get('/my/semester/:sem', isStudent, async (req, res) => {
  try {
    const { examType, academicYear } = req.query;
    const filter = {
      rollNumber: req.session.student.rollNumber,
      semester: parseInt(req.params.sem)
    };
    if (examType)     filter.examType     = examType;
    if (academicYear) filter.academicYear = academicYear;

    const results = await Result.find(filter).sort({ publishedAt: -1 });
    res.json({ success: true, results });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Get Single Result ────────────────────────────────────────────────────────
router.get('/:id', isStudent, async (req, res) => {
  try {
    const result = await Result.findById(req.params.id);
    if (!result) return res.status(404).json({ success: false, message: 'Result not found' });
    // Students can only view their own results
    if (result.rollNumber !== req.session.student.rollNumber)
      return res.status(403).json({ success: false, message: 'Access denied' });
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET DATA FILES ──────────────────────────────────────────────────────────
router.get('/data/files', isStudent, async (req, res) => {
  try {
    const { branch: studentBranch } = req.session.student;
    const { role, branch: targetBranch, search } = req.query; // 'Students/Faculty', optional sub-branch, optional search
    
    const filter = { role: role || 'Students' };

    if (targetBranch && targetBranch !== 'All') {
      filter.branch = targetBranch;
    } else {
      filter.$or = [{ branch: 'All' }, { branch: studentBranch }];
    }

    // Add Htno/Title search if provided
    if (search) {
      filter.$and = [
        { $or: filter.$or || [] }, // Preserve existing branch filter
        { $or: [
          { title: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } }
        ]}
      ];
      delete filter.$or; // Use the merged $and instead
    }

    const files = await require('../models/DataFile').find(filter).sort({ uploadedAt: -1 });

    res.json({ success: true, files });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET STUDENT INFO (For Search) ───────────────────────────────────────────
router.get('/student-info/:rollNumber', isStudent, async (req, res) => {
  try {
    const student = await require('../models/Student').findOne({ rollNumber: req.params.rollNumber })
                      .select('name rollNumber branch year section email -_id');
    if (!student) return res.status(404).json({ success: false, message: 'Student not found' });
    res.json({ success: true, student });
  } catch (err) { res.status(500).json({ success: false }); }
});

router.get('/data/search/:htno', async (req, res) => {
    try {
        const htno = req.params.htno.toUpperCase();
        const files = await DataFile.find({ isSpreadsheet: true });
        
        let foundRecords = [];
        
        files.forEach(file => {
            const match = file.excelData.find(row => {
                // 1. Try common column names first for precision
                const commonHeaders = ['Htno', 'HTNO', 'HallTicketNo', 'Hall Ticket', 'Admissionno', 'Roll Number', 'RollNo', 'Roll No'];
                for (const h of commonHeaders) {
                    if (row[h] && String(row[h]).trim().toUpperCase() === htno) return true;
                }

                // 2. Fallback: Search EVERY column value in the row (Universal Search)
                return Object.values(row).some(val => 
                    val && String(val).trim().toUpperCase() === htno
                );
            });
            
            if (match) {
                foundRecords.push({
                    sourceTitle: file.title,
                    sourceCategory: file.category,
                    data: match
                });
            }
        });

        res.json({ success: true, records: foundRecords });
    } catch (err) { res.status(500).json({ success: false }); }
});

router.get('/data/files/:id', async (req, res) => {
    try {
        const file = await DataFile.findById(req.params.id);
        if (!file) return res.status(404).json({ success: false });
        res.json({ success: true, file });
    } catch (err) { res.status(500).json({ success: false }); }
});

module.exports = router;
