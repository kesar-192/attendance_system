const mongoose = require('mongoose');

const STATUSES = ['present', 'absent', 'late', 'excused'];

const attendanceSchema = new mongoose.Schema(
  {
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: [true, 'studentId is required'] },
    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: [true, 'subjectId is required'] },
    // Calendar day stored at 00:00:00.000 UTC (see utils/dates.js)
    date: { type: Date, required: [true, 'date is required'] },
    status: { type: String, enum: { values: STATUSES, message: `status must be one of: ${STATUSES.join(', ')}` }, required: true },
    method: { type: String, enum: ['manual', 'qr'], default: 'manual' },
    markedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    qrSessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'QrSession' },
    remarks: { type: String, trim: true, maxlength: 200, default: '' }
  },
  { timestamps: true }
);

// One record per student + subject + calendar day. This is what makes bulk marking idempotent.
attendanceSchema.index({ studentId: 1, subjectId: 1, date: 1 }, { unique: true });
attendanceSchema.index({ subjectId: 1, date: 1 });
attendanceSchema.index({ date: 1 });

module.exports = mongoose.model('Attendance', attendanceSchema);
module.exports.STATUSES = STATUSES;
