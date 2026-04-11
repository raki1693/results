const mongoose = require('mongoose');

const UploadHistorySchema = new mongoose.Schema({
  filename:     { type: String, required: true },
  uploadType:   { type: String, enum: ['Students', 'Results'], required: true },
  semester:     { type: Number, default: null },      // e.g. 1–8 (Results only)
  examType:     { type: String, default: '' },        // e.g. "Mid-1", "Regular", "Supply"
  recordsCount: { type: Number, default: 0 },
  uploadedBy:   { type: String, required: true },
  timestamp:    { type: Date, default: Date.now },
  status:       { type: String, default: 'Success' }
});

module.exports = mongoose.model('UploadHistory', UploadHistorySchema);
