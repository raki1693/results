const express = require('express');
const router = express.Router();
const kitsgService = require('../services/kitsgService');

// Middleware to check if the user is a logged-in admin on YOUR site
const isAdmin = (req, res, next) => {
    if (req.session && req.session.adminId) {
        return next();
    }
    res.status(401).json({ error: 'Unauthorized. Please login to your admin portal.' });
};

// Route to get a student report
router.post('/report', isAdmin, async (req, res) => {
    try {
        const reportData = await kitsgService.getStudentReport(req.body);
        
        // Set headers for PDF or Excel
        const format = req.body.format || 'PDF';
        if (format === 'PDF') {
            res.setHeader('Content-Type', 'application/pdf');
        } else {
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        }
        
        res.send(reportData);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch report from KITSG' });
    }
});

// Route to perform administrative actions (Edit, Delete, Post)
router.post('/action', isAdmin, async (req, res) => {
    const { endpoint, payload } = req.body;
    try {
        const result = await kitsgService.performAction(endpoint, payload);
        res.json({ success: true, data: result });
    } catch (error) {
        res.status(500).json({ error: 'Action failed on KITSG portal' });
    }
});

module.exports = router;
