const mongoose = require('mongoose');

const LEAVE_STATUSES = ['pending', 'approved', 'rejected', 'cancelled'];
const LEAVE_TYPES = ['sick', 'casual', 'medical', 'family', 'event', 'other'];

const leaveSchema = new mongoose.Schema(
  {
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: [true, 'studentId is required'] },
    type: { type: String, enum: { values: LEAVE_TYPES, message: `type must be one of: ${LEAVE_TYPES.join(', ')}` }, default: 'casual' },
    fromDate: { type: Date, required: [true, 'fromDate is required'] },
    toDate: {
      type: Date,
      required: [true, 'toDate is required'],
      validate: {
        validator(value) {
          return !this.fromDate || value >= this.fromDate;
        },
        message: 'toDate must be on or after fromDate'
      }
    },
    reason: { type: String, required: [true, 'Reason is required'], trim: true, minlength: [5, 'Reason must be at least 5 characters'], maxlength: 500 },
    status: { type: String, enum: LEAVE_STATUSES, default: 'pending' },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewComment: { type: String, trim: true, maxlength: 300, default: '' },
    reviewedAt: { type: Date }
  },
  { timestamps: true }
);

leaveSchema.index({ studentId: 1, status: 1 });
leaveSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Leave', leaveSchema);
module.exports.LEAVE_STATUSES = LEAVE_STATUSES;
module.exports.LEAVE_TYPES = LEAVE_TYPES;
