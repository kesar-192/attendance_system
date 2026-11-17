const request = require('supertest');
const app = require('../src/app');
const User = require('../src/models/User');
const Student = require('../src/models/Student');
const Attendance = require('../src/models/Attendance');
const h = require('./helpers');

beforeAll(h.connectTestDb);
afterAll(h.disconnectTestDb);
beforeEach(h.clearDb);

describe('Courses', () => {
  test('admin CRUD lifecycle and all roles can read', async () => {
    const admin = await h.createAdmin();
    const student = await h.createStudent(await h.createCourse());

    const created = await request(app)
      .post('/api/courses')
      .set(h.bearer(admin.token))
      .send({ name: 'Master of Business', code: 'mba', department: 'Management', durationSemesters: 4 });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ success: true, data: { code: 'MBA', durationSemesters: 4 } });
    const id = created.body.data._id;

    expect((await request(app).get(`/api/courses/${id}`).set(h.bearer(student.token))).body.data.name).toBe('Master of Business');

    const updated = await request(app).patch(`/api/courses/${id}`).set(h.bearer(admin.token)).send({ description: 'Two year programme' });
    expect(updated.status).toBe(200);
    expect(updated.body.data.description).toBe('Two year programme');

    const removed = await request(app).delete(`/api/courses/${id}`).set(h.bearer(admin.token));
    expect(removed.status).toBe(200);
    expect((await request(app).get(`/api/courses/${id}`).set(h.bearer(admin.token))).status).toBe(404);
  });

  test('validation errors, duplicates and bad ids use the standard envelope', async () => {
    const admin = await h.createAdmin();
    const missing = await request(app).post('/api/courses').set(h.bearer(admin.token)).send({ name: 'x' });
    expect(missing.status).toBe(400);
    expect(missing.body.success).toBe(false);
    expect(missing.body.errors.map((e) => e.field)).toEqual(expect.arrayContaining(['code', 'department']));

    const badCode = await request(app).post('/api/courses').set(h.bearer(admin.token)).send({ name: 'Valid Name', code: 'bad code!', department: 'D' });
    expect(badCode.status).toBe(400);

    const body = { name: 'Physics', code: 'PHY', department: 'Science' };
    expect((await request(app).post('/api/courses').set(h.bearer(admin.token)).send(body)).status).toBe(201);
    const dup = await request(app).post('/api/courses').set(h.bearer(admin.token)).send({ ...body, name: 'Physics 2' });
    expect(dup.status).toBe(409);
    expect(dup.body.message).toMatch(/code/);

    const badId = await request(app).get('/api/courses/not-an-id').set(h.bearer(admin.token));
    expect(badId.status).toBe(400);
    expect(badId.body).toEqual({ success: false, message: 'Invalid id' });
    expect((await request(app).get('/api/courses/64b7f0f0f0f0f0f0f0f0f0f0').set(h.bearer(admin.token))).status).toBe(404);
  });

  test('mass assignment is blocked and a course in use cannot be deleted', async () => {
    const admin = await h.createAdmin();
    const course = await h.createCourse();
    await h.createStudent(course);
    const res = await request(app).patch(`/api/courses/${course._id}`).set(h.bearer(admin.token)).send({ _id: '64b7f0f0f0f0f0f0f0f0f0f0', name: 'Renamed Course' });
    expect(res.body.data._id).toBe(String(course._id));

    const del = await request(app).delete(`/api/courses/${course._id}`).set(h.bearer(admin.token));
    expect(del.status).toBe(409);
  });

  test('search and pagination', async () => {
    const admin = await h.createAdmin();
    for (let i = 0; i < 12; i += 1) await h.createCourse({ name: `Engineering ${String(i).padStart(2, '0')}` });
    await h.createCourse({ name: 'Fine Arts', code: 'ARTS' });
    const page2 = await request(app).get('/api/courses?q=engineering&limit=5&page=2').set(h.bearer(admin.token));
    expect(page2.body.data).toHaveLength(5);
    expect(page2.body.meta).toEqual({ page: 2, limit: 5, total: 12, pages: 3 });
    // regex metacharacters in the search box must not blow up
    expect((await request(app).get('/api/courses?q=(').set(h.bearer(admin.token))).status).toBe(200);
  });
});

describe('Subjects', () => {
  test('admin assigns faculty; faculty-created subjects are always owned by the creator', async () => {
    const admin = await h.createAdmin();
    const facultyA = await h.createFaculty();
    const facultyB = await h.createFaculty();
    const course = await h.createCourse();

    const byAdmin = await request(app)
      .post('/api/subjects')
      .set(h.bearer(admin.token))
      .send({ name: 'Algorithms', code: 'cs401', courseId: String(course._id), facultyId: String(facultyA.profile._id), semester: 4 });
    expect(byAdmin.status).toBe(201);
    expect(byAdmin.body.data.code).toBe('CS401');
    expect(byAdmin.body.data.courseId.code).toBe(course.code);
    expect(byAdmin.body.data.facultyId.userId.name).toBe(facultyA.user.name);

    const byFaculty = await request(app)
      .post('/api/subjects')
      .set(h.bearer(facultyB.token))
      .send({ name: 'Compilers', code: 'CS402', courseId: String(course._id), facultyId: String(facultyA.profile._id), semester: 4 });
    expect(byFaculty.status).toBe(201);
    expect(byFaculty.body.data.facultyId._id).toBe(String(facultyB.profile._id)); // facultyId from the body is ignored
  });

  test('requires a valid course / faculty reference and a unique code', async () => {
    const admin = await h.createAdmin();
    const faculty = await h.createFaculty();
    const course = await h.createCourse();
    const base = { name: 'Networks', code: 'CS500', courseId: String(course._id), facultyId: String(faculty.profile._id), semester: 5 };

    expect((await request(app).post('/api/subjects').set(h.bearer(admin.token)).send({ ...base, courseId: 'bogus' })).status).toBe(400);
    expect((await request(app).post('/api/subjects').set(h.bearer(admin.token)).send({ ...base, courseId: '64b7f0f0f0f0f0f0f0f0f0f0' })).status).toBe(404);
    expect((await request(app).post('/api/subjects').set(h.bearer(admin.token)).send({ ...base, facultyId: '64b7f0f0f0f0f0f0f0f0f0f0' })).status).toBe(404);
    expect((await request(app).post('/api/subjects').set(h.bearer(admin.token)).send({ ...base, semester: 13 })).status).toBe(400);
    expect((await request(app).post('/api/subjects').set(h.bearer(admin.token)).send(base)).status).toBe(201);
    expect((await request(app).post('/api/subjects').set(h.bearer(admin.token)).send(base)).status).toBe(409);
  });

  test('only an admin may reassign a subject; faculty may edit their own; filters work', async () => {
    const admin = await h.createAdmin();
    const facultyA = await h.createFaculty();
    const facultyB = await h.createFaculty();
    const course = await h.createCourse();
    const subject = await h.createSubject(course, facultyA, { semester: 2 });
    await h.createSubject(course, facultyB, { semester: 5 });

    const steal = await request(app).patch(`/api/subjects/${subject._id}`).set(h.bearer(facultyA.token)).send({ facultyId: String(facultyB.profile._id) });
    expect(steal.status).toBe(403);
    const reassign = await request(app).patch(`/api/subjects/${subject._id}`).set(h.bearer(admin.token)).send({ facultyId: String(facultyB.profile._id) });
    expect(reassign.status).toBe(200);
    expect(reassign.body.data.facultyId._id).toBe(String(facultyB.profile._id));

    const mine = await request(app).get('/api/subjects?mine=true').set(h.bearer(facultyB.token));
    expect(mine.body.meta.total).toBe(2);
    const bySemester = await request(app).get('/api/subjects?semester=5').set(h.bearer(admin.token));
    expect(bySemester.body.meta.total).toBe(1);
  });

  test('students see subjects of their course & semester with ?mine=true', async () => {
    const faculty = await h.createFaculty();
    const course = await h.createCourse();
    const student = await h.createStudent(course, { profile: { semester: 3 } });
    await h.createSubject(course, faculty, { semester: 3 });
    await h.createSubject(course, faculty, { semester: 4 });
    const res = await request(app).get('/api/subjects?mine=true').set(h.bearer(student.token));
    expect(res.body.meta.total).toBe(1);
  });

  test('cannot delete a subject that has attendance', async () => {
    const { admin, subject, students } = await h.createSchool();
    await Attendance.create({ studentId: students[0].profile._id, subjectId: subject._id, date: new Date('2024-01-01T00:00:00Z'), status: 'present', markedBy: admin.user._id });
    expect((await request(app).delete(`/api/subjects/${subject._id}`).set(h.bearer(admin.token))).status).toBe(409);
    await Attendance.deleteMany({});
    expect((await request(app).delete(`/api/subjects/${subject._id}`).set(h.bearer(admin.token))).status).toBe(200);
  });
});

describe('Students (admin CRUD + self profile)', () => {
  const payload = (course, over = {}) => ({
    name: 'Asha Rao',
    email: 'asha@test.dev',
    password: 'Passw0rd!',
    enrollmentNo: 'bca2024001',
    courseId: String(course._id),
    semester: 2,
    ...over
  });

  test('creates user + profile together; the student can log in; enrollment number is normalised', async () => {
    const admin = await h.createAdmin();
    const course = await h.createCourse();
    const res = await request(app).post('/api/students').set(h.bearer(admin.token)).send(payload(course));
    expect(res.status).toBe(201);
    expect(res.body.data.enrollmentNo).toBe('BCA2024001');
    expect(res.body.data.userId.name).toBe('Asha Rao');
    expect(res.body.data.courseId.code).toBe(course.code);

    const login = await request(app).post('/api/auth/login').send({ email: 'asha@test.dev', password: 'Passw0rd!' });
    expect(login.status).toBe(200);
    expect(login.body.data.user.role).toBe('student');
  });

  test('duplicate enrollmentNo / email -> 409 and no orphan login accounts are left behind', async () => {
    const admin = await h.createAdmin();
    const course = await h.createCourse();
    expect((await request(app).post('/api/students').set(h.bearer(admin.token)).send(payload(course))).status).toBe(201);
    const usersBefore = await User.countDocuments();

    const dupEnrollment = await request(app).post('/api/students').set(h.bearer(admin.token)).send(payload(course, { email: 'other@test.dev' }));
    expect(dupEnrollment.status).toBe(409);
    const dupEmail = await request(app).post('/api/students').set(h.bearer(admin.token)).send(payload(course, { enrollmentNo: 'NEW001' }));
    expect(dupEmail.status).toBe(409);
    expect(await User.countDocuments()).toBe(usersBefore);
    expect(await Student.countDocuments()).toBe(1);
  });

  test('validation and reference checks', async () => {
    const admin = await h.createAdmin();
    const course = await h.createCourse();
    const post = (body) => request(app).post('/api/students').set(h.bearer(admin.token)).send(body);
    expect((await post(payload(course, { courseId: 'nope' }))).status).toBe(400);
    expect((await post(payload(course, { courseId: '64b7f0f0f0f0f0f0f0f0f0f0' }))).status).toBe(404);
    expect((await post(payload(course, { semester: 0 }))).status).toBe(400);
    expect((await post(payload(course, { semester: 2.5 }))).status).toBe(400);
    expect((await post(payload(course, { password: 'short' }))).status).toBe(400);
    expect((await post(payload(course, { enrollmentNo: '!!' }))).status).toBe(400);
    expect(await User.countDocuments({ role: 'student' })).toBe(0);
  });

  test('list supports search by name / email / enrollment, filters and pagination', async () => {
    const admin = await h.createAdmin();
    const course = await h.createCourse();
    const other = await h.createCourse();
    await h.createStudent(course, { user: { name: 'Priya Natarajan' } });
    await h.createStudent(course, { user: { name: 'Rohit Kumar' }, profile: { enrollmentNo: 'ROLL777' } });
    await h.createStudent(other, { user: { name: 'Priya Singh' } });

    const byName = await request(app).get('/api/students?q=priya').set(h.bearer(admin.token));
    expect(byName.body.meta.total).toBe(2);
    const byEnrollment = await request(app).get('/api/students?q=roll777').set(h.bearer(admin.token));
    expect(byEnrollment.body.data[0].userId.name).toBe('Rohit Kumar');
    const byCourse = await request(app).get(`/api/students?courseId=${course._id}&limit=1`).set(h.bearer(admin.token));
    expect(byCourse.body.meta).toMatchObject({ total: 2, pages: 2, limit: 1 });
    expect((await request(app).get('/api/students?courseId=zzz').set(h.bearer(admin.token))).status).toBe(400);
  });

  test('update changes both account and profile; admin can reset the password', async () => {
    const admin = await h.createAdmin();
    const course = await h.createCourse();
    const student = await h.createStudent(course);
    const res = await request(app)
      .patch(`/api/students/${student.profile._id}`)
      .set(h.bearer(admin.token))
      .send({ name: 'Renamed Student', semester: 4, password: 'Brand1New!' });
    expect(res.status).toBe(200);
    expect(res.body.data.userId.name).toBe('Renamed Student');
    expect(res.body.data.semester).toBe(4);
    expect((await request(app).post('/api/auth/login').send({ email: student.user.email, password: 'Brand1New!' })).status).toBe(200);

    const clash = await h.createStudent(course);
    const dup = await request(app).patch(`/api/students/${student.profile._id}`).set(h.bearer(admin.token)).send({ enrollmentNo: clash.profile.enrollmentNo });
    expect(dup.status).toBe(409);
    const dupEmail = await request(app).patch(`/api/students/${student.profile._id}`).set(h.bearer(admin.token)).send({ email: clash.user.email });
    expect(dupEmail.status).toBe(409);
  });

  test('delete cascades to the user account and attendance', async () => {
    const { admin, subject, students } = await h.createSchool();
    const target = students[0];
    await Attendance.create({ studentId: target.profile._id, subjectId: subject._id, date: new Date('2024-01-01T00:00:00Z'), status: 'absent', markedBy: admin.user._id });
    const res = await request(app).delete(`/api/students/${target.profile._id}`).set(h.bearer(admin.token));
    expect(res.status).toBe(200);
    expect(await User.findById(target.user._id)).toBeNull();
    expect(await Attendance.countDocuments({ studentId: target.profile._id })).toBe(0);
    expect((await request(app).get(`/api/students/${target.profile._id}`).set(h.bearer(admin.token))).status).toBe(404);
  });

  test('student self-profile read & update (name, phone, address only)', async () => {
    const course = await h.createCourse();
    const student = await h.createStudent(course);
    const read = await request(app).get('/api/students/me').set(h.bearer(student.token));
    expect(read.status).toBe(200);
    expect(read.body.data.userId.email).toBe(student.user.email);

    const res = await request(app).patch('/api/students/me').set(h.bearer(student.token)).send({ name: 'Updated Name', address: '12 Park Street' });
    expect(res.status).toBe(200);
    expect(res.body.data.userId.name).toBe('Updated Name');
    expect(res.body.data.address).toBe('12 Park Street');
    const invalid = await request(app).patch('/api/students/me').set(h.bearer(student.token)).send({ phone: 'abc' });
    expect(invalid.status).toBe(400);
  });
});

describe('Faculty (admin CRUD + self profile)', () => {
  const payload = { name: 'Dr. Rao', email: 'rao@test.dev', password: 'Passw0rd!', employeeId: 'emp-900', department: 'Physics' };

  test('create, duplicate employeeId, update, delete', async () => {
    const admin = await h.createAdmin();
    const created = await request(app).post('/api/faculty').set(h.bearer(admin.token)).send(payload);
    expect(created.status).toBe(201);
    expect(created.body.data.employeeId).toBe('EMP-900');
    expect((await request(app).post('/api/auth/login').send({ email: payload.email, password: payload.password })).body.data.user.role).toBe('faculty');

    const usersBefore = await User.countDocuments();
    const dup = await request(app).post('/api/faculty').set(h.bearer(admin.token)).send({ ...payload, email: 'rao2@test.dev' });
    expect(dup.status).toBe(409);
    expect(await User.countDocuments()).toBe(usersBefore);

    const upd = await request(app).patch(`/api/faculty/${created.body.data._id}`).set(h.bearer(admin.token)).send({ designation: 'Dean', name: 'Dr. R. Rao' });
    expect(upd.body.data.designation).toBe('Dean');
    expect(upd.body.data.userId.name).toBe('Dr. R. Rao');

    expect((await request(app).delete(`/api/faculty/${created.body.data._id}`).set(h.bearer(admin.token))).status).toBe(200);
    expect(await User.findOne({ email: payload.email })).toBeNull();
  });

  test('faculty who still teach subjects cannot be deleted', async () => {
    const admin = await h.createAdmin();
    const faculty = await h.createFaculty();
    await h.createSubject(await h.createCourse(), faculty);
    const res = await request(app).delete(`/api/faculty/${faculty.profile._id}`).set(h.bearer(admin.token));
    expect(res.status).toBe(409);
  });

  test('faculty self-profile read / update only touches name, phone, designation', async () => {
    const faculty = await h.createFaculty();
    const res = await request(app)
      .patch('/api/faculty/me')
      .set(h.bearer(faculty.token))
      .send({ phone: '+91 98765 43210', designation: 'Professor', employeeId: 'STOLEN1', department: 'Hacking' });
    expect(res.status).toBe(200);
    expect(res.body.data.designation).toBe('Professor');
    expect(res.body.data.employeeId).toBe(faculty.profile.employeeId);
    expect(res.body.data.department).toBe('Computer Science');
    expect((await request(app).get('/api/faculty/me').set(h.bearer(faculty.token))).body.data.phone).toBe('+91 98765 43210');
  });
});

describe('Users (admin)', () => {
  test('list, filter by role and deactivate an account (but never yourself)', async () => {
    const admin = await h.createAdmin();
    const faculty = await h.createFaculty();
    await h.createStudent(await h.createCourse());

    const students = await request(app).get('/api/users?role=student').set(h.bearer(admin.token));
    expect(students.body.meta.total).toBe(1);

    const off = await request(app).patch(`/api/users/${faculty.user._id}/status`).set(h.bearer(admin.token)).send({ isActive: false });
    expect(off.body.data.isActive).toBe(false);
    expect((await request(app).get('/api/faculty/me').set(h.bearer(faculty.token))).status).toBe(401);

    expect((await request(app).patch(`/api/users/${admin.user._id}/status`).set(h.bearer(admin.token)).send({ isActive: false })).status).toBe(400);
    expect((await request(app).patch(`/api/users/${faculty.user._id}/status`).set(h.bearer(admin.token)).send({ isActive: 'no' })).status).toBe(400);
  });
});
