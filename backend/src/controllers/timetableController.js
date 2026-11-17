const Timetable = require('../models/Timetable');
const { DAYS } = require('../models/Timetable');
const Subject = require('../models/Subject');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { ok, created } = require('../utils/response');
const { pick, assertObjectId, str, bool } = require('../utils/helpers');
const { getStudentProfile, getFacultyProfile } = require('../services/access');

const FIELDS = ['dayOfWeek', 'startTime', 'endTime', 'room'];

const POPULATE = [
  { path: 'subjectId', select: 'name code' },
  { path: 'courseId', select: 'name code' },
  { path: 'facultyId', select: 'employeeId userId', populate: { path: 'userId', select: 'name' } }
];

/** A faculty member or a class (course + semester) cannot be in two overlapping slots. */
async function assertNoClash(entry) {
  const clash = await Timetable.findOne({
    _id: { $ne: entry._id },
    dayOfWeek: entry.dayOfWeek,
    startTime: { $lt: entry.endTime },
    endTime: { $gt: entry.startTime },
    $or: [{ facultyId: entry.facultyId }, { courseId: entry.courseId, semester: entry.semester }]
  }).populate('subjectId', 'code');
  if (clash) {
    const code = clash.subjectId ? clash.subjectId.code : 'another class';
    throw new ApiError(409, `Time clash with ${code} on ${clash.dayOfWeek} (${clash.startTime}-${clash.endTime})`);
  }
}

function applySubject(entry, subject) {
  entry.subjectId = subject._id;
  entry.courseId = subject.courseId;
  entry.semester = subject.semester;
  entry.facultyId = subject.facultyId;
}

const sortEntries = (list) =>
  list.sort((a, b) => DAYS.indexOf(a.dayOfWeek) - DAYS.indexOf(b.dayOfWeek) || a.startTime.localeCompare(b.startTime));

const list = asyncHandler(async (req, res) => {
  const filter = {};
  if (str(req.query.courseId)) filter.courseId = assertObjectId(str(req.query.courseId), 'courseId');
  if (str(req.query.subjectId)) filter.subjectId = assertObjectId(str(req.query.subjectId), 'subjectId');
  if (str(req.query.facultyId)) filter.facultyId = assertObjectId(str(req.query.facultyId), 'facultyId');
  if (str(req.query.semester)) filter.semester = Number(str(req.query.semester));
  if (str(req.query.dayOfWeek)) {
    if (!DAYS.includes(str(req.query.dayOfWeek))) throw new ApiError(400, `dayOfWeek must be one of: ${DAYS.join(', ')}`);
    filter.dayOfWeek = str(req.query.dayOfWeek);
  }

  if (req.user.role === 'student') {
    // students always see their own class timetable
    const student = await getStudentProfile(req.user.id);
    filter.courseId = student.courseId;
    filter.semester = student.semester;
  } else if (req.user.role === 'faculty' && bool(req.query.mine)) {
    filter.facultyId = (await getFacultyProfile(req.user.id))._id;
  }

  const entries = await Timetable.find(filter).limit(500).populate(POPULATE);
  ok(res, sortEntries(entries));
});

const getOne = asyncHandler(async (req, res) => {
  const entry = await Timetable.findById(req.params.id).populate(POPULATE);
  if (!entry) throw new ApiError(404, 'Timetable entry not found');
  ok(res, entry);
});

const create = asyncHandler(async (req, res) => {
  const subject = await Subject.findById(assertObjectId(req.body.subjectId, 'subjectId'));
  if (!subject) throw new ApiError(404, 'Subject not found');

  const entry = new Timetable(pick(req.body, FIELDS));
  applySubject(entry, subject);
  await entry.validate();
  await assertNoClash(entry);
  await entry.save();
  created(res, await entry.populate(POPULATE));
});

const update = asyncHandler(async (req, res) => {
  const entry = await Timetable.findById(req.params.id);
  if (!entry) throw new ApiError(404, 'Timetable entry not found');

  if (req.body.subjectId !== undefined) {
    const subject = await Subject.findById(assertObjectId(req.body.subjectId, 'subjectId'));
    if (!subject) throw new ApiError(404, 'Subject not found');
    applySubject(entry, subject);
  }
  entry.set(pick(req.body, FIELDS));
  await entry.validate();
  await assertNoClash(entry);
  await entry.save();
  ok(res, await entry.populate(POPULATE));
});

const remove = asyncHandler(async (req, res) => {
  const entry = await Timetable.findByIdAndDelete(req.params.id);
  if (!entry) throw new ApiError(404, 'Timetable entry not found');
  ok(res, { id: req.params.id }, { message: 'Timetable entry deleted' });
});

module.exports = { list, getOne, create, update, remove };
