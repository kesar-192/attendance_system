const mongoose = require('mongoose');

const TYPES = ['leave', 'attendance', 'alert', 'timetable', 'system'];

const notificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    message: { type: String, required: true, trim: true, maxlength: 500 },
    type: { type: String, enum: TYPES, default: 'system' },
    link: { type: String, trim: true, maxlength: 200 },
    read: { type: Boolean, default: false },
    meta: {
      subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject' },
      leaveId: { type: mongoose.Schema.Types.ObjectId, ref: 'Leave' }
    }
  },
  { timestamps: true }
);

notificationSchema.index({ userId: 1, read: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
module.exports.TYPES = TYPES;
