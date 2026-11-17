const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: [true, 'userId is required'], unique: true },
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: [true, 'courseId is required'], index: true },
    enrollmentNo: {
      type: String,
      required: [true, 'Enrollment number is required'],
      unique: true,
      trim: true,
      uppercase: true,
      match: [/^[A-Z0-9/-]{3,30}$/, 'Enrollment number must be 3-30 letters, digits, "-" or "/"']
    },
    semester: {
      type: Number,
      required: [true, 'Semester is required'],
      min: [1, 'Semester must be between 1 and 12'],
      max: [12, 'Semester must be between 1 and 12'],
      validate: { validator: Number.isInteger, message: 'Semester must be a whole number' }
    },
    phone: { type: String, trim: true, match: [/^[0-9+\-\s()]{7,20}$/, 'Phone number is invalid'] },
    address: { type: String, trim: true, maxlength: 300 },
    dateOfBirth: { type: Date }
  },
  { timestamps: true }
);

studentSchema.index({ courseId: 1, semester: 1 });

module.exports = mongoose.model('Student', studentSchema);
