const request = require('supertest');
const app = require('../src/app');
const Attendance = require('../src/models/Attendance');
const Notification = require('../src/models/Notification');
const h = require('./helpers');

beforeAll(h.connectTestDb);
afterAll(h.disconnectTestDb);
beforeEach(h.clearDb);

const bulk = (token, body) => request(app).post('/api/attendance/bulk').set(h.bearer(token)).send(body);
const sheet = (ctx, status = 'present', date = h.today()) => ({
  subjectId: String(ctx.subject._id),
  date,
  records: ctx.students.map((s) => ({ studentId: String(s.profile._id), status }))
});

describe('POST /api/attendance/bulk', () => {
  test('marks a whole class in one call', async () => {
    const ctx = await h.createSchool();
    const res = await bulk(ctx.facultyA.token, sheet(ctx));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ total: 4, created: 4, updated: 0, unchanged: 0 });
    expect(await Attendance.countDocuments()).toBe(4);
    const record = await Attendance.findOne();
    expect(record.date.toISOString()).toBe(`${h.today()}T00:00:00.000Z`);
    expect(String(record.markedBy)).toBe(String(ctx.facultyA.user._id));
  });

  test('is idempotent: re-submitting never creates duplicates, changes only update', async () => {
    const ctx = await h.createSchool();
    await bulk(ctx.facultyA.token, sheet(ctx));
    const again = await bulk(ctx.facultyA.token, sheet(ctx));
    expect(again.body.data).toMatchObject({ created: 0, updated: 0, unchanged: 4 });

    const changed = sheet(ctx);
    changed.records[0].status = 'absent';
    const fix = await bulk(ctx.facultyA.token, changed);
    expect(fix.body.data).toMatchObject({ created: 0, updated: 1, unchanged: 3 });
    expect(await Attendance.countDocuments()).toBe(4);
    expect((await Attendance.findOne({ studentId: ctx.students[0].profile._id })).status).toBe('absent');
  });

  test('remarks starting with "$" are stored literally (never evaluated as a field path)', async () => {
    const ctx = await h.createSchool();
    const body = sheet(ctx);
    body.records[0].remarks = '$status';
    expect((await bulk(ctx.facultyA.token, body)).status).toBe(200);
    expect((await Attendance.findOne({ studentId: ctx.students[0].profile._id })).remarks).toBe('$status');
  });

  test('concurrent identical submissions still leave exactly one record per student', async () => {
    const ctx = await h.createSchool();
    const results = await Promise.all(Array.from({ length: 6 }, () => bulk(ctx.facultyA.token, sheet(ctx))));
    results.forEach((r) => expect(r.status).toBe(200));
    expect(await Attendance.countDocuments()).toBe(4);
  });

  test('a different date creates new records; admin may mark any subject', async () => {
    const ctx = await h.createSchool();
    await bulk(ctx.facultyA.token, sheet(ctx, 'present', h.daysAgo(1)));
    const res = await bulk(ctx.admin.token, sheet(ctx, 'absent', h.today()));
    expect(res.status).toBe(200);
    expect(await Attendance.countDocuments()).toBe(8);
  });

  test('validates the whole payload before writing anything', async () => {
    const ctx = await h.createSchool();
    const ids = ctx.students.map((s) => String(s.profile._id));
    const cases = [
      [{ ...sheet(ctx), records: [] }, /non-empty/],
      [{ ...sheet(ctx), date: '2030-13-45' }, /calendar date|YYYY-MM-DD/],
      [{ ...sheet(ctx), date: '10/11/2025' }, /YYYY-MM-DD/],
      [{ ...sheet(ctx), date: '2999-01-01' }, /future/],
      [{ ...sheet(ctx), subjectId: 'bad' }, /subjectId/],
      [{ ...sheet(ctx), records: [{ studentId: ids[0], status: 'present' }, { studentId: ids[1], status: 'sleeping' }] }, /status/],
      [{ ...sheet(ctx), records: [{ studentId: ids[0], status: 'present' }, { studentId: ids[0], status: 'absent' }] }, /Duplicate/],
      [{ ...sheet(ctx), records: [{ studentId: 'x', status: 'present' }] }, /studentId/],
      [{ ...sheet(ctx), records: [{ studentId: ids[0], status: 'present', remarks: 'x'.repeat(201) }] }, /remarks/],
      [{ ...sheet(ctx), records: [{ studentId: String(ctx.otherSemester.profile._id), status: 'present' }, { studentId: ids[0], status: 'present' }] }, /not enrolled/]
    ];
    for (const [body, pattern] of cases) {
      const res = await bulk(ctx.facultyA.token, body);
      expect([res.status, res.body.message]).toEqual([400, expect.stringMatching(pattern)]);
    }
    expect(await Attendance.countDocuments()).toBe(0); // nothing was half-applied
  });

  test('unknown subject -> 404; students and other faculty -> 403', async () => {
    const ctx = await h.createSchool();
    expect((await bulk(ctx.facultyA.token, { ...sheet(ctx), subjectId: '64b7f0f0f0f0f0f0f0f0f0f0' })).status).toBe(404);
    expect((await bulk(ctx.students[0].token, sheet(ctx))).status).toBe(403);
    expect((await bulk(ctx.facultyB.token, sheet(ctx))).status).toBe(403);
  });

  test('a payload larger than the limit is rejected', async () => {
    const ctx = await h.createSchool();
    const records = Array.from({ length: 1001 }, () => ({ studentId: String(ctx.students[0].profile._id), status: 'present' }));
    expect((await bulk(ctx.facultyA.token, { ...sheet(ctx), records })).status).toBe(400);
  });
});

describe('GET /api/attendance/roster', () => {
  test('lists enrolled students only, with any existing marks', async () => {
    const ctx = await h.createSchool();
    const partial = { ...sheet(ctx), records: [{ studentId: String(ctx.students[0].profile._id), status: 'late' }] };
    await bulk(ctx.facultyA.token, partial);
    const res = await request(app).get(`/api/attendance/roster?subjectId=${ctx.subject._id}`).set(h.bearer(ctx.facultyA.token));
    expect(res.status).toBe(200);
    expect(res.body.data.students).toHaveLength(4); // the semester-4 student is not on the roster
    const first = res.body.data.students.find((s) => s.studentId === String(ctx.students[0].profile._id));
    expect(first.status).toBe('late');
    expect(res.body.data.students.filter((s) => s.status === null)).toHaveLength(3);
  });
});

describe('attendance summaries, alerts and corrections', () => {
  async function markDays(ctx, student, statuses) {
    for (let i = 0; i < statuses.length; i += 1) {
      await bulk(ctx.facultyA.token, {
        subjectId: String(ctx.subject._id),
        date: h.daysAgo(i + 1),
        records: [{ studentId: String(student.profile._id), status: statuses[i] }]
      });
    }
  }

  test('percentage maths: late counts as attended, excused is neutral, 75% is not a shortage', async () => {
    const ctx = await h.createSchool();
    const [s1, s2, s3] = ctx.students;
    await markDays(ctx, s1, ['present', 'present', 'present', 'absent']); // 75%
    await markDays(ctx, s2, ['present', 'late', 'absent', 'absent']); // 50%
    await markDays(ctx, s3, ['present', 'excused', 'excused', 'present', 'absent']); // 2/3 = 66.67

    const get = async (s) => (await request(app).get('/api/attendance/summary/me').set(h.bearer(s.token))).body.data;
    const a = await get(s1);
    expect(a.subjects[0]).toMatchObject({ percentage: 75, lowAttendanceAlert: false, total: 4 });
    const b = await get(s2);
    expect(b.subjects[0]).toMatchObject({ percentage: 50, lowAttendanceAlert: true, late: 1, classesNeeded: 4 });
    expect(b.lowAttendanceSubjects).toEqual([ctx.subject.code]);
    const c = await get(s3);
    expect(c.subjects[0]).toMatchObject({ percentage: 66.67, counted: 3, excused: 2, lowAttendanceAlert: true });
    expect(c.overall.percentage).toBe(66.67);
  });

  test('overall percentage pools all subjects; subjects without records show 0 classes and no alert', async () => {
    const ctx = await h.createSchool();
    const second = await h.createSubject(ctx.course, ctx.facultyA);
    await markDays(ctx, ctx.students[0], ['present', 'present', 'absent', 'absent']); // 50% in subject 1
    for (const date of [h.daysAgo(1), h.daysAgo(2)]) {
      await bulk(ctx.facultyA.token, { subjectId: String(second._id), date, records: [{ studentId: String(ctx.students[0].profile._id), status: 'present' }] });
    }
    const res = (await request(app).get('/api/attendance/summary/me').set(h.bearer(ctx.students[0].token))).body.data;
    expect(res.subjects).toHaveLength(2);
    expect(res.overall).toMatchObject({ counted: 6, attended: 4, percentage: 66.67 });

    const fresh = (await request(app).get('/api/attendance/summary/me').set(h.bearer(ctx.students[1].token))).body.data;
    expect(fresh.subjects.every((s) => s.total === 0 && s.lowAttendanceAlert === false)).toBe(true);
  });

  test('faculty see a student’s summary restricted to their own subjects', async () => {
    const ctx = await h.createSchool();
    const otherFacultySubject = await h.createSubject(ctx.course, ctx.facultyB);
    await markDays(ctx, ctx.students[0], ['absent']);
    await bulk(ctx.facultyB.token, { subjectId: String(otherFacultySubject._id), date: h.daysAgo(1), records: [{ studentId: String(ctx.students[0].profile._id), status: 'present' }] });
    const res = await request(app).get(`/api/attendance/summary/${ctx.students[0].profile._id}`).set(h.bearer(ctx.facultyA.token));
    expect(res.body.data.subjects.map((s) => s.code)).toEqual([ctx.subject.code]);
    expect(res.body.data.overall.percentage).toBe(0);
  });

  test('students pushed below the threshold get exactly one unread alert notification', async () => {
    const ctx = await h.createSchool();
    await markDays(ctx, ctx.students[0], ['absent', 'absent']);
    const alerts = await Notification.find({ userId: ctx.students[0].user._id, type: 'alert' });
    expect(alerts).toHaveLength(1);
    expect(alerts[0].message).toMatch(/0%/);
    expect(String(alerts[0].meta.subjectId)).toBe(String(ctx.subject._id));
    const res = await bulk(ctx.facultyA.token, { subjectId: String(ctx.subject._id), date: h.daysAgo(5), records: [{ studentId: String(ctx.students[0].profile._id), status: 'absent' }] });
    expect(res.body.data.lowAttendanceAlerts).toEqual([String(ctx.students[0].profile._id)]);
    expect(await Notification.countDocuments({ userId: ctx.students[0].user._id, type: 'alert' })).toBe(1);
  });

  test('list is paginated and filterable; PATCH corrects a record; DELETE is admin-only', async () => {
    const ctx = await h.createSchool();
    await bulk(ctx.facultyA.token, sheet(ctx, 'present', h.daysAgo(2)));
    await bulk(ctx.facultyA.token, sheet(ctx, 'absent', h.daysAgo(1)));

    const page = await request(app).get('/api/attendance?limit=3&page=1').set(h.bearer(ctx.facultyA.token));
    expect(page.body.meta).toMatchObject({ total: 8, pages: 3, limit: 3 });
    const absents = await request(app).get('/api/attendance?status=absent').set(h.bearer(ctx.admin.token));
    expect(absents.body.meta.total).toBe(4);
    const day = await request(app).get(`/api/attendance?date=${h.daysAgo(2)}`).set(h.bearer(ctx.admin.token));
    expect(day.body.meta.total).toBe(4);
    expect((await request(app).get('/api/attendance?status=nope').set(h.bearer(ctx.admin.token))).status).toBe(400);

    const id = absents.body.data[0]._id;
    const patch = await request(app).patch(`/api/attendance/${id}`).set(h.bearer(ctx.facultyA.token)).send({ status: 'excused', remarks: 'Medical' });
    expect(patch.body.data).toMatchObject({ status: 'excused', remarks: 'Medical' });
    expect((await request(app).patch(`/api/attendance/${id}`).set(h.bearer(ctx.facultyB.token)).send({ status: 'present' })).status).toBe(403);
    expect((await request(app).patch(`/api/attendance/${id}`).set(h.bearer(ctx.facultyA.token)).send({ status: 'bogus' })).status).toBe(400);
    expect((await request(app).delete(`/api/attendance/${id}`).set(h.bearer(ctx.facultyA.token))).status).toBe(403);
    expect((await request(app).delete(`/api/attendance/${id}`).set(h.bearer(ctx.admin.token))).status).toBe(200);
  });
});

describe('GET /api/attendance/reports', () => {
  async function seedReport() {
    const ctx = await h.createSchool();
    const [a, b, c] = ctx.students;
    const mark = (student, date, status) =>
      bulk(ctx.facultyA.token, { subjectId: String(ctx.subject._id), date, records: [{ studentId: String(student.profile._id), status }] });
    for (let i = 1; i <= 4; i += 1) {
      await mark(a, h.daysAgo(i), 'present'); // 100%
      await mark(b, h.daysAgo(i), i <= 2 ? 'present' : 'absent'); // 50%
      await mark(c, h.daysAgo(i), i === 1 ? 'present' : 'absent'); // 25%
    }
    return ctx;
  }

  test('returns per student/subject percentages sorted worst-first, with the alert flag', async () => {
    const ctx = await seedReport();
    const res = await request(app).get('/api/attendance/reports').set(h.bearer(ctx.admin.token));
    expect(res.status).toBe(200);
    expect(res.body.data.map((r) => r.percentage)).toEqual([25, 50, 100]);
    expect(res.body.data.map((r) => r.lowAttendanceAlert)).toEqual([true, true, false]);
    expect(res.body.meta).toMatchObject({ total: 3, threshold: 75, belowThresholdCount: 2 });
  });

  test('filters: belowThreshold, custom threshold, subject, course, semester, student, date range, pagination', async () => {
    const ctx = await seedReport();
    const get = (qs) => request(app).get(`/api/attendance/reports?${qs}`).set(h.bearer(ctx.admin.token));

    expect((await get('belowThreshold=true')).body.data).toHaveLength(2);
    expect((await get('belowThreshold=true&threshold=40')).body.data).toHaveLength(1);
    expect((await get(`subjectId=${ctx.subject._id}`)).body.data).toHaveLength(3);
    expect((await get(`courseId=${ctx.course._id}&semester=3`)).body.data).toHaveLength(3);
    expect((await get(`courseId=${ctx.course._id}&semester=4`)).body.data).toHaveLength(0);
    expect((await get(`studentId=${ctx.students[1].profile._id}`)).body.data[0].percentage).toBe(50);
    // only the last two days: student b is 100%, student c is 50%
    const recent = await get(`from=${h.daysAgo(2)}&to=${h.daysAgo(1)}`);
    expect(recent.body.data.map((r) => r.percentage)).toEqual([50, 100, 100]);
    const paged = await get('limit=2&page=2');
    expect(paged.body.data).toHaveLength(1);
    expect(paged.body.meta).toMatchObject({ pages: 2, total: 3 });

    expect((await get('threshold=250')).status).toBe(400);
    expect((await get('format=xml')).status).toBe(400);
    expect((await get('from=yesterday')).status).toBe(400);
  });

  test('faculty reports only include their own subjects', async () => {
    const ctx = await seedReport();
    const mine = await request(app).get('/api/attendance/reports').set(h.bearer(ctx.facultyA.token));
    expect(mine.body.data).toHaveLength(3);
    const theirs = await request(app).get('/api/attendance/reports').set(h.bearer(ctx.facultyB.token));
    expect(theirs.body.data).toHaveLength(0);
  });

  test('CSV export: headers, rows and spreadsheet-formula neutralisation', async () => {
    const ctx = await h.createSchool();
    const evil = await h.createStudent(ctx.course, { user: { name: '=HYPERLINK("http://evil","x"), Smith' } });
    await bulk(ctx.facultyA.token, { subjectId: String(ctx.subject._id), date: h.today(), records: [{ studentId: String(evil.profile._id), status: 'absent' }] });

    const res = await request(app).get('/api/attendance/reports?format=csv&belowThreshold=true').set(h.bearer(ctx.admin.token));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="attendance-report-\d{4}-\d{2}-\d{2}\.csv"/);
    const lines = res.text.replace(/^\uFEFF/, '').trim().split('\r\n');
    expect(lines[0]).toBe('Enrollment No,Student,Course,Semester,Subject Code,Subject,Total Classes,Present,Late,Absent,Excused,Attendance %,Below Threshold');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain(evil.profile.enrollmentNo);
    expect(lines[1]).toContain(`"'=HYPERLINK(""http://evil"",""x""), Smith"`); // apostrophe prefix + RFC-4180 quoting
    expect(lines[1].endsWith(',0,true')).toBe(true);
  });
});

describe('GET /api/attendance/trends', () => {
  test('returns an ascending daily series', async () => {
    const ctx = await h.createSchool();
    await bulk(ctx.facultyA.token, sheet(ctx, 'present', h.daysAgo(3)));
    const mixed = sheet(ctx, 'present', h.daysAgo(1));
    mixed.records[0].status = 'absent';
    await bulk(ctx.facultyA.token, mixed);

    const res = await request(app).get(`/api/attendance/trends?subjectId=${ctx.subject._id}`).set(h.bearer(ctx.facultyA.token));
    expect(res.status).toBe(200);
    expect(res.body.data.map((d) => [d.date, d.percentage])).toEqual([
      [h.daysAgo(3), 100],
      [h.daysAgo(1), 75]
    ]);
    expect((await request(app).get(`/api/attendance/trends?subjectId=${ctx.subject._id}`).set(h.bearer(ctx.facultyB.token))).status).toBe(403);
  });
});
