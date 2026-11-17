import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <p className="font-serif text-5xl font-semibold text-ink">404</p>
      <p className="mt-2 text-muted">This page does not exist or was moved.</p>
      <Link to="/" className="btn-primary mt-5">
        Go to your dashboard
      </Link>
    </div>
  );
}
