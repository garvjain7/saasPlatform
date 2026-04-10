import { useState, useEffect } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Users, Database, Zap, AlertCircle, TrendingUp, ArrowUpRight, RefreshCw, Loader, BarChart3, Sparkles } from 'lucide-react';
import AdminLayout from '../../layout/AdminLayout';
import { getUsers, getDatasets, getUserStats, getQueryVolume } from '../../services/api';

const API_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

function AnimatedNumber({ value, duration = 1200 }) {
  const [display, setDisplay] = useState('0');
  useEffect(() => {
    const numStr = value.toString().replace(/,/g, '');
    const target = parseInt(numStr, 10);
    if (isNaN(target)) { setDisplay(value); return; }
    const start = performance.now();
    const format = (n) => n.toLocaleString();
    const tick = (now) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(format(Math.round(target * eased)));
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [value, duration]);
  return <span>{display}</span>;
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [hoveredBar, setHoveredBar] = useState(null);
  const [animatedBars, setAnimatedBars] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [datasets, setDatasets] = useState([]);
  const [stats, setStats] = useState({ total: 0, active: 0, byRole: { admin: 0, employee: 0, viewer: 0 } });
  const [loading, setLoading] = useState(true);
  const [roleFilter, setRoleFilter] = useState('all');
  const [queryChartData, setQueryChartData] = useState([10, 10, 10, 10, 10, 10, 10]);
  const [queryDayLabels, setQueryDayLabels] = useState(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);

  const role = localStorage.getItem('role');
  if (role !== 'admin') return <Navigate to="/datasets" />;

  const getAuthHeaders = () => {
    const token = localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  useEffect(() => {
    const t = setTimeout(() => setAnimatedBars(true), 400);
    return () => clearTimeout(t);
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [usersRes, datasetsRes, statsRes, volRes] = await Promise.all([
        getUsers(roleFilter),
        getDatasets(),
        getUserStats(),
        getQueryVolume(7).catch(() => ({ success: false })),
      ]);

      setEmployees(usersRes.users || []);
      setDatasets(datasetsRes.data || []);
      setStats(statsRes.stats || { total: 0, active: 0, byRole: { admin: 0, employee: 0, viewer: 0 } });
      if (volRes?.success && Array.isArray(volRes.normalized) && volRes.normalized.length > 0) {
        setQueryChartData(volRes.normalized);
        if (Array.isArray(volRes.days) && volRes.days.length === volRes.normalized.length) {
          setQueryDayLabels(volRes.days);
        }
      }
    } catch (err) {
      console.error('Failed to fetch data:', err);
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
      const { updateUserRole } = await import('../../services/api');
      await updateUserRole(email, newRole);
      fetchData();
    } catch (err) {
      console.error('Failed to update role:', err);
      fetchData();
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'completed':
      case 'ready':
        return <span className="admin-badge green">● Ready</span>;
      case 'processing':
        return <span className="admin-badge yellow">● Processing</span>;
      case 'failed':
        return <span className="admin-badge red">● Failed</span>;
      default:
        return <span className="admin-badge gray">○ {status || 'Unknown'}</span>;
    }
  };

  const getDatasetStatus = (ds) => {
    if (ds.status === 'completed' || ds.status === 'ready') return 'ready';
    if (ds.status === 'processing') return 'processing';
    if (ds.status === 'failed') return 'failed';
    return ds.status || 'ready';
  };

  const formatSize = (bytes) => {
    if (!bytes) return '0 B';
    const mb = bytes / (1024 * 1024);
    if (mb >= 1) return `${mb.toFixed(1)} MB`;
    const kb = bytes / 1024;
    return `${kb.toFixed(1)} KB`;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  const recentDatasets = datasets.slice(0, 8).map(ds => ({
    id: ds.dataset_id || ds.id,
    name: ds.name || ds.filename || 'Unnamed',
    meta: `v${ds.version || 1} · ${ds.rows_count?.toLocaleString() || '—'} rows · ${ds.columns_count || '—'} cols`,
    uploader: ds.uploaded_by?.charAt(0).toUpperCase() || 'U',
    uploaderName: ds.uploaded_by || 'Unknown',
    uploaderColor: '#58a6ff',
    status: getDatasetStatus(ds),
    size: formatSize(ds.file_size || ds.size),
  }));

  const readyDatasets = datasets.filter(d => d.status === 'completed' || d.status === 'ready').length;
  const processingDatasets = datasets.filter(d => d.status === 'processing').length;

  return (
    <AdminLayout title="Dashboard" subtitle="Company overview and management">
      {/* Stat Cards */}
      <div className="admin-stat-grid">
        <div className="admin-stat-card accent">
          <Users size={22} style={{ marginBottom: 12, color: 'var(--primary)' }} />
          <div className="admin-stat-value admin-count-animate"><AnimatedNumber value={String(stats.total)} /></div>
          <div className="admin-stat-label">Total Users</div>
          <div className="admin-stat-delta admin-delta-up">
            <ArrowUpRight size={12} /> {stats.byRole?.employee || 0} employees
          </div>
        </div>
        <div className="admin-stat-card accent">
          <Database size={22} style={{ marginBottom: 12, color: 'var(--primary)' }} />
          <div className="admin-stat-value admin-count-animate"><AnimatedNumber value={String(datasets.length)} /></div>
          <div className="admin-stat-label">Total Datasets</div>
          <div className="admin-stat-delta admin-delta-up">
            <ArrowUpRight size={12} /> {readyDatasets} ready
          </div>
        </div>
        <div className="admin-stat-card green">
          <Zap size={22} style={{ marginBottom: 12, color: 'var(--success)' }} />
          <div className="admin-stat-value admin-count-animate"><AnimatedNumber value={String(readyDatasets)} /></div>
          <div className="admin-stat-label">Ready for Analysis</div>
          <div className="admin-stat-delta admin-delta-up">
            <TrendingUp size={12} /> {processingDatasets} processing
          </div>
        </div>
        <div className="admin-stat-card danger">
          <AlertCircle size={22} style={{ marginBottom: 12, color: 'var(--danger)' }} />
          <div className="admin-stat-value admin-count-animate"><AnimatedNumber value={String(processingDatasets)} /></div>
          <div className="admin-stat-label">Processing</div>
          <div className="admin-stat-delta admin-delta-down">
            <ArrowUpRight size={12} /> In progress
          </div>
        </div>
      </div>

      {/* Row 1: Employees + Activity */}
      <div className="admin-two-col">
        {/* Employee Table */}
        <div>
          <div className="admin-section-header">
            <div>
              <div className="admin-section-title">Users</div>
              <div className="admin-section-sub">{stats.total} total · {stats.active || stats.total} active</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="admin-btn admin-btn-ghost admin-btn-sm" onClick={fetchData} disabled={loading}>
                <RefreshCw size={12} /> Refresh
              </button>
              <select className="admin-filter-select" value={roleFilter} onChange={e => setRoleFilter(e.target.value)} style={{ fontSize: 11 }}>
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
                  <th>Datasets</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i}>
                      <td><div style={{ width: 120, height: 14, background: 'rgba(255,255,255,0.06)', borderRadius: 4 }} /></td>
                      <td><div style={{ width: 80, height: 28, background: 'rgba(255,255,255,0.04)', borderRadius: 6 }} /></td>
                      <td><div style={{ width: 30, height: 14, background: 'rgba(255,255,255,0.04)', borderRadius: 4 }} /></td>
                      <td><div style={{ width: 60, height: 20, background: 'rgba(255,255,255,0.04)', borderRadius: 10 }} /></td>
                      <td></td>
                    </tr>
                  ))
                ) : employees.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>
                      No users found for this filter
                    </td>
                  </tr>
                ) : (
                  employees.map((emp, i) => (
                    <tr key={emp.email} style={{ animation: `adminSlideIn 0.4s cubic-bezier(0.16,1,0.3,1) ${0.1 + i * 0.05}s both` }}>
                      <td>
                        <div className="admin-user-cell">
                          <div className="admin-u-avatar" style={{ background: emp.color || '#58a6ff' }}>{emp.initials || emp.name?.charAt(0).toUpperCase() || '??'}</div>
                          <div>
                            <div className="admin-u-name">{emp.name || 'Unknown'}</div>
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
                      <td style={{ fontFamily: "'DM Mono', monospace", fontSize: '12px' }}>{emp.datasets || 0}</td>
                      <td>{getStatusBadge(emp.status || 'active')}</td>
                      <td><button className="admin-btn admin-btn-ghost admin-btn-sm">⋯</button></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Activity Feed */}
        <div>
          <div className="admin-section-header">
            <div>
              <div className="admin-section-title">Dataset Activity</div>
              <div className="admin-section-sub">{datasets.length} total datasets</div>
            </div>
            <button className="admin-btn admin-btn-ghost admin-btn-sm" onClick={() => navigate('/admin/logs')}>All Logs →</button>
          </div>
          <div className="admin-table-wrap">
            <div className="admin-activity-list">
              {datasets.slice(0, 6).map((ds, i) => {
                const statusColor = ds.status === 'completed' || ds.status === 'ready' ? '#3fb950' : 
                                    ds.status === 'processing' ? '#d29922' : '#f85149';
                return (
                  <div
                    key={ds.dataset_id || ds.id}
                    className="admin-activity-item"
                    style={{ animation: `adminSlideIn 0.4s cubic-bezier(0.16,1,0.3,1) ${0.15 + i * 0.06}s both` }}
                  >
                    <div className="admin-act-dot" style={{ background: statusColor }} />
                    <div className="admin-act-text">
                      <strong>{ds.name || 'Dataset'}</strong> - {ds.status || 'ready'}
                    </div>
                    <div className="admin-act-time">{formatDate(ds.created_at)}</div>
                  </div>
                );
              })}
              {datasets.length === 0 && (
                <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  No dataset activity yet
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Row 2: Datasets + Storage/Charts */}
      <div className="admin-two-col">
        {/* Recent Datasets */}
        <div>
          <div className="admin-section-header">
            <div>
              <div className="admin-section-title">Recent Datasets</div>
              <div className="admin-section-sub">{datasets.length} total uploads</div>
            </div>
            <button className="admin-btn admin-btn-ghost admin-btn-sm" onClick={() => navigate('/admin/datasets')}>View All →</button>
          </div>
          <div className="admin-table-wrap">
            {loading ? (
              <div style={{ padding: '40px', textAlign: 'center' }}>
                <Loader size={24} style={{ animation: 'spin 1s linear infinite', color: 'var(--primary)' }} />
              </div>
            ) : datasets.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                No datasets uploaded yet
              </div>
            ) : (
              <table>
                <thead>
                  <tr><th>Dataset</th><th>Uploaded By</th><th>Status</th><th>Size</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {recentDatasets.map((ds, i) => (
                    <tr key={ds.id} style={{ animation: `adminSlideIn 0.4s cubic-bezier(0.16,1,0.3,1) ${0.2 + i * 0.05}s both` }}>
                      <td>
                        <div className="admin-ds-name">{ds.name}</div>
                        <div className="admin-ds-meta">{ds.meta}</div>
                      </td>
                      <td>
                        <div className="admin-user-cell">
                          <div className="admin-u-avatar" style={{ background: ds.uploaderColor, width: 22, height: 22, fontSize: 9 }}>{ds.uploader}</div>
                          <span style={{ fontSize: '12px' }}>{ds.uploaderName}</span>
                        </div>
                      </td>
                      <td>{getStatusBadge(ds.status)}</td>
                      <td style={{ fontFamily: "'DM Mono', monospace", fontSize: '11px', color: 'var(--text-muted)' }}>{ds.size}</td>
                      <td>
                        {ds.status === 'completed' || ds.status === 'ready' ? (
                          <button className="admin-btn admin-btn-ghost admin-btn-sm" style={{ fontSize: 10, padding: '4px 8px' }}
                            onClick={() => navigate(`/employee/visualization?ds=${ds.id}&name=${encodeURIComponent(ds.name)}`)}>
                            <BarChart3 size={10} /> View
                          </button>
                        ) : (
                          <button className="admin-btn admin-btn-primary admin-btn-sm" style={{ fontSize: 10, padding: '4px 8px' }}
                            onClick={() => navigate(`/employee/cleaning?ds=${ds.id}&name=${encodeURIComponent(ds.name)}`)}>
                            <Sparkles size={10} /> Clean
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Storage + Query Volume */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <div className="admin-section-header">
              <div className="admin-section-title">Dataset Status Distribution</div>
            </div>
            <div className="admin-table-wrap" style={{ padding: '18px 20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
                <div>
                  <span style={{ fontSize: '18px', color: '#3fb950', fontWeight: 600 }}>{readyDatasets}</span>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: 8 }}>Ready</span>
                </div>
                <div>
                  <span style={{ fontSize: '18px', color: '#d29922', fontWeight: 600 }}>{processingDatasets}</span>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: 8 }}>Processing</span>
                </div>
                <div>
                  <span style={{ fontSize: '18px', color: '#f85149', fontWeight: 600 }}>{datasets.filter(d => d.status === 'failed').length}</span>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: 8 }}>Failed</span>
                </div>
              </div>
              <div className="admin-storage-bar">
                <div className="admin-storage-used" style={{ width: `${datasets.length > 0 ? (readyDatasets / datasets.length) * 100 : 0}%` }} />
              </div>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '10px', color: 'var(--text-muted)', marginTop: 6 }}>
                {datasets.length} total datasets
              </div>
            </div>
          </div>

          <div>
            <div className="admin-section-header">
              <div className="admin-section-title">Query volume (7 days, from DB)</div>
            </div>
            <div className="admin-table-wrap" style={{ padding: '14px 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: "'DM Mono', monospace", fontSize: '10px', color: 'var(--text-muted)', marginBottom: 4 }}>
                {queryDayLabels.map(d => <span key={d}>{d}</span>)}
              </div>
              <div className="admin-mini-chart">
                {queryChartData.map((h, i) => (
                  <div
                    key={i}
                    className="admin-chart-bar"
                    style={{
                      height: animatedBars ? `${h}%` : '4%',
                      transitionDelay: `${i * 0.08}s`,
                      opacity: hoveredBar === i ? 1 : 0.7,
                    }}
                    onMouseEnter={() => setHoveredBar(i)}
                    onMouseLeave={() => setHoveredBar(null)}
                  />
                ))}
              </div>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '10px', color: 'var(--text-muted)', marginTop: 8 }}>
                Based on dataset usage
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
      `}</style>
    </AdminLayout>
  );
}
