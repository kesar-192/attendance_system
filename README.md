# CampusFlow - Student Attendance Management System

MERN stack (Node 20, Express 4, MongoDB 7, React 18 + Vite + Tailwind CSS 3) with JWT authentication and strict
role-based access control for `admin`, `faculty` and `student`.

```
campusflow/
├── backend/            Express API, Mongoose models, Jest + Supertest tests, Dockerfile
├── frontend/           React SPA (Vite, Tailwind, Recharts), nginx.conf, Dockerfile
├── docker-compose.yml  mongo + backend + frontend (only the web port is published)
├── Jenkinsfile         Install -> Lint -> Test -> Build -> Deploy
└── .env.example        variables for docker compose
```

## Quick start (development)

```bash
# 1. MongoDB (any 6/7 instance; this one-liner uses Docker)
docker run -d --name campusflow-mongo -p 27017:27017 mongo:7

# 2. API
cd backend && cp .env.example .env && npm install
npm run seed:demo            # admin + demo courses, faculty, students, 20 days of attendance
npm run dev                  # http://localhost:5000

# 3. Web app (second terminal)
cd frontend && npm install && npm run dev      # http://localhost:5173  (proxies /api to :5000)
```

Demo logins created by `npm run seed:demo` (password `Password@123` unless noted):

| Role    | Email                               | Notes                                   |
|---------|-------------------------------------|-----------------------------------------|
| Admin   | `admin@campusflow.local`            | password `ChangeMe@123` (from `.env`)   |
| Faculty | `meera.iyer@campusflow.local`       | teaches CS301 and CS303                 |
| Student | `aarav@student.campusflow.local`    | healthy attendance                      |
| Student | `rohan@student.campusflow.local`    | below 75% in every subject (shortage UI)|

## Production (Docker)

```bash
cp .env.example .env     # fill in secrets, CORS_ORIGIN, admin credentials
docker compose up -d --build
docker compose --profile tools run --rm seed      # creates the first administrator (idempotent)
```

Only the `frontend` container publishes a port (`WEB_PORT`, default 80). nginx serves the SPA and proxies `/api`
to the backend; MongoDB and the API are reachable only on the private compose network. Containers run
non-root with a read-only filesystem, dropped capabilities and health checks.

## Data model (all references are ObjectIds)

| Model        | Key fields |
|--------------|-----------|
| `User`       | `name`, unique `email`, hashed `password`, `role`, `isActive`, `passwordChangedAt` |
| `Course`     | unique `code`, unique `name`, `department`, `durationSemesters` |
| `Faculty`    | `userId` (unique), unique `employeeId`, `department`, `designation` |
| `Student`    | `userId` (unique), `courseId`, unique `enrollmentNo`, `semester` |
| `Subject`    | unique `code`, `courseId`, `facultyId`, `semester`, `credits` |
| `Attendance` | `studentId`, `subjectId`, `date`, `status`, `method`, `markedBy`; **unique (studentId, subjectId, date)** |
| `Leave`      | `studentId`, `fromDate`, `toDate`, `reason`, `status`, `reviewedBy` |
| `Timetable`  | `subjectId` (+ derived `courseId`, `semester`, `facultyId`), `dayOfWeek`, `startTime`, `endTime`, `room` |
| `Notification`, `QrSession` | in-app notifications; QR sessions (TTL-cleaned a day after expiry) |

Attendance dates are calendar days stored at 00:00 UTC (`YYYY-MM-DD` in the API), so time zones never shift a record
to another day. "Today" is computed in `ATTENDANCE_TZ` (default `Asia/Kolkata`).

## Attendance rules

* `attended = present + late`; `counted = all marked classes except excused`.
* `percentage = attended / counted * 100`; **overall** pools all subjects (it is not an average of percentages).
* `lowAttendanceAlert = counted > 0 && percentage < 75` (`ATTENDANCE_THRESHOLD`). Exactly 75% is not a shortage.
* `classesNeeded` = consecutive classes a student must attend to return to the threshold.
* Students pushed below the threshold get one in-app alert per subject (no repeat while an unread alert exists).

## API overview

All responses use `{ success: true, data, meta? }` or `{ success: false, message, errors? }`.
Duplicate keys -> `409`, validation -> `400`, malformed ObjectId -> `400`, missing token/expired -> `401`, wrong role -> `403`.

| Area | Endpoints | Access |
|------|-----------|--------|
| Auth | `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/change-password`, `POST /api/auth/register` (creates an **admin**) | public / any / any / admin |
| Users | `GET /api/users`, `PATCH /api/users/:id/status` | admin |
| Courses | `GET /api/courses[/:id]` · `POST`, `PATCH /:id`, `DELETE /:id` | all read · admin write |
| Subjects | `GET /api/subjects[/:id]` (`?mine=true`) · `POST`, `PATCH`, `DELETE` | all read · admin + faculty (own subjects) |
| Students | `GET/POST /api/students`, `GET/PATCH/DELETE /:id` · `GET/PATCH /me` | admin · student (self) |
| Faculty | `GET/POST /api/faculty`, `GET/PATCH/DELETE /:id` · `GET/PATCH /me` | admin · faculty (self) |
| Attendance | `POST /bulk`, `GET /roster`, `GET /` (role scoped), `PATCH /:id`, `DELETE /:id` | faculty (own) / admin |
| Analytics | `GET /api/attendance/summary/me`, `/summary/:studentId`, `/trends`, `/reports?format=json\|csv` | student · admin/faculty |
| QR | `POST /api/attendance/qr/generate`, `/:id/refresh`, `/:id/close`, `GET /:id`, `POST /scan` | faculty/admin · student (scan) |
| Leaves | `POST /api/leaves`, `GET /`, `GET /:id`, `PATCH /:id/review`, `PATCH /:id/cancel` | student apply/cancel · faculty (own courses)/admin review |
| Timetable | `GET /api/timetable[/:id]` · `POST`, `PATCH`, `DELETE` | all read · admin write |
| Notifications | `GET /`, `/unread-count`, `PATCH /:id/read`, `/read-all`, `DELETE /:id`, `POST /` (broadcast) | own · admin broadcast |
| Dashboards | `GET /api/dashboard/admin`, `/faculty` | admin · faculty |

Report filters: `courseId`, `semester`, `subjectId`, `studentId`, `from`, `to`, `belowThreshold=true`, `threshold`, `page`, `limit`, `format`.

### Bulk marking

`POST /api/attendance/bulk` `{ subjectId, date, records: [{ studentId, status, remarks? }] }`

The entire payload is validated first (dates, statuses, duplicates, enrolment, ownership) and then written with a single
`bulkWrite` of upserts keyed on the unique `(studentId, subjectId, date)` index. Re-submitting the same sheet, or
submitting it concurrently, can never create duplicates, and unchanged rows are not rewritten. It returns
`{ created, updated, unchanged, lowAttendanceAlerts }`.

### QR attendance

`generate` opens a session (one live session per subject). The QR contains a signed token that lives for
`QR_ROTATE_SECONDS` (30 s); the faculty screen refreshes it automatically, so a screenshot is useless almost
immediately. `scan` verifies the signature, the live session, and that the student's course and semester match the
subject, then inserts a `present` record (`method: "qr"`). It never overwrites a mark the faculty already made.

## Testing

```bash
cd backend
npm test                       # in-memory MongoDB (downloads a binary on first run)
TEST_MONGO_URI=mongodb://127.0.0.1:27017 npm test   # any real MongoDB
./scripts/ci-test.sh           # CI: throw-away mongo:7 container + coverage + JUnit
```

115 integration tests: authentication and token handling, rate limiting, a role-by-endpoint RBAC matrix, data
isolation between faculty and between students, CRUD for every resource (validation, duplicates, invalid ids, cascades),
bulk-marking idempotency and concurrency, percentage maths, CSV output, QR flows, leaves, timetable clashes,
notifications and dashboards. Coverage is about 95% of lines.

## Jenkins

Create a Multibranch Pipeline pointing at this repository. Requirements are listed at the top of the `Jenkinsfile`
(NodeJS tool `NodeJS-20`, Docker on the agent, secret-file credential `campusflow-env-file` holding the production `.env`).
Pull requests run Install -> Lint -> Test -> Build. The `main` branch also deploys with `docker compose up -d`,
waits for both containers to be healthy, smoke-tests the proxy, and rolls back to the previous image tag if the release is unhealthy.

## Security notes

* `helmet`, `cors` allow-list, `express-rate-limit` (global + a stricter, failure-only limiter on login), `express-mongo-sanitize`, 1 MB body limit.
* Production refuses to start without strong, distinct `JWT_SECRET` / `QR_SECRET` and an explicit `CORS_ORIGIN`.
* The user is re-loaded on every request, so deactivation and password changes revoke old tokens immediately.
* Mass-assignment is blocked by whitelisting fields; query values must be plain strings (operator payloads return 400).
* CSV export neutralises spreadsheet formula injection.
* The SPA keeps its JWT in `localStorage` (simple and works with the nginx proxy). The CSP shipped in `nginx.conf` limits
  script sources to reduce the XSS risk; switch to httpOnly cookies + CSRF protection if your threat model requires it.
* Behind a proxy keep `TRUST_PROXY=1` (already set in compose) so rate limiting sees client IPs.
