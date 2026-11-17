import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell } from 'lucide-react';
import client from '../api/client';

export default function NotificationBell() {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = () =>
      client
        .get('/notifications/unread-count')
        .then(({ data }) => alive && setUnread(data.data.unread))
        .catch(() => {});
    load();
    const timer = setInterval(load, 30000);
    window.addEventListener('notifications:changed', load);
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener('notifications:changed', load);
    };
  }, []);

  return (
    <Link to="/notifications" className="btn-ghost relative px-2.5" aria-label={unread ? `${unread} unread notifications` : 'Notifications'}>
      <Bell size={20} />
      {unread > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-shortage px-1 text-[11px] font-bold text-white">{unread > 99 ? '99+' : unread}</span>}
    </Link>
  );
}
