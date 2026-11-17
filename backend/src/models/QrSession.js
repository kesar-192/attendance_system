const mongoose = require('mongoose');

const qrSessionSchema = new mongoose.Schema(
  {
    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    active: { type: Boolean, default: true }
  },
  { timestamps: true }
);

qrSessionSchema.index({ subjectId: 1, active: 1 });
// MongoDB removes the document one day after it expires
qrSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 86400 });

module.exports = mongoose.model('QrSession', qrSessionSchema);
