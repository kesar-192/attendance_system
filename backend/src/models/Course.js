const mongoose = require('mongoose');

const courseSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Course name is required'], unique: true, trim: true, minlength: 2, maxlength: 120 },
    code: {
      type: String,
      required: [true, 'Course code is required'],
      unique: true,
      trim: true,
      uppercase: true,
      match: [/^[A-Z0-9-]{2,15}$/, 'Course code must be 2-15 letters, digits or hyphens']
    },
    department: { type: String, required: [true, 'Department is required'], trim: true, maxlength: 100 },
    durationSemesters: {
      type: Number,
      default: 8,
      min: [1, 'Duration must be at least 1 semester'],
      max: [12, 'Duration cannot exceed 12 semesters'],
      validate: { validator: Number.isInteger, message: 'Duration must be a whole number' }
    },
    description: { type: String, trim: true, maxlength: 500, default: '' }
  },
  { timestamps: true }
);

courseSchema.index({ department: 1 });

module.exports = mongoose.model('Course', courseSchema);
