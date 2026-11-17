import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Bell, BookOpen, CalendarDays, CalendarOff, ClipboardCheck, GraduationCap, LayoutDashboard, LogOut, Menu, QrCode, ScanLine, ShieldCheck, UserCircle, Users, BarChart3, Library, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import NotificationBell from './NotificationBell';

const NAV = {
  admin: [
    { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/admin/students', label: 'Students', icon: GraduationCap },
    { to: '/admin/faculty', label: 'Faculty', icon: Users },
    { to: '/admin/courses', label: 'Courses', icon: Library },
    { to: '/admin/subjects', label: 'Subjects', icon: BookOpen },
    { to: '/admin/timetable', label: 'Timetable', icon: CalendarDays },
    { to: '/admin/reports', label: 'Reports', icon: BarChart3 },
    { to: '/admin/leaves', label: 'Leave requests', icon: CalendarOff },
    { to: '/admin/users', label: 'User accounts', icon: ShieldCheck }
  ],
  faculty: [
    { to: '/faculty', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/faculty/attendance', label: 'Mark attendance', icon: ClipboardCheck },
    { to: '/faculty/qr', label: 'QR session', icon: QrCode },
    { to: '/faculty/reports', label: 'Reports', icon: BarChart3 },
    { to: '/faculty/leaves', label: 'Leave requests', icon: CalendarOff },
    { to: '/faculty/timetable', label: 'My timetable', icon: CalendarDays }
  ],
  student: [
    { to: '/student', label: 'My attendance', icon: LayoutDashboard, end: true },
    { to: '/student/scan', label: 'Scan QR', icon: ScanLine },
    { to: '/student/leaves', label: 'Leave', icon: CalendarOff },
    { to: '/student/timetable', label: 'Timetable', icon: CalendarDays }
  ]
};

const linkClass = ({ isActive }) =>
  `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
    isActive ? 'bg-white/12 text-white shadow-[inset_3px_0_0_#E8A33D]' : 'text-ink-100/80 hover:bg-white/8 hover:text-white'
  }`;

function Sidebar({ onNavigate }) {
  const { user, logout } = useAuth();
  const items = NAV[user.role] || [];
  return (
    <div className="flex h-full flex-col bg-ink text-white">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10">
          <ClipboardCheck size={20} />
        </span>
        <div>
          <p className="font-serif text-lg font-semibold leading-tight">CampusFlow</p>
          <p className="text-xs text-ink-300">Attendance management</p>
        </div>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2" aria-label="Main">
        {items.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={linkClass} onClick={onNavigate}>
            <Icon size={18} aria-hidden="true" />
            {label}
          </NavLink>
        ))}
        <div className="my-3 border-t border-white/10" />
        <NavLink to="/notifications" className={linkClass} onClick={onNavigate}>
          <Bell size={18} aria-hidden="true" /> Notifications
        </NavLink>
        <NavLink to="/profile" className={linkClass} onClick={onNavigate}>
          <UserCircle size={18} aria-hidden="true" /> My profile
        </NavLink>
      </nav>
      <div className="border-t border-white/10 p-4">
        <p className="truncate text-sm font-semibold">{user.name}</p>
        <p className="mb-3 truncate text-xs capitalize text-ink-300">{user.role}</p>
        <button type="button" onClick={logout} className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-ink-100/80 hover:bg-white/8 hover:text-white">
          <LogOut size={16} /> Sign out
        </button>
      </div>
    </div>
  );
}

export default function Layout() {
  const [open, setOpen] = useState(false);
  const { user } = useAuth();
  return (
    <div className="min-h-screen lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">
        <Sidebar />
      </aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-ink/50" onClick={() => setOpen(false)} aria-hidden="true" />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw]">
            <Sidebar onNavigate={() => setOpen(false)} />
            <button type="button" onClick={() => setOpen(false)} aria-label="Close menu" className="absolute right-3 top-4 rounded p-1 text-white/80 hover:bg-white/10">
              <X size={20} />
            </button>
          </aside>
        </div>
      )}

      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-line bg-white/90 px-4 py-2.5 backdrop-blur lg:px-8">
        <button type="button" className="btn-ghost px-2.5 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
          <Menu size={20} />
        </button>
        <p className="hidden text-sm text-muted lg:block">
          Signed in as <span className="font-semibold text-ink">{user.name}</span>
        </p>
        <NotificationBell />
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 lg:px-8">
        <Outlet />
      </main>
    </div>
  );
}
