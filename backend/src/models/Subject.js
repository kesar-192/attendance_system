const mongoose = require('mongoose');

const subjectSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Subject name is required'], trim: true, minlength: 2, maxlength: 120 },
    code: {
      type: String,
      required: [true, 'Subject code is required'],
      unique: true,
      trim: true,
      uppercase: true,
      match: [/^[A-Z0-9-]{2,15}$/, 'Subject code must be 2-15 letters, digits or hyphens']
    },
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: [true, 'courseId is required'] },
    facultyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Faculty', required: [true, 'facultyId is required'], index: true },
    semester: {
      type: Number,
      required: [true, 'Semester is required'],
      min: [1, 'Semester must be between 1 and 12'],
      max: [12, 'Semester must be between 1 and 12'],
      validate: { validator: Number.isInteger, message: 'Semester must be a whole number' }
    },
    credits: { type: Number, default: 3, min: [1, 'Credits must be 1-10'], max: [10, 'Credits must be 1-10'] }
  },
  { timestamps: true }
);

subjectSchema.index({ courseId: 1, semester: 1 });

module.exports = mongoose.model('Subject', subjectSchema);
