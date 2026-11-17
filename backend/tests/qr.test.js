const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const Attendance = require('../src/models/Attendance');
const h = require('./helpers');

beforeAll(h.connectTestDb);
afterAll(h.disconnectTestDb);
beforeEach(h.clearDb);

const generate = (token, body) => request(app).post('/api/attendance/qr/generate').set(h.bearer(token)).send(body);
const scan = (token, qr) => request(app).post('/api/attendance/qr/scan').set(h.bearer(token)).send({ token: qr });

describe('QR attendance', () => {
  test('faculty generates a time-bound token; an enrolled student scans it and is marked present', async () => {
    const ctx = await h.createSchool();
    const gen = await generate(ctx.facultyA.token, { subjectId: String(ctx.subject._id), durationMinutes: 5 });
    expect(gen.status).toBe(201);
    const { token, sessionId, rotateSeconds, expiresAt } = gen.body.data;
    expect(rotateSeconds).toBeLessThanOrEqual(30);
    expect(new Date(expiresAt) - Date.now()).toBeLessThanOrEqual(5 * 60 * 1000);
    const decoded = jwt.verify(token, process.env.QR_SECRET, { audience: 'campusflow:qr' });
    expect(decoded.sid).toBe(sessionId);
    expect(decoded.exp - decoded.iat).toBeLessThanOrEqual(30);

    const res = await scan(ctx.students[0].token, token);
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ alreadyMarked: false, status: 'present' });
    const record = await Attendance.findOne({ studentId: ctx.students[0].profile._id });
    expect(record).toMatchObject({ status: 'present', method: 'qr' });
    expect(record.date.toISOString()).toBe(`${h.today()}T00:00:00.000Z`);

    const status = await request(app).get(`/api/attendance/qr/${sessionId}`).set(h.bearer(ctx.facultyA.token));
    expect(status.body.data).toMatchObject({ active: true, scanned: 1 });
  });

  test('double scans are harmless and never overwrite a manual mark', async () => {
    const ctx = await h.createSchool();
    const { token } = (await generate(ctx.facultyA.token, { subjectId: String(ctx.subject._id) })).body.data;

    await request(app)
      .post('/api/attendance/bulk')
      .set(h.bearer(ctx.facultyA.token))
      .send({ subjectId: String(ctx.subject._id), date: h.today(), records: [{ studentId: String(ctx.students[1].profile._id), status: 'absent' }] });
    const blocked = await scan(ctx.students[1].token, token);
    expect(blocked.status).toBe(200);
    expect(blocked.body.data).toMatchObject({ alreadyMarked: true, status: 'absent' });

    expect((await scan(ctx.students[0].token, token)).status).toBe(201);
    const second = await scan(ctx.students[0].token, token);
    expect(second.status).toBe(200);
    expect(second.body.data.alreadyMarked).toBe(true);
    expect(await Attendance.countDocuments()).toBe(2);
  });

  test('concurrent scans by the same student create a single record', async () => {
    const ctx = await h.createSchool();
    const { token } = (await generate(ctx.facultyA.token, { subjectId: String(ctx.subject._id) })).body.data;
    const results = await Promise.all(Array.from({ length: 5 }, () => scan(ctx.students[0].token, token)));
    results.forEach((r) => expect([200, 201]).toContain(r.status));
    expect(await Attendance.countDocuments()).toBe(1);
  });

  test('students outside the subject’s course / semester cannot mark attendance', async () => {
    const ctx = await h.createSchool();
    const { token } = (await generate(ctx.facultyA.token, { subjectId: String(ctx.subject._id) })).body.data;
    expect((await scan(ctx.otherSemester.token, token)).status).toBe(403);
    const foreign = await h.createStudent(await h.createCourse());
    expect((await scan(foreign.token, token)).status).toBe(403);
    expect(await Attendance.countDocuments()).toBe(0);
  });

  test('expired, forged and non-QR tokens are rejected with 400 (never 401)', async () => {
    const ctx = await h.createSchool();
    const { token, sessionId } = (await generate(ctx.facultyA.token, { subjectId: String(ctx.subject._id) })).body.data;
    const expired = jwt.sign({ sid: sessionId }, process.env.QR_SECRET, { audience: 'campusflow:qr', expiresIn: -5 });
    const forged = jwt.sign({ sid: sessionId }, 'attacker-secret', { audience: 'campusflow:qr' });
    const wrongAudience = jwt.sign({ sid: sessionId }, process.env.QR_SECRET, { audience: 'something-else' });
    for (const bad of [expired, forged, wrongAudience, ctx.students[0].token, 'garbage']) {
      const res = await scan(ctx.students[0].token, bad);
      expect(res.status).toBe(400);
    }
    expect((await request(app).post('/api/attendance/qr/scan').set(h.bearer(ctx.students[0].token)).send({})).status).toBe(400);
    expect((await scan(ctx.students[0].token, token)).status).toBe(201); // the real one still works
  });

  test('refresh issues a new token; closing or replacing a session invalidates old codes', async () => {
    const ctx = await h.createSchool();
    const first = (await generate(ctx.facultyA.token, { subjectId: String(ctx.subject._id) })).body.data;
    await new Promise((r) => setTimeout(r, 1100)); // iat changes so the refreshed token differs
    const refreshed = await request(app).post(`/api/attendance/qr/${first.sessionId}/refresh`).set(h.bearer(ctx.facultyA.token));
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.data.token).not.toBe(first.token);
    expect((await request(app).post(`/api/attendance/qr/${first.sessionId}/refresh`).set(h.bearer(ctx.facultyB.token))).status).toBe(403);

    // generating a new session for the subject retires the previous one
    const second = (await generate(ctx.facultyA.token, { subjectId: String(ctx.subject._id) })).body.data;
    expect((await scan(ctx.students[0].token, refreshed.body.data.token)).status).toBe(410);
    expect((await request(app).post(`/api/attendance/qr/${first.sessionId}/refresh`).set(h.bearer(ctx.facultyA.token))).status).toBe(410);

    const closed = await request(app).post(`/api/attendance/qr/${second.sessionId}/close`).set(h.bearer(ctx.facultyA.token));
    expect(closed.body.data.active).toBe(false);
    expect((await scan(ctx.students[0].token, second.token)).status).toBe(410);
  });

  test('generate validates input and ownership', async () => {
    const ctx = await h.createSchool();
    const sid = String(ctx.subject._id);
    expect((await generate(ctx.facultyA.token, { subjectId: 'x' })).status).toBe(400);
    expect((await generate(ctx.facultyA.token, { subjectId: sid, durationMinutes: 0 })).status).toBe(400);
    expect((await generate(ctx.facultyA.token, { subjectId: sid, durationMinutes: 9999 })).status).toBe(400);
    expect((await generate(ctx.facultyA.token, { subjectId: sid, durationMinutes: 1.5 })).status).toBe(400);
    expect((await generate(ctx.facultyA.token, { subjectId: '64b7f0f0f0f0f0f0f0f0f0f0' })).status).toBe(404);
    expect((await generate(ctx.facultyB.token, { subjectId: sid })).status).toBe(403);
    expect((await generate(ctx.admin.token, { subjectId: sid })).status).toBe(201);
  });
});
