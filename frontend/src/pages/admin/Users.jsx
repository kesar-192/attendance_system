import { useState } from 'react';
import { Plus, UserCheck, UserX } from 'lucide-react';
import client from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import DataTable from '../../components/DataTable';
import FormModal from '../../components/FormModal';
import { Badge, PageHeader } from '../../components/ui';
import { formatDate } from '../../utils/format';

const adminFields = [
  { name: 'name', label: 'Full name', required: true },
  { name: 'email', label: 'Email', type: 'email', required: true },
  { name: 'password', label: 'Password', type: 'password', required: true, colSpan: 2, help: '8+ characters with a letter and a number' }
];

export default function Users() {
  const toast = useToast();
  const { user: me } = useAuth();
  const [role, setRole] = useState('');
  const [reload, setReload] = useState(0);
  const [creating, setCreating] = useState(false);

  const fetcher = async (params) => {
    const { data } = await client.get('/users', { params });
    return { rows: data.data, meta: data.meta };
  };

  async function toggle(user) {
    try {
      await client.patch(`/users/${user._id}/status`, { isActive: !user.isActive });
      toast.success(user.isActive ? 'Account disabled' : 'Account enabled');
      setReload((n) => n + 1);
    } catch (err) {
      toast.fromError(err);
    }
  }

  const columns = [
    { key: 'name', label: 'Name', render: (u) => <span className="font-semibold">{u.name}</span> },
    { key: 'email', label: 'Email' },
    { key: 'role', label: 'Role', render: (u) => <Badge tone={u.role === 'admin' ? 'brand' : 'neutral'}>{u.role}</Badge> },
    { key: 'isActive', label: 'Status', render: (u) => (u.isActive ? <Badge tone="healthy">Active</Badge> : <Badge tone="shortage">Disabled</Badge>) },
    { key: 'createdAt', label: 'Created', render: (u) => formatDate(u.createdAt) },
    {
      key: 'actions',
      label: 'Actions',
      render: (u) =>
        u._id === me.id || u._id === me._id ? (
          <span className="text-xs text-muted">You</span>
        ) : (
          <button type="button" className="btn-ghost px-2 py-1 text-sm" onClick={() => toggle(u)}>
            {u.isActive ? <UserX size={16} /> : <UserCheck size={16} />} {u.isActive ? 'Disable' : 'Enable'}
          </button>
        )
    }
  ];

  return (
    <div>
      <PageHeader
        title="User accounts"
        subtitle="Everyone who can sign in. Disabled accounts are signed out immediately."
        actions={
          <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
            <Plus size={16} /> Add administrator
          </button>
        }
      />
      <DataTable
        columns={columns}
        fetcher={fetcher}
        reloadKey={reload}
        extraParams={{ role: role || undefined }}
        searchPlaceholder="Search by name or email"
        toolbar={
          <select className="input w-auto" value={role} onChange={(e) => setRole(e.target.value)} aria-label="Filter by role">
            <option value="">All roles</option>
            <option value="admin">Admins</option>
            <option value="faculty">Faculty</option>
            <option value="student">Students</option>
          </select>
        }
      />
      <FormModal
        open={creating}
        title="Add administrator"
        fields={adminFields}
        submitLabel="Create account"
        onClose={() => setCreating(false)}
        onSubmit={async (payload) => {
          await client.post('/auth/register', payload);
          toast.success('Administrator created');
          setCreating(false);
          setReload((n) => n + 1);
        }}
      />
    </div>
  );
}
