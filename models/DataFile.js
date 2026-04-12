const mongoose = require('mongoose');

const dataFileSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String },
  category: { type: String, default: 'General' },
  filename: { type: String, required: true },
  originalName: { type: String, required: true },
  path: { type: String, required: true },
  branch: { type: String, default: 'All' },
  role: { type: String, default: 'Students' }, // Students or Faculty
  isSpreadsheet: { type: Boolean, default: false },
  excelData: { type: Array, default: [] },
  uploadedBy: { type: String, required: true },
  uploadedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('DataFile', dataFileSchema);
