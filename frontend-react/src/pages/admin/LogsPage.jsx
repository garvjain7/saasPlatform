import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { Filter, X, Loader, Database, Users, Clock, Eye, Sparkles, BarChart3, FileText, Upload, MessageSquare } from 'lucide-react';
import AdminLayout from '../../layout/AdminLayout';
import { getActivityLogs, getActivityStats, getDatasetsAdmin } from '../../services/api';

function getMethodClass(event) {
  switch (event) {
    case 'LOGIN': return 'admin-method-get';
    case 'LOGOUT': return 'admin-method-get';
    case 'QUERY': return 'admin-method-get';
    case 'MODIFY': return 'admin-method-blocked';
    case 'CLEAN': return 'admin-method-post';
    case 'VISUALIZE': return 'admin-method-post';
    case 'VIEW_SUMMARY': return 'admin-method-get';
    case 'ACCESS_DATASET': return 'admin-method-get';
    case 'UPLOAD': return 'admin-method-post';
    case 'VIEW': return 'admin-method-get';
    case 'TRAIN': return 'admin-method-post';
    case 'UPDATE': return 'admin-method-post';
    case 'SESSION': return 'admin-method-get';
    default: return 'admin-method-get';
  }
}

function getEventIcon(event) {
  switch (event) {
    case 'LOGIN': return <Users size={12} />;
    case 'LOGOUT': return <Clock size={12} />;
    case 'QUERY': return <MessageSquare size={12} />;
    case 'MODIFY': return <Database size={12} />;
    case 'CLEAN': return <Sparkles size={12} />;
    case 'VISUALIZE': return <BarChart3 size={12} />;
    case 'VIEW_SUMMARY': return <FileText size={12} />;
    case 'ACCESS_DATASET': return <Eye size={12} />;
    case 'UPLOAD': return <Upload size={12} />;
    case 'VIEW': return <Eye size={12} />;
    case 'TRAIN': return <BarChart3 size={12} />;
    case 'UPDATE': return <FileText size={12} />;
    case 'SESSION': return <Clock size={12} />;
    default: return <FileText size={12} />;
  }
}

function getStatusBadge(status) {
  switch (status) {
    case 'ok': return <span className="admin-badge green">✓ OK</span>;
    case 'pending': return <span className="admin-badge amber">⏳ Pending</span>;
    case 'failed': return <span className="admin-badge red">✗ Failed</span>;
    default: return <span className="admin-badge gray">{status || 'OK'}</span>;
  }
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function formatDuration(seconds) {
  if (!seconds || seconds === 0) return '0s';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

function EmployeeLogsView({ logs }) {
  const [searchTerm, setSearchTerm] = useState('');
  
  const grouped = logs.reduce((acc, log) => {
    const key = log.user_email || 'Unknown';
    if (!acc[key]) acc[key] = { name: log.user_name || 'Unknown User', email: key, entries: [] };
    acc[key].entries.push(log);
    return acc;
  }, {});

  const filteredGroups = Object.values(grouped).filter(group => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return group.name.toLowerCase().includes(term) || group.email.toLowerCase().includes(term);
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(22,27,34,0.5)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px 16px' }}>
        <Filter size={16} style={{ color: 'var(--text-muted)', marginRight: '10px' }} />
        <input 
          type="text" 
          placeholder="Search employees by name or email..." 
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ background: 'transparent', border: 'none', color: '#fff', width: '100%', outline: 'none', fontSize: '14px', fontFamily: 'inherit' }}
        />
        {searchTerm && (
          <button onClick={() => setSearchTerm('')} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0 }}>
            <X size={16} />
          </button>
        )}
      </div>

      {filteredGroups.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px', background: 'rgba(22,27,34,0.5)', borderRadius: '12px' }}>
          No employee logs found matching "{searchTerm}".
        </div>
      ) : (
        filteredGroups.map(userGroup => (
          <div key={userGroup.email} style={{ background: 'rgba(22,27,34,0.5)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px', borderBottom: '1px solid rgba(48,54,61,0.6)', paddingBottom: '12px' }}>
              <div className="admin-u-avatar" style={{ background: '#58a6ff', width: 32, height: 32, fontSize: 14 }}>
                {userGroup.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <div style={{ fontWeight: 600, color: '#fff' }}>{userGroup.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{userGroup.email}</div>
              </div>
              <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)', background: 'rgba(255,255,255,0.05)', padding: '4px 10px', borderRadius: '20px' }}>
                {userGroup.entries.length} interaction{userGroup.entries.length !== 1 && 's'}
              </div>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {userGroup.entries.map((log, i) => (
                <div key={i} style={{ 
                  background: log.event_type === 'MODIFY' ? 'rgba(248,81,73,0.05)' : 'rgba(255,255,255,0.02)', 
                  border: `1px solid ${log.event_type === 'MODIFY' ? 'rgba(248,81,73,0.2)' : 'rgba(48,54,61,0.6)'}`, 
                  borderRadius: '8px', padding: '12px', display: 'flex', gap: '16px' 
                }}>
                  <div style={{ width: '80px', flexShrink: 0, fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--text-muted)' }}>
                    {formatDate(log.created_at).split(', ')[1]}<br/>
                    <span style={{ fontSize: 9 }}>{formatDate(log.created_at).split(', ')[0]}</span>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ marginBottom: '8px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <span className={`admin-log-method ${getMethodClass(log.event_type)}`}>
                        {getEventIcon(log.event_type)}
                        {log.event_type}
                      </span>
                      {log.event_type === 'MODIFY' && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: 10, background: 'rgba(248,81,73,0.15)', color: '#f85149', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
                          <Database size={10} /> DATA MODIFICATION
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 13, color: '#e6edf3', lineHeight: 1.5, fontFamily: log.event_type === 'MODIFY' ? "'DM Mono', monospace" : 'inherit' }}>
                      {log.detail || log.event_description}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: '8px', display: 'flex', gap: '12px' }}>
                      {log.dataset_name && <span>Dataset: {log.dataset_name}</span>}
                      <span>Status: <span style={{ color: log.status === 'ok' ? '#3fb950' : log.status === 'failed' ? '#f85149' : 'var(--text-muted)' }}>{log.status}</span></span>
                      {log.duration_seconds > 0 && <span>Duration: {formatDuration(log.duration_seconds)}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

export default function LogsPage() {
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState([]);
  const [users, setUsers] = useState([]);
  const [events, setEvents] = useState([]);
  const [datasets, setDatasets] = useState([]);
  
  const [employeeFilter, setEmployeeFilter] = useState('All');
  const [eventFilter, setEventFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [datasetFilter, setDatasetFilter] = useState('all');
  const [activeTab, setActiveTab] = useState('system');

  const role = sessionStorage.getItem('role');
  if (role !== 'admin') return <Navigate to="/datasets" />;

  const fetchData = async () => {
    setLoading(true);
    try {
      const [logsRes, statsRes] = await Promise.all([
        getActivityLogs({
          employee: employeeFilter !== 'All' ? employeeFilter : undefined,
          event: eventFilter !== 'all' ? eventFilter : undefined,
          status: statusFilter !== 'all' ? statusFilter : undefined,
          dataset: datasetFilter !== 'all' ? datasetFilter : undefined,
          includeSessions: 'true',
          limit: 1000
        }),
        getActivityStats()
      ]);
      
      if (logsRes.success) {
        setLogs(logsRes.logs || []);
      }
      
      if (statsRes.success) {
        setUsers(statsRes.users || []);
        setEvents(statsRes.events || []);
      }

      const datasetsRes = await getDatasetsAdmin();
      if (datasetsRes.success) {
        setDatasets(datasetsRes.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch logs data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [employeeFilter, eventFilter, statusFilter, datasetFilter]);

  const filteredLogs = logs;

  const hasFilters = employeeFilter !== 'All' || eventFilter !== 'all' || statusFilter !== 'all' || datasetFilter !== 'all';

  const clearFilters = () => {
    setEmployeeFilter('All');
    setEventFilter('all');
    setStatusFilter('all');
    setDatasetFilter('all');
  };

  const userOptions = ['All', ...users.map(u => u.user_name).filter(Boolean)];
  const eventOptions = ['all', ...events];
  const statusOptions = [
    { value: 'all', label: 'All Status' },
    { value: 'ok', label: 'Completed' },
    { value: 'pending', label: 'Pending' },
    { value: 'failed', label: 'Failed' }
  ];
  const datasetOptions = ['all', ...datasets.map(d => d.dataset_name).filter(Boolean)];

  const totalLogins = logs.filter(l => l.event_type === 'LOGIN').length;
  const totalCleans = logs.filter(l => l.event_type === 'CLEAN').length;
  const totalModifies = logs.filter(l => l.event_type === 'MODIFY').length;
  const totalQueries = logs.filter(l => l.event_type === 'QUERY').length;

  return (
    <AdminLayout title="Activity Logs" subtitle="Employee activity tracking with real-time logs">
      
      <div style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid rgba(48,54,61,0.6)', marginBottom: '1.5rem', paddingBottom: '0.1rem' }}>
        <button 
          onClick={() => setActiveTab('system')} 
          style={{ background: 'none', border: 'none', color: activeTab === 'system' ? '#58a6ff' : 'var(--text-muted)', fontWeight: activeTab === 'system' ? 600 : 500, cursor: 'pointer', padding: '0.6rem 1.2rem', fontSize: '0.9rem', borderBottom: activeTab === 'system' ? '2px solid #58a6ff' : '2px solid transparent', marginBottom: '-2px', transition: 'all 0.2s' }}>
          <Sparkles size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: '-2px' }} /> System Activity
        </button>
        <button 
          onClick={() => setActiveTab('employee_logs')} 
          style={{ background: 'none', border: 'none', color: activeTab === 'employee_logs' ? '#58a6ff' : 'var(--text-muted)', fontWeight: activeTab === 'employee_logs' ? 600 : 500, cursor: 'pointer', padding: '0.6rem 1.2rem', fontSize: '0.9rem', borderBottom: activeTab === 'employee_logs' ? '2px solid #58a6ff' : '2px solid transparent', marginBottom: '-2px', transition: 'all 0.2s' }}>
          <MessageSquare size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: '-2px' }} /> Employee Logs
        </button>
      </div>

      {activeTab === 'system' ? (
        <>
          <div className="admin-three-col">
            <div className="admin-stat-card accent" style={{ padding: 16 }}>
              <div className="admin-stat-value" style={{ fontSize: 22 }}>{totalLogins}</div>
              <div className="admin-stat-label">Total Logins</div>
            </div>
            <div className="admin-stat-card green" style={{ padding: 16 }}>
              <div className="admin-stat-value" style={{ fontSize: 22 }}>{totalCleans}</div>
              <div className="admin-stat-label">Cleaning Actions</div>
            </div>
            <div className="admin-stat-card danger" style={{ padding: 16 }}>
              <div className="admin-stat-value" style={{ fontSize: 22 }}>{totalModifies}</div>
              <div className="admin-stat-label">Data Modifications</div>
            </div>
            <div className="admin-stat-card" style={{ padding: 16, background: 'linear-gradient(135deg, rgba(88,166,255,0.15) 0%, rgba(31,111,235,0.1) 100%)' }}>
              <div className="admin-stat-value" style={{ fontSize: 22, color: '#58a6ff' }}>{totalQueries}</div>
              <div className="admin-stat-label">Chat Queries</div>
            </div>
          </div>

          <div className="admin-filter-bar">
            <Filter size={14} style={{ color: 'var(--text-muted)' }} />
            <select className="admin-filter-select" value={employeeFilter} onChange={e => setEmployeeFilter(e.target.value)}>
              {userOptions.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
            <select className="admin-filter-select" value={eventFilter} onChange={e => setEventFilter(e.target.value)}>
              {eventOptions.map(e => <option key={e} value={e}>{e === 'all' ? 'All Events' : e}</option>)}
            </select>
            <select className="admin-filter-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              {statusOptions.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <select className="admin-filter-select" value={datasetFilter} onChange={e => setDatasetFilter(e.target.value)}>
              {datasetOptions.map(d => <option key={d} value={d}>{d === 'all' ? 'All Datasets' : d}</option>)}
            </select>
            {hasFilters && (
              <button className="admin-btn admin-btn-ghost admin-btn-sm" onClick={clearFilters} style={{ marginLeft: 'auto' }}>
                <X size={12} /> Clear Filters
              </button>
            )}
            <button className="admin-btn admin-btn-ghost admin-btn-sm" style={{ marginLeft: hasFilters ? 8 : 'auto' }} onClick={fetchData}>
              <Loader size={12} style={loading ? { animation: 'spin 1s linear infinite' } : {}} /> Refresh
            </button>
          </div>

          <div className="admin-section-header">
            <div>
              <div className="admin-section-title">All Events</div>
              <div className="admin-section-sub">Showing {filteredLogs.length} events</div>
            </div>
          </div>
          <div className="admin-table-wrap">
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center' }}>
            <Loader size={24} style={{ animation: 'spin 1s linear infinite', color: 'var(--primary)' }} />
          </div>
        ) : filteredLogs.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
            No activity logs found. Employee activities will appear here after login.
          </div>
        ) : (
          <>
            <div className="admin-table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Date & Time</th>
                    <th>Employee</th>
                    <th>Event</th>
                    <th>Dataset</th>
                    <th>Detail</th>
                    <th>Status</th>
                    <th>Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.map((log, i) => (
                    <tr
                      key={log.log_id || i}
                      style={{ animation: `adminSlideIn 0.35s cubic-bezier(0.16,1,0.3,1) ${i * 0.04}s both` }}
                    >
                      <td style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {formatDate(log.created_at)}
                      </td>
                      <td>
                        <div className="admin-user-cell">
                          <div className="admin-u-avatar" style={{ background: '#58a6ff', width: 22, height: 22, fontSize: 9 }}>
                            {log.user_name ? log.user_name.charAt(0).toUpperCase() : 'U'}
                          </div>
                          <div>
                            <span style={{ fontSize: 12 }}>{log.user_name || 'Unknown'}</span>
                            <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>{log.user_email}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={`admin-log-method ${getMethodClass(log.event_type)}`}>
                          {getEventIcon(log.event_type)}
                          {log.event_type}
                        </span>
                      </td>
                      <td style={{ fontSize: 12 }}>{log.dataset_name || '—'}</td>
                      <td style={{
                        maxWidth: 220,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        color: 'var(--text-main)',
                        fontSize: 11,
                        fontFamily: "'DM Mono', monospace"
                      }}>
                        {log.detail || log.event_description || '—'}
                      </td>
                        <td>{getStatusBadge(log.status)}</td>
                      <td style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: log.event_type === 'SESSION' ? '#3fb950' : 'var(--text-muted)' }}>
                        {log.event_type === 'SESSION' ? formatDuration(log.duration_seconds) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredLogs.length > 0 && (
              <div className="admin-pagination">
                <div className="admin-page-info">Showing 1–{filteredLogs.length} events</div>
              </div>
            )}
          </>
        )}
          </div>
        </>
      ) : (
        <EmployeeLogsView logs={logs} />
      )}

      <style>{`
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        .admin-log-method {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 10px;
          font-weight: 600;
          font-family: "'DM Mono', monospace";
        }
        .admin-method-get {
          background: rgba(88, 166, 255, 0.15);
          color: #58a6ff;
        }
        .admin-method-post {
          background: rgba(63, 185, 80, 0.15);
          color: #3fb950;
        }
        .admin-method-blocked {
          background: rgba(248, 81, 73, 0.15);
          color: #f85149;
        }
      `}</style>
    </AdminLayout>
  );
}
