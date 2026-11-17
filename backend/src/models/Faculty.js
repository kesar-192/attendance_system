const mongoose = require('mongoose');

const facultySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: [true, 'userId is required'], unique: true },
    employeeId: {
      type: String,
      required: [true, 'Employee ID is required'],
      unique: true,
      trim: true,
      uppercase: true,
      match: [/^[A-Z0-9/-]{2,30}$/, 'Employee ID must be 2-30 letters, digits, "-" or "/"']
    },
    department: { type: String, required: [true, 'Department is required'], trim: true, maxlength: 100 },
    designation: { type: String, trim: true, maxlength: 100, default: 'Assistant Professor' },
    phone: { type: String, trim: true, match: [/^[0-9+\-\s()]{7,20}$/, 'Phone number is invalid'] }
  },
  { timestamps: true }
);

facultySchema.index({ department: 1 });

module.exports = mongoose.model('Faculty', facultySchema);
