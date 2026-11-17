const Course = require('../models/Course');
const Student = require('../models/Student');
const Subject = require('../models/Subject');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { ok, created } = require('../utils/response');
const { pick, parsePagination, buildMeta, searchRegex, str } = require('../utils/helpers');

const FIELDS = ['name', 'code', 'department', 'durationSemesters', 'description'];

const list = asyncHandler(async (req, res) => {
  const pagination = parsePagination(req.query, { defaultLimit: 10, maxLimit: 200 });
  const filter = {};
  const q = str(req.query.q);
  const department = str(req.query.department);
  if (q) {
    const rx = searchRegex(q);
    filter.$or = [{ name: rx }, { code: rx }];
  }
  if (department) filter.department = department;

  const [courses, total] = await Promise.all([
    Course.find(filter).sort({ name: 1 }).skip(pagination.skip).limit(pagination.limit),
    Course.countDocuments(filter)
  ]);
  ok(res, courses, { meta: buildMeta(pagination, total) });
});

const getOne = asyncHandler(async (req, res) => {
  const course = await Course.findById(req.params.id);
  if (!course) throw new ApiError(404, 'Course not found');
  ok(res, course);
});

const create = asyncHandler(async (req, res) => {
  created(res, await Course.create(pick(req.body, FIELDS)));
});

const update = asyncHandler(async (req, res) => {
  const course = await Course.findById(req.params.id);
  if (!course) throw new ApiError(404, 'Course not found');
  course.set(pick(req.body, FIELDS));
  await course.save();
  ok(res, course);
});

const remove = asyncHandler(async (req, res) => {
  const course = await Course.findById(req.params.id);
  if (!course) throw new ApiError(404, 'Course not found');
  const [students, subjects] = await Promise.all([
    Student.countDocuments({ courseId: course._id }),
    Subject.countDocuments({ courseId: course._id })
  ]);
  if (students || subjects) {
    throw new ApiError(409, `Cannot delete a course that still has ${students} student(s) and ${subjects} subject(s)`);
  }
  await course.deleteOne();
  ok(res, { id: req.params.id }, { message: 'Course deleted' });
});

module.exports = { list, getOne, create, update, remove };
