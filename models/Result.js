const mongoose = require('mongoose');

const subjectSchema = new mongoose.Schema({
  code: { type: String, required: true },
  name: { type: String, required: true },
  courseType:      { type: String, default: '' },      // e.g. Theory / Lab
  internalMarks:   { type: Number, default: 0 },
  externalMarks:   { type: Number, default: 0 },
  totalMarks:      { type: Number, default: 0 },
  maxMarks:        { type: Number, default: 100 },
  grade:           { type: String, default: 'F' },
  gradePoints:     { type: Number, default: 0 },
  credits:         { type: Number, default: 3 },
  finalPassedName: { type: String, default: '' },      // exact value from Excel
  status:          { type: String, enum: ['Pass', 'Fail', 'Absent', 'Withheld'], default: 'Fail' }
});

const resultSchema = new mongoose.Schema({
  rollNumber: { type: String, required: true, uppercase: true },
  studentName: { type: String, required: true },
  branch: { type: String, required: true },
  year: { type: Number, required: true },
  semester: { type: Number, required: true },
  section: { type: String, default: 'A' },
  examType: { type: String, default: 'Regular' },
  examSession: { type: String, default: '' }, // e.g., "Nov 2023" or "Attempt 1"
  academicYear: { type: String, required: true }, // e.g., "2023-24"
  subjects: [subjectSchema],
  totalMarksObtained: { type: Number, default: 0 },
  totalMaxMarks: { type: Number, default: 0 },
  percentage: { type: Number, default: 0 },
  sgpa: { type: Number, default: 0 },
  cgpa: { type: Number, default: 0 },
  result: { type: String, default: 'Fail' },
  rank: { type: Number },
  remarks: { type: String },
  publishedAt: { type: Date, default: Date.now },
  uploadedBy: { type: String, default: 'admin' },
  uploadId: { type: mongoose.Schema.Types.ObjectId, ref: 'UploadHistory' }
});

// Compound unique index: allows multiple attempts via examSession
resultSchema.index({ rollNumber: 1, semester: 1, examType: 1, examSession: 1, academicYear: 1 }, { unique: true });

module.exports = mongoose.model('Result', resultSchema);
