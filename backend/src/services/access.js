const Student = require('../models/Student');
const Faculty = require('../models/Faculty');
const Subject = require('../models/Subject');
const ApiError = require('../utils/ApiError');

async function getStudentProfile(userId) {
  const student = await Student.findOne({ userId });
  if (!student) throw new ApiError(404, 'Student profile not found for this account');
  return student;
}

async function getFacultyProfile(userId) {
  const faculty = await Faculty.findOne({ userId });
  if (!faculty) throw new ApiError(404, 'Faculty profile not found for this account');
  return faculty;
}

/** Ids of the subjects taught by the logged-in faculty member. */
async function facultySubjectIds(userId) {
  const faculty = await getFacultyProfile(userId);
  return Subject.find({ facultyId: faculty._id }).distinct('_id');
}

/** Admins can manage any subject; faculty only subjects assigned to them. */
async function assertCanManageSubject(user, subject) {
  if (user.role === 'admin') return;
  const faculty = await getFacultyProfile(user.id);
  if (String(subject.facultyId) !== String(faculty._id)) {
    throw new ApiError(403, 'You can only manage subjects assigned to you');
  }
}

/**
 * Students whose leave requests / data a user may act on:
 * null = everyone (admin), faculty = students of courses they teach, student = only themselves.
 */
async function visibleStudentIds(user) {
  if (user.role === 'admin') return null;
  if (user.role === 'student') return [(await getStudentProfile(user.id))._id];
  const faculty = await getFacultyProfile(user.id);
  const courseIds = await Subject.find({ facultyId: faculty._id }).distinct('courseId');
  return Student.find({ courseId: { $in: courseIds } }).distinct('_id');
}

module.exports = { getStudentProfile, getFacultyProfile, facultySubjectIds, assertCanManageSubject, visibleStudentIds };
