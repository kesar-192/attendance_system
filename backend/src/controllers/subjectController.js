const Subject = require('../models/Subject');
const Course = require('../models/Course');
const Faculty = require('../models/Faculty');
const Attendance = require('../models/Attendance');
const Timetable = require('../models/Timetable');
const QrSession = require('../models/QrSession');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { ok, created } = require('../utils/response');
const { pick, assertObjectId, parsePagination, buildMeta, searchRegex, str, bool } = require('../utils/helpers');
const { getFacultyProfile, getStudentProfile, assertCanManageSubject } = require('../services/access');

const FIELDS = ['name', 'code', 'courseId', 'semester', 'credits'];

const POPULATE = [
  { path: 'courseId', select: 'name code department' },
  { path: 'facultyId', select: 'employeeId department userId', populate: { path: 'userId', select: 'name email' } }
];

const list = asyncHandler(async (req, res) => {
  const pagination = parsePagination(req.query, { defaultLimit: 10, maxLimit: 200 });
  const filter = {};
  const q = str(req.query.q);
  if (str(req.query.courseId)) filter.courseId = assertObjectId(str(req.query.courseId), 'courseId');
  if (str(req.query.facultyId)) filter.facultyId = assertObjectId(str(req.query.facultyId), 'facultyId');
  if (str(req.query.semester)) filter.semester = Number(str(req.query.semester));
  if (q) {
    const rx = searchRegex(q);
    filter.$or = [{ name: rx }, { code: rx }];
  }

  // ?mine=true -> faculty: subjects I teach, student: subjects of my course & semester
  if (bool(req.query.mine)) {
    if (req.user.role === 'faculty') {
      filter.facultyId = (await getFacultyProfile(req.user.id))._id;
    } else if (req.user.role === 'student') {
      const student = await getStudentProfile(req.user.id);
      filter.courseId = student.courseId;
      filter.semester = student.semester;
    }
  }

  const [subjects, total] = await Promise.all([
    Subject.find(filter).sort({ semester: 1, name: 1 }).skip(pagination.skip).limit(pagination.limit).populate(POPULATE),
    Subject.countDocuments(filter)
  ]);
  ok(res, subjects, { meta: buildMeta(pagination, total) });
});

const getOne = asyncHandler(async (req, res) => {
  const subject = await Subject.findById(req.params.id).populate(POPULATE);
  if (!subject) throw new ApiError(404, 'Subject not found');
  ok(res, subject);
});

const create = asyncHandler(async (req, res) => {
  const data = pick(req.body, FIELDS);
  if (req.user.role === 'faculty') {
    data.facultyId = (await getFacultyProfile(req.user.id))._id; // faculty always own what they create
  } else {
    data.facultyId = assertObjectId(req.body.facultyId, 'facultyId');
  }
  assertObjectId(data.courseId, 'courseId');
  const [course, faculty] = await Promise.all([Course.findById(data.courseId), Faculty.findById(data.facultyId)]);
  if (!course) throw new ApiError(404, 'Course not found');
  if (!faculty) throw new ApiError(404, 'Faculty not found');

  const subject = await Subject.create(data);
  created(res, await subject.populate(POPULATE));
});

const update = asyncHandler(async (req, res) => {
  const subject = await Subject.findById(req.params.id);
  if (!subject) throw new ApiError(404, 'Subject not found');
  await assertCanManageSubject(req.user, subject);

  const data = pick(req.body, FIELDS);
  if (req.body.facultyId !== undefined) {
    if (req.user.role !== 'admin') throw new ApiError(403, 'Only an admin can reassign a subject to another faculty member');
    data.facultyId = assertObjectId(req.body.facultyId, 'facultyId');
    if (!(await Faculty.exists({ _id: data.facultyId }))) throw new ApiError(404, 'Faculty not found');
  }
  if (data.courseId !== undefined) {
    assertObjectId(data.courseId, 'courseId');
    if (!(await Course.exists({ _id: data.courseId }))) throw new ApiError(404, 'Course not found');
  }

  subject.set(data);
  await subject.save();

  // keep denormalised timetable fields aligned with the subject
  await Timetable.updateMany(
    { subjectId: subject._id },
    { courseId: subject.courseId, semester: subject.semester, facultyId: subject.facultyId }
  );
  ok(res, await subject.populate(POPULATE));
});

const remove = asyncHandler(async (req, res) => {
  const subject = await Subject.findById(req.params.id);
  if (!subject) throw new ApiError(404, 'Subject not found');
  await assertCanManageSubject(req.user, subject);

  if (await Attendance.exists({ subjectId: subject._id })) {
    throw new ApiError(409, 'Cannot delete a subject that already has attendance records');
  }
  await Promise.all([
    Timetable.deleteMany({ subjectId: subject._id }),
    QrSession.deleteMany({ subjectId: subject._id }),
    subject.deleteOne()
  ]);
  ok(res, { id: req.params.id }, { message: 'Subject deleted' });
});

module.exports = { list, getOne, create, update, remove, POPULATE };
