const Attendance = require('../models/Attendance');
const { STATUSES } = require('../models/Attendance');
const Subject = require('../models/Subject');
const Student = require('../models/Student');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/response');
const { toCsv } = require('../utils/csv');
const env = require('../config/env');
const {
  assertObjectId,
  toObjectId,
  parsePagination,
  buildMeta,
  str,
  bool
} = require('../utils/helpers');
const { parseDateOnly, assertNotFuture, todayString, addDays } = require('../utils/dates');
const { summarize, countsByStudentSubject, mergeCounts, dailyTrend } = require('../utils/attendanceStats');
const {
  getStudentProfile,
  facultySubjectIds,
  assertCanManageSubject
} = require('../services/access');
const { notifyLowAttendance } = require('../services/alerts');

const MAX_BULK = 1000;

const STUDENT_POPULATE = { path: 'studentId', select: 'enrollmentNo semester userId', populate: { path: 'userId', select: 'name' } };
const SUBJECT_POPULATE = { path: 'subjectId', select: 'name code semester' };

/** null for admins (no restriction) or the list of subject ids a faculty member may see. */
async function subjectScope(user) {
  return user.role === 'admin' ? null : facultySubjectIds(user.id);
}

function assertSubjectInScope(scope, subjectId) {
  if (scope && !scope.some((id) => String(id) === String(subjectId))) {
    throw new ApiError(403, 'You can only access attendance of subjects assigned to you');
  }
}

// ---------------------------------------------------------------------------------------------
// POST /api/attendance/bulk   (faculty for own subjects, admin for any)
// ---------------------------------------------------------------------------------------------
const bulkMark = asyncHandler(async (req, res) => {
  const subjectId = assertObjectId(req.body.subjectId, 'subjectId');
  const dateString = req.body.date;
  const day = parseDateOnly(dateString);
  assertNotFuture(dateString);

  const { records } = req.body;
  if (!Array.isArray(records) || records.length === 0) throw new ApiError(400, 'records must be a non-empty array');
  if (records.length > MAX_BULK) throw new ApiError(400, `A maximum of ${MAX_BULK} records can be submitted at once`);

  const subject = await Subject.findById(subjectId);
  if (!subject) throw new ApiError(404, 'Subject not found');
  await assertCanManageSubject(req.user, subject);

  // validate the whole payload up-front so a bad row never results in a half-applied sheet
  const seen = new Set();
  const cleaned = records.map((record, index) => {
    if (!record || typeof record !== 'object') throw new ApiError(400, `records[${index}] must be an object`);
    const studentId = assertObjectId(record.studentId, `records[${index}].studentId`);
    if (!STATUSES.includes(record.status)) {
      throw new ApiError(400, `records[${index}].status must be one of: ${STATUSES.join(', ')}`);
    }
    if (record.remarks !== undefined && (typeof record.remarks !== 'string' || record.remarks.length > 200)) {
      throw new ApiError(400, `records[${index}].remarks must be a string up to 200 characters`);
    }
    if (seen.has(studentId)) throw new ApiError(400, `Duplicate student in payload: ${studentId}`);
    seen.add(studentId);
    return { studentId, status: record.status, remarks: (record.remarks || '').trim() };
  });

  const enrolled = await Student.find({
    _id: { $in: cleaned.map((r) => r.studentId) },
    courseId: subject.courseId,
    semester: subject.semester
  }).select('_id userId');
  const enrolledIds = new Set(enrolled.map((s) => String(s._id)));
  const notEnrolled = cleaned.filter((r) => !enrolledIds.has(r.studentId)).map((r) => r.studentId);
  if (notEnrolled.length) {
    throw new ApiError(400, `Students not enrolled in ${subject.code} (course/semester mismatch or unknown): ${notEnrolled.join(', ')}`);
  }

  // One bulkWrite = one round-trip. Every row is an upsert on the unique (student, subject, date) key,
  // so re-submitting the same sheet can never create duplicates; it only updates the status.
  // A pipeline update is used so that `updatedAt` moves only when a row really changes (re-submitting an
  // identical sheet is a true no-op), and $literal keeps user-supplied text from being read as a field path.
  const now = new Date();
  const markedBy = toObjectId(req.user.id);
  const result = await Attendance.bulkWrite(
    cleaned.map((r) => ({
      updateOne: {
        filter: { studentId: r.studentId, subjectId: subject._id, date: day },
        update: [
          {
            $set: {
              updatedAt: {
                $cond: [
                  {
                    $and: [
                      { $eq: ['$status', r.status] },
                      { $eq: ['$remarks', r.remarks] },
                      { $eq: ['$method', 'manual'] },
                      { $eq: ['$markedBy', markedBy] }
                    ]
                  },
                  '$updatedAt',
                  now
                ]
              },
              createdAt: { $ifNull: ['$createdAt', now] },
              status: { $literal: r.status },
              remarks: { $literal: r.remarks },
              method: { $literal: 'manual' },
              markedBy: { $literal: markedBy }
            }
          }
        ],
        upsert: true
      }
    })),
    { ordered: false, timestamps: false }
  );

  const needsCheck = enrolled.filter((s) => cleaned.some((r) => r.studentId === String(s._id) && r.status !== 'present'));
  const lowAttendanceAlerts = await notifyLowAttendance(subject, needsCheck);

  ok(
    res,
    {
      subjectId,
      date: dateString,
      total: cleaned.length,
      created: result.upsertedCount,
      updated: result.modifiedCount,
      unchanged: cleaned.length - result.upsertedCount - result.modifiedCount,
      lowAttendanceAlerts
    },
    { status: 200, message: 'Attendance saved' }
  );
});

// ---------------------------------------------------------------------------------------------
// GET /api/attendance/roster?subjectId=&date=   (class sheet with any existing marks)
// ---------------------------------------------------------------------------------------------
const roster = asyncHandler(async (req, res) => {
  const subjectId = assertObjectId(str(req.query.subjectId), 'subjectId');
  const dateString = str(req.query.date) || todayString();
  const day = parseDateOnly(dateString);

  const subject = await Subject.findById(subjectId);
  if (!subject) throw new ApiError(404, 'Subject not found');
  await assertCanManageSubject(req.user, subject);

  const [students, marks] = await Promise.all([
    Student.find({ courseId: subject.courseId, semester: subject.semester })
      .sort({ enrollmentNo: 1 })
      .populate('userId', 'name'),
    Attendance.find({ subjectId: subject._id, date: day })
  ]);
  const byStudent = new Map(marks.map((m) => [String(m.studentId), m]));

  ok(res, {
    subject: { _id: subject._id, name: subject.name, code: subject.code, semester: subject.semester },
    date: dateString,
    students: students.map((s) => {
      const mark = byStudent.get(String(s._id));
      return {
        studentId: s._id,
        enrollmentNo: s.enrollmentNo,
        name: s.userId ? s.userId.name : 'Unknown',
        status: mark ? mark.status : null,
        method: mark ? mark.method : null,
        remarks: mark ? mark.remarks : ''
      };
    })
  });
});

// ---------------------------------------------------------------------------------------------
// GET /api/attendance   (role scoped list)
// ---------------------------------------------------------------------------------------------
const list = asyncHandler(async (req, res) => {
  const pagination = parsePagination(req.query, { defaultLimit: 10, maxLimit: 200 });
  const filter = {};

  if (req.user.role === 'student') {
    filter.studentId = (await getStudentProfile(req.user.id))._id;
  } else if (str(req.query.studentId)) {
    filter.studentId = assertObjectId(str(req.query.studentId), 'studentId');
  }

  const subjectId = str(req.query.subjectId);
  if (req.user.role === 'faculty') {
    const scope = await subjectScope(req.user);
    if (subjectId) {
      assertSubjectInScope(scope, assertObjectId(subjectId, 'subjectId'));
      filter.subjectId = subjectId;
    } else {
      filter.subjectId = { $in: scope };
    }
  } else if (subjectId) {
    filter.subjectId = assertObjectId(subjectId, 'subjectId');
  }

  if (str(req.query.status)) {
    if (!STATUSES.includes(str(req.query.status))) throw new ApiError(400, `status must be one of: ${STATUSES.join(', ')}`);
    filter.status = str(req.query.status);
  }
  if (str(req.query.date)) {
    filter.date = parseDateOnly(str(req.query.date));
  } else if (str(req.query.from) || str(req.query.to)) {
    filter.date = {};
    if (str(req.query.from)) filter.date.$gte = parseDateOnly(str(req.query.from), 'from');
    if (str(req.query.to)) filter.date.$lte = parseDateOnly(str(req.query.to), 'to');
  }

  const [records, total] = await Promise.all([
    Attendance.find(filter)
      .sort({ date: -1, createdAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .populate([STUDENT_POPULATE, SUBJECT_POPULATE]),
    Attendance.countDocuments(filter)
  ]);
  ok(res, records, { meta: buildMeta(pagination, total) });
});

// ---------------------------------------------------------------------------------------------
// PATCH /api/attendance/:id  and  DELETE /api/attendance/:id
// ---------------------------------------------------------------------------------------------
const update = asyncHandler(async (req, res) => {
  const record = await Attendance.findById(req.params.id);
  if (!record) throw new ApiError(404, 'Attendance record not found');
  const subject = await Subject.findById(record.subjectId);
  if (!subject) throw new ApiError(404, 'Subject not found');
  await assertCanManageSubject(req.user, subject);

  if (req.body.status !== undefined) record.status = req.body.status;
  if (req.body.remarks !== undefined) record.remarks = req.body.remarks;
  record.markedBy = req.user.id;
  await record.save();

  if (record.status !== 'present') {
    const student = await Student.findById(record.studentId).select('_id userId');
    if (student) await notifyLowAttendance(subject, [student]);
  }
  ok(res, record);
});

const remove = asyncHandler(async (req, res) => {
  const record = await Attendance.findByIdAndDelete(req.params.id);
  if (!record) throw new ApiError(404, 'Attendance record not found');
  ok(res, { id: req.params.id }, { message: 'Attendance record deleted' });
});

// ---------------------------------------------------------------------------------------------
// Summaries: GET /api/attendance/summary/me  and  /summary/:studentId
// ---------------------------------------------------------------------------------------------
async function buildStudentSummary(student, restrictSubjectIds) {
  const subjectRestriction = restrictSubjectIds ? { $in: restrictSubjectIds.map(toObjectId) } : undefined;
  const rows = await countsByStudentSubject({
    studentId: student._id,
    ...(subjectRestriction && { subjectId: subjectRestriction })
  });
  const currentSubjectIds = await Subject.find({
    courseId: student.courseId,
    semester: student.semester,
    ...(subjectRestriction && { _id: subjectRestriction })
  }).distinct('_id');

  const ids = [...new Set([...rows.map((r) => r.subjectId), ...currentSubjectIds.map(String)])];
  const subjects = await Subject.find({ _id: { $in: ids } })
    .sort({ name: 1 })
    .populate({ path: 'facultyId', select: 'userId', populate: { path: 'userId', select: 'name' } });
  const byId = new Map(rows.map((r) => [r.subjectId, r]));

  const perSubject = subjects.map((s) => ({
    subjectId: s._id,
    name: s.name,
    code: s.code,
    semester: s.semester,
    faculty: s.facultyId && s.facultyId.userId ? s.facultyId.userId.name : null,
    ...summarize(byId.get(String(s._id)) || {})
  }));

  return {
    student: {
      id: student._id,
      enrollmentNo: student.enrollmentNo,
      name: student.userId && student.userId.name,
      semester: student.semester,
      course: student.courseId && student.courseId.name
    },
    threshold: env.ATTENDANCE_THRESHOLD,
    subjects: perSubject,
    overall: summarize(mergeCounts(rows)),
    lowAttendanceSubjects: perSubject.filter((s) => s.lowAttendanceAlert).map((s) => s.code)
  };
}

const STUDENT_FULL = [
  { path: 'userId', select: 'name' },
  { path: 'courseId', select: 'name code' }
];

const summaryMe = asyncHandler(async (req, res) => {
  const student = await getStudentProfile(req.user.id);
  await student.populate(STUDENT_FULL);
  ok(res, await buildStudentSummary(student));
});

const summaryForStudent = asyncHandler(async (req, res) => {
  const student = await Student.findById(req.params.studentId).populate(STUDENT_FULL);
  if (!student) throw new ApiError(404, 'Student not found');

  if (req.user.role === 'student') {
    const own = await getStudentProfile(req.user.id);
    if (String(own._id) !== String(student._id)) throw new ApiError(403, 'You can only view your own attendance');
    return ok(res, await buildStudentSummary(student));
  }
  const scope = await subjectScope(req.user); // faculty only see their own subjects
  return ok(res, await buildStudentSummary(student, scope));
});

// ---------------------------------------------------------------------------------------------
// GET /api/attendance/reports   (admin: everything, faculty: own subjects)  ?format=json|csv
// ---------------------------------------------------------------------------------------------
const REPORT_COLUMNS = [
  { key: 'enrollmentNo', label: 'Enrollment No' },
  { key: 'studentName', label: 'Student' },
  { key: 'course', label: 'Course' },
  { key: 'semester', label: 'Semester' },
  { key: 'subjectCode', label: 'Subject Code' },
  { key: 'subjectName', label: 'Subject' },
  { key: 'total', label: 'Total Classes' },
  { key: 'present', label: 'Present' },
  { key: 'late', label: 'Late' },
  { key: 'absent', label: 'Absent' },
  { key: 'excused', label: 'Excused' },
  { key: 'percentage', label: 'Attendance %' },
  { key: 'lowAttendanceAlert', label: 'Below Threshold' }
];

const reports = asyncHandler(async (req, res) => {
  const format = (str(req.query.format) || 'json').toLowerCase();
  if (!['json', 'csv'].includes(format)) throw new ApiError(400, 'format must be json or csv');

  const threshold = str(req.query.threshold) ? Number(str(req.query.threshold)) : env.ATTENDANCE_THRESHOLD;
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) throw new ApiError(400, 'threshold must be between 0 and 100');

  const match = {};

  // ---- subject filter (+ faculty scoping)
  const scope = await subjectScope(req.user);
  const subjectId = str(req.query.subjectId);
  if (subjectId) {
    assertObjectId(subjectId, 'subjectId');
    assertSubjectInScope(scope, subjectId);
    match.subjectId = toObjectId(subjectId);
  } else if (scope) {
    match.subjectId = { $in: scope };
  }

  // ---- student filter: explicit student, or course / semester cohort
  const studentId = str(req.query.studentId);
  const courseId = str(req.query.courseId);
  const semester = str(req.query.semester);
  if (studentId) {
    match.studentId = toObjectId(assertObjectId(studentId, 'studentId'));
  } else if (courseId || semester) {
    const cohort = {};
    if (courseId) cohort.courseId = assertObjectId(courseId, 'courseId');
    if (semester) cohort.semester = Number(semester);
    match.studentId = { $in: (await Student.find(cohort).distinct('_id')).map(toObjectId) };
  }

  // ---- date range
  if (str(req.query.from) || str(req.query.to)) {
    match.date = {};
    if (str(req.query.from)) match.date.$gte = parseDateOnly(str(req.query.from), 'from');
    if (str(req.query.to)) match.date.$lte = parseDateOnly(str(req.query.to), 'to');
  }

  const grouped = await countsByStudentSubject(match);
  const [students, subjects] = await Promise.all([
    Student.find({ _id: { $in: [...new Set(grouped.map((g) => g.studentId))] } })
      .populate('userId', 'name')
      .populate('courseId', 'name'),
    Subject.find({ _id: { $in: [...new Set(grouped.map((g) => g.subjectId))] } }).select('name code')
  ]);
  const studentMap = new Map(students.map((s) => [String(s._id), s]));
  const subjectMap = new Map(subjects.map((s) => [String(s._id), s]));

  let rows = grouped
    .map((g) => {
      const student = studentMap.get(g.studentId);
      const subject = subjectMap.get(g.subjectId);
      if (!student || !subject) return null;
      const stats = summarize(g, threshold);
      return {
        studentId: g.studentId,
        subjectId: g.subjectId,
        enrollmentNo: student.enrollmentNo,
        studentName: student.userId ? student.userId.name : '',
        course: student.courseId ? student.courseId.name : '',
        semester: student.semester,
        subjectCode: subject.code,
        subjectName: subject.name,
        ...stats
      };
    })
    .filter(Boolean);

  if (bool(req.query.belowThreshold)) rows = rows.filter((r) => r.lowAttendanceAlert);
  rows.sort((a, b) => a.percentage - b.percentage || a.enrollmentNo.localeCompare(b.enrollmentNo));

  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="attendance-report-${todayString()}.csv"`);
    return res.status(200).send(toCsv(REPORT_COLUMNS, rows));
  }

  const pagination = parsePagination(req.query, { defaultLimit: 25, maxLimit: 500 });
  const page = rows.slice(pagination.skip, pagination.skip + pagination.limit);
  return ok(res, page, {
    meta: {
      ...buildMeta(pagination, rows.length),
      threshold,
      belowThresholdCount: rows.filter((r) => r.lowAttendanceAlert).length
    }
  });
});

// ---------------------------------------------------------------------------------------------
// GET /api/attendance/trends   (admin / faculty) daily attendance % for charts
// ---------------------------------------------------------------------------------------------
const trends = asyncHandler(async (req, res) => {
  const to = str(req.query.to) || todayString();
  const from = str(req.query.from) || addDays(to, -29);
  const match = { date: { $gte: parseDateOnly(from, 'from'), $lte: parseDateOnly(to, 'to') } };

  const scope = await subjectScope(req.user);
  const subjectId = str(req.query.subjectId);
  if (subjectId) {
    assertObjectId(subjectId, 'subjectId');
    assertSubjectInScope(scope, subjectId);
    match.subjectId = toObjectId(subjectId);
  } else if (scope) {
    match.subjectId = { $in: scope };
  }

  ok(res, await dailyTrend(match), { meta: { from, to } });
});

module.exports = {
  bulkMark,
  roster,
  list,
  update,
  remove,
  summaryMe,
  summaryForStudent,
  reports,
  trends
};
