const Notification = require('../models/Notification');
const { notifyUsers } = require('./notify');
const { subjectSummaryForStudents } = require('../utils/attendanceStats');
const env = require('../config/env');

/**
 * After absences / lates are recorded, warns students whose attendance in that subject fell below the threshold.
 * A student who already has an unread alert for the subject is not notified again.
 * students: [{ _id, userId }]. Returns the ids of the students that are below the threshold.
 */
async function notifyLowAttendance(subject, students) {
  if (!students.length) return [];
  const summaries = await subjectSummaryForStudents(subject._id, students.map((s) => s._id));
  const flagged = students.filter((s) => summaries.get(String(s._id))?.lowAttendanceAlert);

  for (const student of flagged) {
    const exists = await Notification.exists({
      userId: student.userId,
      type: 'alert',
      read: false,
      'meta.subjectId': subject._id
    });
    if (exists) continue;
    const { percentage } = summaries.get(String(student._id));
    await notifyUsers([student.userId], {
      title: 'Low attendance warning',
      message: `Your attendance in ${subject.name} is ${percentage}%, below the required ${env.ATTENDANCE_THRESHOLD}%.`,
      type: 'alert',
      link: '/student',
      meta: { subjectId: subject._id }
    });
  }
  return flagged.map((s) => String(s._id));
}

module.exports = { notifyLowAttendance };
