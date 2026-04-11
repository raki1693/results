const express = require('express');
const router = express.Router();
const Student = require('../models/Student');
const Admin = require('../models/Admin');

// ─── Seed Default Admin ───────────────────────────────────────────────────────
const seedAdmin = async () => {
  try {
    const exists = await Admin.findOne({ username: 'admin' });
    if (!exists) {
      const admin = new Admin({
        username: 'admin',
        password: 'admin@123',
        name: 'College Administrator',
        email: 'admin@college.edu'
      });
      await admin.save();
      console.log('✅ Default admin created: admin / admin@123');
    }
  } catch (err) {
    console.error('Admin seed error:', err.message);
  }
};
seedAdmin();

// ─── Student Login ────────────────────────────────────────────────────────────
router.post('/student/login', async (req, res) => {
  try {
    let { rollNumber, password } = req.body;
    if (!rollNumber || !password)
      return res.status(400).json({ success: false, message: 'Roll number and password are required' });

    rollNumber = rollNumber.trim().toUpperCase();
    const student = await Student.findOne({ rollNumber });
    if (!student)
      return res.status(401).json({ success: false, message: 'Invalid Roll Number or Password' });

    if (!student.isActive)
      return res.status(403).json({ success: false, message: 'Your account has been deactivated. Contact admin.' });

    const isMatch = await student.comparePassword(password);
    if (!isMatch)
      return res.status(401).json({ success: false, message: 'Invalid Roll Number or Password' });

    // Check if session has expired
    if (student.sessionExpiry && new Date() > student.sessionExpiry) {
      return res.status(403).json({ success: false, message: 'Your access period has expired. Please contact admin to renew.' });
    }

    req.session.student = {
      id: student._id,
      rollNumber: student.rollNumber,
      name: student.name,
      branch: student.branch,
      year: student.year,
      section: student.section,
      sessionExpiry: student.sessionExpiry
    };

    res.json({ success: true, message: 'Login successful', student: req.session.student });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error: ' + err.message });
  }
});

// ─── Student Registration ─────────────────────────────────────────────────────
router.post('/student/register', async (req, res) => {
  try {
    const { rollNumber, name, email, password, branch, year } = req.body;
    
    // Basic validation
    if (!rollNumber || !name || !email || !password || !branch || !year) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    const roll = rollNumber.toUpperCase();
    
    // Check if student already exists
    const existing = await Student.findOne({ rollNumber: roll });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Student with this Roll Number already exists. Try logging in.' });
    }

    const student = new Student({
      rollNumber: roll,
      name,
      email,
      password,
      branch,
      year: parseInt(year)
    });

    await student.save();
    res.json({ success: true, message: 'Registration successful! You can now log in.' });
  } catch (err) {
    console.error('Registration Error:', err);
    
    // Handle Duplicate Key Errors (Unique Roll Number/Email)
    if (err.code === 11000) {
      const field = err.keyValue ? Object.keys(err.keyValue)[0] : 'field';
      const fieldName = (field === 'rollNumber') ? 'Roll Number' : (field === 'email' ? 'Email' : field);
      return res.status(400).json({ success: false, message: `This ${fieldName} is already in use. Try logging in.` });
    }

    // Handle Mongoose Validation Errors
    if (err.name === 'ValidationError') {
      return res.status(400).json({ success: false, message: 'Validation failed: ' + Object.values(err.errors).map(e => e.message).join(', ') });
    }

    res.status(500).json({ success: false, message: 'Registration failed: ' + err.message });
  }
});

// ─── Admin Login ──────────────────────────────────────────────────────────────
router.post('/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ success: false, message: 'Username and password are required' });

    const admin = await Admin.findOne({ username });
    if (!admin)
      return res.status(401).json({ success: false, message: 'Invalid credentials' });

    const isMatch = await admin.comparePassword(password);
    if (!isMatch)
      return res.status(401).json({ success: false, message: 'Invalid credentials' });

    req.session.admin = {
      id: admin._id,
      username: admin.username,
      name: admin.name,
      role: admin.role
    };
    req.session.save((err) => {
      if (err) return res.status(500).json({ success: false, message: 'Session save failed' });
      res.json({ success: true, message: 'Admin login successful', admin: req.session.admin });
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error: ' + err.message });
  }
});

// ─── Logout ───────────────────────────────────────────────────────────────────
router.post('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) return res.status(500).json({ success: false, message: 'Logout failed' });
    res.json({ success: true, message: 'Logged out successfully' });
  });
});

// ─── Update Password ──────────────────────────────────────────────────────────
router.post('/student/update-password', async (req, res) => {
  try {
    if (!req.session.student) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }

    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Both current and new passwords are required' });
    }

    const student = await Student.findById(req.session.student.id);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    const isMatch = await student.comparePassword(oldPassword);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Current password is incorrect' });
    }

    // Update password (pre-save hook will hash it)
    student.password = newPassword;
    await student.save();

    res.json({ success: true, message: 'Password updated successfully!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to update password: ' + err.message });
  }
});

// ─── Update Admin Profile ─────────────────────────────────────────────────────
router.post('/admin/update-profile', async (req, res) => {
  try {
    if (!req.session.admin) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }

    const { username, oldPassword, newPassword } = req.body;
    const admin = await Admin.findById(req.session.admin.id);
    if (!admin) {
      return res.status(404).json({ success: false, message: 'Admin not found' });
    }

    if (username) {
      // Check if username is already taken by another admin
      const existing = await Admin.findOne({ username, _id: { $ne: admin._id } });
      if (existing) {
        return res.status(400).json({ success: false, message: 'Username is already taken' });
      }
      admin.username = username;
      req.session.admin.username = username; // Update session
    }

    if (newPassword) {
      if (!oldPassword) {
        return res.status(400).json({ success: false, message: 'Old password is required to set a new one' });
      }
      const isMatch = await admin.comparePassword(oldPassword);
      if (!isMatch) {
        return res.status(400).json({ success: false, message: 'Current password is incorrect' });
      }
      admin.password = newPassword;
    }

    await admin.save();
    res.json({ success: true, message: 'Profile updated successfully!', admin: req.session.admin });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to update profile: ' + err.message });
  }
});

// ─── Check Session ────────────────────────────────────────────────────────────
// ─── Check Session ────────────────────────────────────────────────────────────
router.get('/check', async (req, res) => {
  if (req.session.admin) {
    return res.json({ loggedIn: true, role: 'admin', user: req.session.admin });
  }

  if (req.session.student) {
    try {
      const student = await Student.findOne({ rollNumber: req.session.student.rollNumber }).select('-password');
      if (!student || !student.isActive || (student.sessionExpiry && new Date() > new Date(student.sessionExpiry))) {
        req.session.destroy();
        return res.json({ loggedIn: false, message: 'Session expired' });
      }
      return res.json({ loggedIn: true, role: 'student', user: student });
    } catch (e) {
      return res.json({ loggedIn: false });
    }
  }
  res.json({ loggedIn: false });
});

module.exports = router;
