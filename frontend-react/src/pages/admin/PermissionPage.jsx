import { useState, useEffect, Fragment } from 'react';
import { Navigate } from 'react-router-dom';
import { Shield, Check, X, Download, Loader, Users, Database, Clock, UserPlus } from 'lucide-react';
import AdminLayout from '../../layout/AdminLayout';
import { getUsers, getDatasets, updateUserRole, getPendingUsers, approveUser } from '../../services/api';

function getPermClass(perm) {
  switch (perm) {
    case 'VIEW': return 'admin-perm-view';
    case 'INSERT': return 'admin-perm-insert';
    case 'UPDATE': return 'admin-perm-update';
    case 'DELETE': return 'admin-perm-delete';
    default: return '';
  }
}

function getBadgeClass(perm) {
  switch (perm) {
    case 'VIEW': return 'admin-badge blue';
    case 'INSERT': return 'admin-badge green';
    case 'UPDATE': return 'admin-badge amber';
    case 'DELETE': return 'admin-badge red';
    default: return 'admin-badge gray';
  }
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function PermissionPage() {
  const role = sessionStorage.getItem('role');
  if (role !== 'admin') return <Navigate to="/datasets" />;

  const [activeTab, setActiveTab] = useState(0);
  const [users, setUsers] = useState([]);
  const [datasets, setDatasets] = useState([]);
  const [pendingUsers, setPendingUsers] = useState([]);
  const [datasetAccessRequests, setDatasetAccessRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [usersRes, datasetsRes, pendingRes] = await Promise.all([
        getUsers('all'),
        getDatasets(),
        getPendingUsers()
      ]);
      setUsers(usersRes.users || []);
      setDatasets(datasetsRes.data || []);
      setPendingUsers(pendingRes.users || []);
    } catch (err) {
      console.error('Failed to fetch data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Poll for localstorage access requests
    const poll = setInterval(() => {
      const reqs = JSON.parse(localStorage.getItem('datasetAccessRequests') || '[]');
      setDatasetAccessRequests(reqs.filter(r => r.status === 'pending'));
    }, 2000);
    return () => clearInterval(poll);
  }, []);

  const handleApprove = async (email) => {
    try {
      await approveUser(email, true);
      fetchData();
    } catch (err) {
      console.error('Failed to approve user:', err);
    }
  };

  const handleDatasetAccessAction = (id, newStatus) => {
    const reqs = JSON.parse(localStorage.getItem('datasetAccessRequests') || '[]');
    const updated = reqs.map(r => r.id === id ? { ...r, status: newStatus } : r);
    localStorage.setItem('datasetAccessRequests', JSON.stringify(updated));
    setDatasetAccessRequests(updated.filter(r => r.status === 'pending'));
  };

  const handleReject = async (email) => {
    try {
      await approveUser(email, false);
      fetchData();
    } catch (err) {
      console.error('Failed to reject user:', err);
    }
  };

  const handleRoleChange = async (email, newRole) => {
    try {
      await updateUserRole(email, newRole);
      fetchData();
    } catch (err) {
      console.error('Failed to update role:', err);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const pendingCount = pendingUsers.length + datasetAccessRequests.length;
  const activeCount = users.filter(u => u.is_active).length;
  const totalCount = users.length;

  const tabs = [
    { label: 'Pending Approval', count: pendingCount, icon: Clock },
    { label: 'Active Users', count: activeCount, icon: Users },
    { label: 'All Users', count: totalCount, icon: UserPlus },
    { label: 'Datasets', count: datasets.length, icon: Database },
  ];

  return (
    <AdminLayout title="User Approvals" subtitle="Manage user registrations and permissions">
      {/* Tabs */}
      <div className="admin-tab-nav">
        {tabs.map((tab, i) => {
          const Icon = tab.icon;
          return (
            <div
              key={i}
              className={`admin-tab-item ${activeTab === i ? 'active' : ''}`}
              onClick={() => setActiveTab(i)}
            >
              <Icon size={14} style={{ marginRight: 6 }} />
              {tab.label}
              <span className="admin-tab-count">{tab.count}</span>
            </div>
          );
        })}
      </div>

      {/* Stats */}
      <div className="admin-three-col" style={{ marginBottom: 20 }}>
        <div className="admin-stat-card accent" style={{ padding: 16 }}>
          <Clock size={20} style={{ marginBottom: 8, color: 'var(--warning)' }} />
          <div className="admin-stat-value" style={{ fontSize: 20 }}>{pendingCount}</div>
          <div className="admin-stat-label">Pending Approval</div>
        </div>
        <div className="admin-stat-card green" style={{ padding: 16 }}>
          <Users size={20} style={{ marginBottom: 8, color: 'var(--success)' }} />
          <div className="admin-stat-value" style={{ fontSize: 20 }}>{activeCount}</div>
          <div className="admin-stat-label">Active Users</div>
        </div>
        <div className="admin-stat-card accent" style={{ padding: 16 }}>
          <Database size={20} style={{ marginBottom: 8, color: 'var(--primary)' }} />
          <div className="admin-stat-value" style={{ fontSize: 20 }}>{datasets.length}</div>
          <div className="admin-stat-label">Datasets</div>
        </div>
      </div>

      {/* Pending Approval Section */}
      {activeTab === 0 && (
        <div style={{ marginBottom: 28 }}>
          <div className="admin-section-header">
            <div>
              <div className="admin-section-title">Pending User Registrations</div>
              <div className="admin-section-sub">{pendingCount} user{pendingCount !== 1 ? 's' : ''} waiting for approval</div>
            </div>
            <button className="admin-btn admin-btn-ghost admin-btn-sm" onClick={fetchData} disabled={loading}>
              <Loader size={12} style={loading ? { animation: 'spin 1s linear infinite' } : {}} /> Refresh
            </button>
          </div>

          {pendingUsers.length === 0 ? (
            <div className="admin-table-wrap" style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <Shield size={36} style={{ marginBottom: 12, opacity: 0.4 }} />
              <p style={{ fontSize: '13px' }}>No pending registrations</p>
            </div>
          ) : (
            pendingUsers.map((user, i) => (
              <div key={user.user_id} className="admin-request-card" style={{ animationDelay: `${i * 0.08}s` }}>
                <div className="admin-u-avatar" style={{ background: user.color || '#58a6ff', width: 38, height: 38, fontSize: 15, borderRadius: 10, flexShrink: 0 }}>
                  {user.initials || user.name?.charAt(0).toUpperCase() || '?'}
                </div>
                <div className="admin-req-body">
                  <div className="admin-req-title">
                    {user.name || 'Unknown User'} - New Employee Registration
                  </div>
                  <div className="admin-req-meta">
                    <span>{user.email}</span>
                    <span>Role: {user.role || 'Employee'}</span>
                    <span>Requested {formatDate(user.created_at)}</span>
                  </div>
                  <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
                    <span className="admin-badge amber">Pending Approval</span>
                  </div>
                </div>
                <div className="admin-req-actions">
                  <button className="admin-btn admin-btn-danger admin-btn-sm" onClick={() => handleReject(user.email)}>
                    <X size={12} /> Reject
                  </button>
                  <button className="admin-btn admin-btn-success admin-btn-sm" onClick={() => handleApprove(user.email)}>
                    <Check size={12} /> Approve
                  </button>
                </div>
              </div>
            ))
          )}

          {datasetAccessRequests.length > 0 && (
            <div style={{ marginTop: 32 }}>
              <div className="admin-section-header">
                <div>
                  <div className="admin-section-title">Dataset Access Requests</div>
                  <div className="admin-section-sub">{datasetAccessRequests.length} request{datasetAccessRequests.length !== 1 ? 's' : ''} for dataset modification access</div>
                </div>
              </div>
              {datasetAccessRequests.map((req, i) => (
                <div key={req.id} className="admin-request-card" style={{ animationDelay: `${i * 0.08}s` }}>
                  <div className="admin-u-avatar" style={{ background: '#cb6ce6', width: 38, height: 38, fontSize: 15, borderRadius: 10, flexShrink: 0 }}>
                    {req.user?.charAt(0).toUpperCase() || '?'}
                  </div>
                  <div className="admin-req-body">
                    <div className="admin-req-title">
                      {req.user} - Requesting Modify Access
                    </div>
                    <div className="admin-req-meta">
                      <span>{req.email}</span>
                      <span>Dataset: {req.dataset}</span>
                      <span>Requested {formatDate(req.time)}</span>
                    </div>
                    <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
                      <span className="admin-badge blue">Modify Permission</span>
                    </div>
                  </div>
                  <div className="admin-req-actions">
                    <button className="admin-btn admin-btn-danger admin-btn-sm" onClick={() => handleDatasetAccessAction(req.id, 'rejected')}>
                      <X size={12} /> Deny
                    </button>
                    <button className="admin-btn admin-btn-success admin-btn-sm" onClick={() => handleDatasetAccessAction(req.id, 'approved')}>
                      <Check size={12} /> Grant Access
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Active Users Section */}
      {activeTab === 1 && (
        <Fragment>
        <div className="admin-section-header">
          <div>
            <div className="admin-section-title">User Permission Matrix</div>
            <div className="admin-section-sub">{users.length} users · {datasets.length} datasets</div>
          </div>
          <button className="admin-btn admin-btn-ghost admin-btn-sm" onClick={fetchData} disabled={loading}>
            <Loader size={12} style={loading ? { animation: 'spin 1s linear infinite' } : {}} /> Refresh
          </button>
        </div>
        <div className="admin-table-wrap">
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center' }}>
              <Loader size={24} style={{ animation: 'spin 1s linear infinite', color: 'var(--primary)' }} />
            </div>
          ) : users.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              No users found
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Datasets</th>
                  <th>Status</th>
                  <th>Joined</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user, i) => (
                  <tr key={user.email} style={{ animation: `adminSlideIn 0.4s cubic-bezier(0.16,1,0.3,1) ${0.1 + i * 0.06}s both` }}>
                    <td>
                      <div className="admin-user-cell">
                        <div className="admin-u-avatar" style={{ background: user.color || '#58a6ff' }}>
                          {user.name?.charAt(0).toUpperCase() || user.email?.charAt(0).toUpperCase() || '?'}
                        </div>
                        <div className="admin-u-name">{user.name || 'Unknown'}</div>
                      </div>
                    </td>
                    <td style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--text-muted)' }}>{user.email}</td>
                    <td>
                      <select
                        className="admin-role-select"
                        value={user.role || 'employee'}
                        onChange={e => handleRoleChange(user.email, e.target.value)}
                        style={{ fontSize: 10 }}
                      >
                        <option value="admin">Admin</option>
                        <option value="employee">Employee</option>
                        <option value="viewer">Viewer</option>
                      </select>
                    </td>
                    <td style={{ fontFamily: "'DM Mono', monospace", fontSize: 11 }}>{user.datasets || 0}</td>
                    <td>
                      <span className={`admin-badge ${user.status === 'active' ? 'green' : user.status === 'inactive' ? 'gray' : 'amber'}`}>
                        {user.status || 'active'}
                      </span>
                    </td>
                    <td style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--text-muted)' }}>{formatDate(user.createdAt)}</td>
                    <td>
                      <button className="admin-btn admin-btn-ghost admin-btn-sm">Edit</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        </Fragment>
      )}

      {/* All Users Section */}
      {activeTab === 2 && (
        <Fragment>
        <div className="admin-section-header">
          <div>
            <div className="admin-section-title">All Users</div>
            <div className="admin-section-sub">{users.length} total users</div>
          </div>
        </div>
        <div className="admin-table-wrap">
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center' }}>
              <Loader size={24} style={{ animation: 'spin 1s linear infinite', color: 'var(--primary)' }} />
            </div>
          ) : users.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              No users found
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Joined</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user, i) => (
                  <tr key={user.email}>
                    <td>
                      <div className="admin-user-cell">
                        <div className="admin-u-avatar" style={{ background: user.color || '#58a6ff' }}>
                          {user.name?.charAt(0).toUpperCase() || user.email?.charAt(0).toUpperCase() || '?'}
                        </div>
                        <div className="admin-u-name">{user.name || 'Unknown'}</div>
                      </div>
                    </td>
                    <td style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--text-muted)' }}>{user.email}</td>
                    <td>{user.role || 'employee'}</td>
                    <td>
                      <span className={`admin-badge ${user.is_active ? 'green' : 'amber'}`}>
                        {user.is_active ? 'Active' : 'Pending'}
                      </span>
                    </td>
                    <td style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--text-muted)' }}>{formatDate(user.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        </Fragment>
      )}

      {/* Datasets Section */}
      {activeTab === 3 && (
        <Fragment>
        <div className="admin-section-header">
          <div>
            <div className="admin-section-title">Datasets</div>
            <div className="admin-section-sub">{datasets.length} total datasets</div>
          </div>
        </div>
        <div className="admin-table-wrap">
          {datasets.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              No datasets uploaded yet
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Dataset</th>
                  <th>Status</th>
                  <th>Uploaded</th>
                </tr>
              </thead>
              <tbody>
                {datasets.map((ds, i) => (
                  <tr key={ds.dataset_id || ds.id}>
                    <td>{ds.name || ds.filename || 'Unknown'}</td>
                    <td>
                      <span className={`admin-badge ${ds.status === 'completed' || ds.status === 'ready' ? 'green' : ds.status === 'processing' ? 'amber' : 'red'}`}>
                        {ds.status || 'unknown'}
                      </span>
                    </td>
                    <td style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--text-muted)' }}>{formatDate(ds.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        </Fragment>
      )}

      <style>{`
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
      `}</style>
    </AdminLayout>
  );
}
