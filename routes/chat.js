const express = require('express');
const router = express.Router();
const Chat = require('../models/Chat');

// Middleware to check if logged in
const isUser = (req, res, next) => {
  if (req.session.student || req.session.admin) return next();
  res.status(401).json({ success: false, message: 'Unauthorized' });
};

const isAdmin = (req, res, next) => {
  if (req.session.admin) return next();
  res.status(401).json({ success: false, message: 'Admin only' });
};

// Send Message (Supports Reply)
router.post('/send', isUser, async (req, res) => {
  try {
    const { message, receiverRoll, studentName, replyTo } = req.body;
    let senderRoll;
    if (req.session.admin) senderRoll = 'admin';
    else senderRoll = req.session.student.rollNumber;

    const chat = new Chat({
      senderRoll, receiverRoll, message, replyTo,
      studentName: req.session.student ? req.session.student.name : studentName
    });
    await chat.save();
    
    const io = req.app.get('io');
    if (senderRoll === 'admin') io.to(`room_${receiverRoll}`).emit('new_message', { chat });
    else io.emit('admin_new_message', { chat });

    res.json({ success: true, chat });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// Edit Message
router.patch('/:id', isUser, async (req, res) => {
  try {
    const { message } = req.body;
    const chat = await Chat.findById(req.params.id);
    if (!chat) return res.status(404).json({ success: false });
    chat.message = message;
    chat.isEdited = true;
    await chat.save();
    req.app.get('io').emit('message_updated', { id: chat._id, message: chat.message, isEdited: true });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false }); }
});

// Delete Message
router.delete('/:id', isUser, async (req, res) => {
  try {
    const chat = await Chat.findById(req.params.id);
    if (!chat) return res.status(404).json({ success: false });
    chat.isDeleted = true;
    chat.message = "🚫 This message was deleted";
    await chat.save();
    req.app.get('io').emit('message_updated', { id: chat._id, message: chat.message, isDeleted: true });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false }); }
});

// Get My Chats (Student View)
router.get('/my', isUser, async (req, res) => {
  try {
    const roll = req.session.student.rollNumber;
    const chats = await Chat.find({
      $or: [
        { senderRoll: roll, receiverRoll: 'admin' },
        { senderRoll: 'admin', receiverRoll: roll }
      ]
    }).sort({ timestamp: 1 });
    res.json({ success: true, chats });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get Student Chats (Admin View)
router.get('/student/:roll', isAdmin, async (req, res) => {
  try {
    const roll = req.params.roll;
    const chats = await Chat.find({
      $or: [
        { senderRoll: roll, receiverRoll: 'admin' },
        { senderRoll: 'admin', receiverRoll: roll }
      ]
    }).sort({ timestamp: 1 });
    res.json({ success: true, chats });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get List of Active Chats (Admin Overview)
router.get('/admin/list', isAdmin, async (req, res) => {
  try {
    // Get unique student rolls who messaged admin
    const list = await Chat.aggregate([
      { $match: { receiverRoll: 'admin' } }, 
      { $group: { _id: "$senderRoll", name: { $first: "$studentName" }, lastMsg: { $last: "$message" }, time: { $last: "$timestamp" } } },
      { $sort: { time: -1 } }
    ]);
    res.json({ success: true, list });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Mark Messages as Read
router.post('/mark-read', isUser, async (req, res) => {
  try {
    const { otherRoll } = req.body; // The person whose messages I am seeing
    let myRoll = req.session.admin ? 'admin' : req.session.student.rollNumber;

    // Update messages where I am the receiver and the other person is the sender
    await Chat.updateMany(
      { senderRoll: otherRoll, receiverRoll: myRoll, status: 'sent' },
      { $set: { status: 'seen' } }
    );

    // Emit event to update the other person's view
    const io = req.app.get('io');
    if (myRoll === 'admin') {
      io.to(`room_${otherRoll}`).emit('messages_seen', { by: 'admin' });
    } else {
      io.emit('messages_seen', { by: myRoll });
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Clear All Chats
router.delete('/clear-all', isAdmin, async (req, res) => {
  try {
    await Chat.deleteMany({});
    res.json({ success: true, message: 'All chat history cleared.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
