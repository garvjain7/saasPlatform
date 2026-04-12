import { useState, useEffect, useMemo } from 'react';
import { Search, RefreshCw, Loader } from 'lucide-react';
import AdminLayout from '../../layout/AdminLayout';
import { getUsers, updateUserRole } from '../../services/api';

export default function EmployeesPage() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');

  // Debouncing search
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await getUsers(roleFilter);
      setEmployees(res.users || []);
    } catch (err) {
      console.error('Failed to fetch users:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [roleFilter]);

  const handleRoleChange = async (email, newRole) => {
    setEmployees(prev => prev.map(emp => emp.email === email ? { ...emp, role: newRole } : emp));
    try {
      await updateUserRole(email, newRole);
      fetchData();
    } catch (err) {
      console.error('Failed to update role:', err);
      fetchData();
    }
  };

  const filteredEmployees = useMemo(() => {
    if (!debouncedSearch.trim()) return employees;
    const lowerQ = debouncedSearch.toLowerCase();
    return employees.filter(emp => 
        (emp.full_name && emp.full_name.toLowerCase().includes(lowerQ)) ||
        (emp.email && emp.email.toLowerCase().includes(lowerQ)) ||
        (emp.department && emp.department.toLowerCase().includes(lowerQ))
    );
  }, [employees, debouncedSearch]);

  const getStatusBadge = (status) => {
    if (status) return <span className="admin-badge green">● Active</span>;
    return <span className="admin-badge red">● Inactive</span>;
  };

  return (
    <AdminLayout title="Employees" subtitle="Manage all company users">
      <div className="admin-section-header" style={{ marginBottom: '20px' }}>
        <div className="admin-search-bar" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', flex: 1, maxWidth: '400px' }}>
          <Search size={14} />
          <input 
            type="text" 
            placeholder="Search by name, email, or department..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="admin-btn admin-btn-ghost admin-btn-sm" onClick={fetchData} disabled={loading}>
            <RefreshCw size={12} /> Refresh
          </button>
          <select className="admin-filter-select" value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
            <option value="all">All Roles</option>
            <option value="employee">Employee</option>
            <option value="admin">Admin</option>
            <option value="viewer">Viewer</option>
          </select>
        </div>
      </div>

      <div className="admin-table-wrap">
        <table>
          <thead>
            <tr>
              <th>User</th>
              <th>Role</th>
              <th>Department</th>
              <th>Datasets</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}>
                  <td><div style={{ width: 150, height: 14, background: 'rgba(255,255,255,0.06)', borderRadius: 4 }} /></td>
                  <td><div style={{ width: 80, height: 28, background: 'rgba(255,255,255,0.04)', borderRadius: 6 }} /></td>
                  <td><div style={{ width: 100, height: 14, background: 'rgba(255,255,255,0.04)', borderRadius: 4 }} /></td>
                  <td><div style={{ width: 30, height: 14, background: 'rgba(255,255,255,0.04)', borderRadius: 4 }} /></td>
                  <td><div style={{ width: 60, height: 20, background: 'rgba(255,255,255,0.04)', borderRadius: 10 }} /></td>
                  <td></td>
                </tr>
              ))
            ) : filteredEmployees.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '64px', color: 'var(--text-muted)' }}>
                  No users found
                </td>
              </tr>
            ) : (
              filteredEmployees.map((emp, i) => (
                <tr key={emp.email} style={{ animation: `adminSlideIn 0.4s cubic-bezier(0.16,1,0.3,1) ${0.1 + i * 0.05}s both` }}>
                  <td>
                    <div className="admin-user-cell">
                      <div className="admin-u-avatar" style={{ background: emp.color || '#58a6ff' }}>
                        {emp.initials || emp.full_name?.charAt(0).toUpperCase() || '??'}
                      </div>
                      <div>
                        <div className="admin-u-name">{emp.full_name || 'Unknown'}</div>
                        <div className="admin-u-email">{emp.email}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <select
                      className="admin-role-select"
                      value={emp.role}
                      onChange={e => handleRoleChange(emp.email, e.target.value)}
                    >
                      <option value="employee">employee</option>
                      <option value="admin">admin</option>
                      <option value="viewer">viewer</option>
                    </select>
                  </td>
                  <td style={{ color: 'var(--text-muted)' }}>{emp.department || '—'}</td>
                  <td style={{ fontFamily: "'DM Mono', monospace", fontSize: '12px' }}>{emp.datasets || 0}</td>
                  <td>{getStatusBadge(emp.is_active)}</td>
                  <td><button className="admin-btn admin-btn-ghost admin-btn-sm">⋯</button></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </AdminLayout>
  );
}
