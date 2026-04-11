const mongoose = require('mongoose');

const chatSchema = new mongoose.Schema({
  senderRoll: { type: String, required: true }, // 'admin' or the Student's Roll Number
  receiverRoll: { type: String, required: true },
  studentName: { type: String }, // To show who is talking in Admin view
  message: { type: String, required: true },
  status: { type: String, enum: ['sent', 'seen'], default: 'sent' },
  isEdited: { type: Boolean, default: false },
  isDeleted: { type: Boolean, default: false },
  replyTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Chat', default: null },
  timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Chat', chatSchema);
