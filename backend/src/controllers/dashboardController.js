const Student = require('../models/Student');
const Faculty = require('../models/Faculty');
const Course = require('../models/Course');
const Subject = require('../models/Subject');
const Leave = require('../models/Leave');
const Timetable = require('../models/Timetable');
const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/response');
const { toObjectId } = require('../utils/helpers');
const { parseDateOnly, todayString, addDays } = require('../utils/dates');
const { summarize, mergeCounts, countsByStudentSubject, dailyTrend } = require('../utils/attendanceStats');
const { getFacultyProfile, visibleStudentIds } = require('../services/access');
const env = require('../config/env');

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const groupBy = (rows, keyFn) => {
  const map = new Map();
  rows.forEach((row) => {
    const key = keyFn(row);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  });
  return map;
};

const recentWindow = (days = 14) => {
  const to = todayString();
  return { $gte: parseDateOnly(addDays(to, -(days - 1))), $lte: parseDateOnly(to) };
};

const admin = asyncHandler(async (_req, res) => {
  const [students, faculty, courses, subjects, pendingLeaves, courseDocs, subjectDocs, studentDocs, rows, trend] = await Promise.all([
    Student.countDocuments(),
    Faculty.countDocuments(),
    Course.countDocuments(),
    Subject.countDocuments(),
    Leave.countDocuments({ status: 'pending' }),
    Course.find().select('name code department'),
    Subject.find().select('courseId'),
    Student.find().select('courseId'),
    countsByStudentSubject({}),
    dailyTrend({ date: recentWindow(14) })
  ]);

  const subjectCourse = new Map(subjectDocs.map((s) => [String(s._id), String(s.courseId)]));

  const studentsByCourse = courseDocs
    .map((c) => ({
      courseId: c._id,
      name: c.name,
      code: c.code,
      department: c.department,
      students: studentDocs.filter((s) => String(s.courseId) === String(c._id)).length
    }))
    .sort((a, b) => b.students - a.students);

  const departments = [...new Set(courseDocs.map((c) => c.department))].sort();
  const departmentAnalytics = departments.map((department) => {
    const deptCourseIds = new Set(courseDocs.filter((c) => c.department === department).map((c) => String(c._id)));
    const deptRows = rows.filter((r) => deptCourseIds.has(subjectCourse.get(r.subjectId)));
    const stats = summarize(mergeCounts(deptRows));
    return {
      department,
      courses: deptCourseIds.size,
      students: studentDocs.filter((s) => deptCourseIds.has(String(s.courseId))).length,
      attendancePercentage: stats.percentage,
      classesMarked: stats.counted
    };
  });

  const perStudent = groupBy(rows, (r) => r.studentId);
  let lowAttendanceStudents = 0;
  perStudent.forEach((studentRows) => {
    if (summarize(mergeCounts(studentRows)).lowAttendanceAlert) lowAttendanceStudents += 1;
  });

  ok(res, {
    totals: { students, faculty, courses, subjects, pendingLeaves, lowAttendanceStudents },
    overallAttendance: summarize(mergeCounts(rows)).percentage,
    threshold: env.ATTENDANCE_THRESHOLD,
    studentsByCourse,
    departmentAnalytics,
    trend
  });
});

const faculty = asyncHandler(async (req, res) => {
  const profile = await getFacultyProfile(req.user.id);
  const subjects = await Subject.find({ facultyId: profile._id }).sort({ semester: 1, name: 1 }).populate('courseId', 'name code');
  const subjectIds = subjects.map((s) => s._id);

  const [rows, trend, todayClasses, studentIds] = await Promise.all([
    countsByStudentSubject({ subjectId: { $in: subjectIds.map(toObjectId) } }),
    dailyTrend({ subjectId: { $in: subjectIds }, date: recentWindow(14) }),
    Timetable.find({ facultyId: profile._id, dayOfWeek: WEEKDAYS[parseDateOnly(todayString()).getUTCDay()] })
      .sort({ startTime: 1 })
      .populate('subjectId', 'name code'),
    visibleStudentIds(req.user)
  ]);
  const pendingLeaves = await Leave.countDocuments({ status: 'pending', studentId: { $in: studentIds } });

  const bySubject = groupBy(rows, (r) => r.subjectId);
  const subjectCards = await Promise.all(
    subjects.map(async (s) => {
      const subjectRows = bySubject.get(String(s._id)) || [];
      return {
        _id: s._id,
        name: s.name,
        code: s.code,
        semester: s.semester,
        course: s.courseId ? s.courseId.name : null,
        enrolledStudents: await Student.countDocuments({ courseId: s.courseId._id, semester: s.semester }),
        lowAttendanceStudents: subjectRows.filter((r) => summarize(r).lowAttendanceAlert).length,
        ...summarize(mergeCounts(subjectRows))
      };
    })
  );

  ok(res, {
    subjects: subjectCards,
    todayClasses,
    pendingLeaves,
    overallAttendance: summarize(mergeCounts(rows)).percentage,
    threshold: env.ATTENDANCE_THRESHOLD,
    trend
  });
});

module.exports = { admin, faculty };
