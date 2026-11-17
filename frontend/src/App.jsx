import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute, { RoleRedirect } from './components/ProtectedRoute';
import { Spinner } from './components/ui';
import Login from './pages/Login';
import NotFound from './pages/NotFound';

const AdminDashboard = lazy(() => import('./pages/admin/Dashboard'));
const Students = lazy(() => import('./pages/admin/Students'));
const FacultyPage = lazy(() => import('./pages/admin/Faculty'));
const Courses = lazy(() => import('./pages/admin/Courses'));
const Subjects = lazy(() => import('./pages/admin/Subjects'));
const Users = lazy(() => import('./pages/admin/Users'));
const FacultyDashboard = lazy(() => import('./pages/faculty/Dashboard'));
const MarkAttendance = lazy(() => import('./pages/faculty/MarkAttendance'));
const QrSession = lazy(() => import('./pages/faculty/QrSession'));
const StudentDashboard = lazy(() => import('./pages/student/Dashboard'));
const ScanQr = lazy(() => import('./pages/student/ScanQr'));
const StudentLeaves = lazy(() => import('./pages/student/Leaves'));
const Reports = lazy(() => import('./pages/shared/Reports'));
const Timetable = lazy(() => import('./pages/shared/Timetable'));
const LeaveReview = lazy(() => import('./pages/shared/LeaveReview'));
const Notifications = lazy(() => import('./pages/shared/Notifications'));
const Profile = lazy(() => import('./pages/shared/Profile'));

export default function App() {
  return (
    <Suspense fallback={<Spinner className="min-h-screen" />}>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route element={<ProtectedRoute />}>
          <Route element={<Layout />}>
            <Route path="/" element={<RoleRedirect />} />
            <Route path="/leaves" element={<RoleRedirect sub="leaves" />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/profile" element={<Profile />} />

            <Route element={<ProtectedRoute roles={['admin']} />}>
              <Route path="/admin" element={<AdminDashboard />} />
              <Route path="/admin/students" element={<Students />} />
              <Route path="/admin/faculty" element={<FacultyPage />} />
              <Route path="/admin/courses" element={<Courses />} />
              <Route path="/admin/subjects" element={<Subjects />} />
              <Route path="/admin/timetable" element={<Timetable manage />} />
              <Route path="/admin/reports" element={<Reports />} />
              <Route path="/admin/leaves" element={<LeaveReview />} />
              <Route path="/admin/users" element={<Users />} />
            </Route>

            <Route element={<ProtectedRoute roles={['faculty']} />}>
              <Route path="/faculty" element={<FacultyDashboard />} />
              <Route path="/faculty/attendance" element={<MarkAttendance />} />
              <Route path="/faculty/qr" element={<QrSession />} />
              <Route path="/faculty/reports" element={<Reports />} />
              <Route path="/faculty/leaves" element={<LeaveReview />} />
              <Route path="/faculty/timetable" element={<Timetable />} />
            </Route>

            <Route element={<ProtectedRoute roles={['student']} />}>
              <Route path="/student" element={<StudentDashboard />} />
              <Route path="/student/scan" element={<ScanQr />} />
              <Route path="/student/leaves" element={<StudentLeaves />} />
              <Route path="/student/timetable" element={<Timetable />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Route>
        </Route>
      </Routes>
    </Suspense>
  );
}
