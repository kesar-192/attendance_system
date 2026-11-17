import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Spinner } from './ui';

export const homeFor = (role) => `/${role}`;

/** Requires a signed-in user; with `roles`, also restricts the subtree to those roles. */
export default function ProtectedRoute({ roles }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Spinner label="Restoring your session" className="min-h-screen" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (roles && !roles.includes(user.role)) return <Navigate to={homeFor(user.role)} replace />;
  return <Outlet />;
}

/** "/" and role-agnostic links such as /leaves resolve to the matching page of the current role. */
export function RoleRedirect({ sub = '' }) {
  const { user } = useAuth();
  return <Navigate to={`${homeFor(user.role)}${sub ? `/${sub}` : ''}`} replace />;
}
