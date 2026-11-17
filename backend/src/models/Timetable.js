const mongoose = require('mongoose');

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const timetableSchema = new mongoose.Schema(
  {
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    semester: { type: Number, required: true, min: 1, max: 12 },
    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: [true, 'subjectId is required'] },
    facultyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Faculty', required: true },
    dayOfWeek: { type: String, enum: { values: DAYS, message: `dayOfWeek must be one of: ${DAYS.join(', ')}` }, required: true },
    startTime: { type: String, required: [true, 'startTime is required'], match: [TIME_RE, 'startTime must be HH:mm (24h)'] },
    endTime: {
      type: String,
      required: [true, 'endTime is required'],
      match: [TIME_RE, 'endTime must be HH:mm (24h)'],
      validate: {
        validator(value) {
          return !this.startTime || value > this.startTime;
        },
        message: 'endTime must be after startTime'
      }
    },
    room: { type: String, trim: true, maxlength: 50, default: '' }
  },
  { timestamps: true }
);

timetableSchema.index({ courseId: 1, semester: 1, dayOfWeek: 1 });
timetableSchema.index({ facultyId: 1, dayOfWeek: 1 });
timetableSchema.index({ subjectId: 1 });

module.exports = mongoose.model('Timetable', timetableSchema);
module.exports.DAYS = DAYS;
