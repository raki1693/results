const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const studentSchema = new mongoose.Schema({
  rollNumber: { type: String, required: true, unique: true, trim: true, uppercase: true },
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  branch: { type: String, required: true },
  year: { type: Number, required: true },
  section: { type: String, default: 'A' },
  phone: { type: String },
  fatherName: { type: String },
  dob: { type: String },
  isActive: { type: Boolean, default: true },
  hasDataAccess: { type: Boolean, default: false }, // New: Data module access control
  sessionExpiry: { type: Date, default: null },
  sessionDuration: { type: Number, default: 0 },
  uploadId: { type: mongoose.Schema.Types.ObjectId, ref: 'UploadHistory' },
  createdAt: { type: Date, default: Date.now }
});

// Hash password before saving
studentSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Compare password method
studentSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('Student', studentSchema);
