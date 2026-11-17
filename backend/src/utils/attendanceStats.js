const Attendance = require('../models/Attendance');
const env = require('../config/env');
const { toObjectId } = require('./helpers');
const { toDateString } = require('./dates');

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Attendance maths used everywhere (dashboards, summaries, reports, alerts):
 *  - attended = present + late
 *  - counted  = all marked classes except `excused` (excused classes are neutral)
 *  - percentage = attended / counted * 100  (0 when nothing has been counted)
 *  - lowAttendanceAlert = counted > 0 && percentage < threshold
 *  - classesNeeded = consecutive classes to attend to get back to the threshold
 */
function summarize(counts, threshold = env.ATTENDANCE_THRESHOLD) {
  const present = counts.present || 0;
  const absent = counts.absent || 0;
  const late = counts.late || 0;
  const excused = counts.excused || 0;
  const total = present + absent + late + excused;
  const counted = total - excused;
  const attended = present + late;
  const percentage = counted === 0 ? 0 : round2((attended / counted) * 100);
  const lowAttendanceAlert = counted > 0 && percentage < threshold;
  // consecutive classes the student must attend to climb back to the threshold
  const classesNeeded =
    lowAttendanceAlert && threshold < 100 ? Math.max(Math.ceil((threshold * counted - 100 * attended) / (100 - threshold)), 0) : 0;
  return {
    total,
    counted,
    present,
    absent,
    late,
    excused,
    attended,
    percentage,
    lowAttendanceAlert,
    classesNeeded
  };
}

const countStage = (status) => ({ $sum: { $cond: [{ $eq: ['$status', status] }, 1, 0] } });

/** Groups attendance by (student, subject) and returns raw counters. `match` must contain real ObjectIds. */
async function countsByStudentSubject(match) {
  const rows = await Attendance.aggregate([
    { $match: match },
    {
      $group: {
        _id: { studentId: '$studentId', subjectId: '$subjectId' },
        present: countStage('present'),
        absent: countStage('absent'),
        late: countStage('late'),
        excused: countStage('excused')
      }
    }
  ]);
  return rows.map((r) => ({
    studentId: String(r._id.studentId),
    subjectId: String(r._id.subjectId),
    present: r.present,
    absent: r.absent,
    late: r.late,
    excused: r.excused
  }));
}

/** Sums several counter objects into one (used for "overall" figures). */
function mergeCounts(list) {
  return list.reduce(
    (acc, c) => ({
      present: acc.present + (c.present || 0),
      absent: acc.absent + (c.absent || 0),
      late: acc.late + (c.late || 0),
      excused: acc.excused + (c.excused || 0)
    }),
    { present: 0, absent: 0, late: 0, excused: 0 }
  );
}

/** Per-subject percentage for specific students of one subject (used for low-attendance alerts). */
async function subjectSummaryForStudents(subjectId, studentIds) {
  const rows = await countsByStudentSubject({
    subjectId: toObjectId(subjectId),
    studentId: { $in: studentIds.map(toObjectId) }
  });
  const map = new Map();
  rows.forEach((r) => map.set(r.studentId, summarize(r)));
  return map;
}

/** Daily attendance counters (ascending by date) for the given match. `match` must contain real ObjectIds / Dates. */
async function dailyTrend(match) {
  const rows = await Attendance.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$date',
        present: countStage('present'),
        absent: countStage('absent'),
        late: countStage('late'),
        excused: countStage('excused')
      }
    },
    { $sort: { _id: 1 } }
  ]);
  return rows.map((r) => ({ date: toDateString(r._id), ...summarize(r) }));
}

module.exports = {
  dailyTrend,
  round2,
  summarize,
  countsByStudentSubject,
  mergeCounts,
  subjectSummaryForStudents
};
