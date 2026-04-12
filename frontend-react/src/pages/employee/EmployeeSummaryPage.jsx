import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { MessageSquare, LayoutDashboard, Sparkles, Download, ChevronRight, FileText, Database } from 'lucide-react';
import EmployeeLayout from '../../layout/EmployeeLayout';
import { getDatasets, getDashboardConfig } from '../../services/api';

const API_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

const TOC_SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'schema', label: 'Schema / Columns' },
  { id: 'numeric', label: 'Numeric Stats' },
  { id: 'categorical', label: 'Categorical Profiles' },
  { id: 'actions', label: 'Actions' },
];

// Sample cleaning steps - will be replaced with real data from API
const CLEAN_STEPS = [
  { num: '1', name: 'Load & Parse', detail: 'CSV → Structured', result: '✓ Done', skipped: false },
  { num: '2', name: 'Type Detection', detail: 'Auto-detect column types', result: '✓ Done', skipped: false },
  { num: '3', name: 'Null Handling', detail: 'Fill missing values', result: '✓ Done', skipped: false },
  { num: '4', name: 'Duplicate Removal', detail: 'Check for dupes', result: '✓ Done', skipped: false },
  { num: '5', name: 'Outlier Detection', detail: 'Statistical analysis', result: '✓ Done', skipped: false },
];

// Sample null data - will be replaced with real data from API
const NULL_DATA = [
  { col: 'email', pct: 0, label: 'No nulls' },
  { col: 'phone', pct: 5, label: '5% nulls' },
  { col: 'address', pct: 12, label: '12% nulls' },
];

const typeColors = {
  num: { bg: 'rgba(63,185,80,0.1)', color: 'var(--success)' },
  cat: { bg: 'rgba(188,140,255,0.1)', color: 'var(--accent)' },
  date: { bg: 'rgba(210,153,34,0.1)', color: 'var(--warning)' },
};

const EmployeeSummaryPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const datasetId = searchParams.get('ds');
  const datasetName = searchParams.get('name') || datasetId;
  
  const [activeSection, setActiveSection] = useState('overview');
  const [availableDatasets, setAvailableDatasets] = useState([]);
  const [selectedDataset, setSelectedDataset] = useState(null);
  const [datasetData, setDatasetData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Load available datasets
  useEffect(() => {
    const loadDatasets = async () => {
      try {
        const res = await getDatasets();
        if (res.success && res.data) {
          const readyDatasets = res.data.filter(d => d.status === 'completed' || d.status === 'ready');
          setAvailableDatasets(readyDatasets);
          
          if (!datasetId && readyDatasets.length > 0) {
            setSelectedDataset(readyDatasets[0]);
          } else if (datasetId) {
            const selected = readyDatasets.find(d => (d.dataset_id || d.id) === datasetId);
            if (selected) setSelectedDataset(selected);
          }
        }
      } catch (err) {
        console.warn('Could not load datasets:', err.message);
      }
    };
    loadDatasets();
  }, [datasetId]);

  // Load dataset details
  useEffect(() => {
    const loadDatasetData = async () => {
      if (!selectedDataset) return;
      setLoading(true);
      
      const dsId = selectedDataset.dataset_id || selectedDataset.id;
      const token = sessionStorage.getItem('token');
      
      try {
        // Load cleaned data for schema and stats
        const response = await fetch(`${API_URL}/cleaned-data/${dsId}?limit=1`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const data = await response.json();
        
        if (data.success) {
          setDatasetData({
            name: selectedDataset.name,
            rows: data.totalRows,
            columns: data.headers?.length || 0,
            headers: data.headers,
            columnTypes: data.columnTypes,
            columnStats: data.columnStats,
          });
        }
      } catch (err) {
        console.warn('Could not load dataset data:', err.message);
      }
      
      setLoading(false);
    };
    
    loadDatasetData();
  }, [selectedDataset]);

  useEffect(() => {
    const handleScroll = () => {
      for (const { id } of TOC_SECTIONS) {
        const el = document.getElementById(id);
        if (el) {
          const rect = el.getBoundingClientRect();
          if (rect.top < 120) setActiveSection(id);
        }
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollTo = (id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    setActiveSection(id);
  };

  // Build schema from actual data
  const schema = datasetData?.headers?.map(col => ({
    name: col,
    type: datasetData.columnTypes?.[col] || 'string',
    nullable: datasetData.columnStats?.[col]?.uniqueCount ? 'No' : 'Yes',
    unique: datasetData.columnStats?.[col]?.uniqueCount?.toLocaleString() || '—',
    typeClass: datasetData.columnTypes?.[col] === 'numeric' ? 'num' : 'cat'
  })) || [];

  // Numeric stats from actual data
  const numericStats = datasetData?.headers?.filter(h => datasetData.columnTypes?.[h] === 'numeric').map(col => {
    const stats = datasetData.columnStats?.[col];
    return {
      name: col,
      stats: stats ? {
        min: stats.min?.toFixed(2) || '—',
        max: stats.max?.toFixed(2) || '—',
        mean: stats.mean?.toFixed(2) || '—',
        count: stats.count?.toLocaleString() || '0',
      } : { min: '—', max: '—', mean: '—', count: '0' }
    };
  }) || [];

  // Categorical data from actual data
  const categoricalData = datasetData?.headers?.filter(h => datasetData.columnTypes?.[h] === 'categorical').map(col => {
    const stats = datasetData.columnStats?.[col];
    const values = stats?.values?.slice(0, 5).map(v => ({
      label: v,
      pct: Math.round((stats.count / (stats.uniqueCount || 1)) * 100),
    })) || [];
    return { name: col, values, color: 'var(--accent)' };
  }) || [];

  const currentDataset = selectedDataset || { name: datasetName, rows_count: datasetData?.rows, columns_count: datasetData?.columns };

  return (
    <EmployeeLayout>
      <div className="emp-topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="emp-btn emp-btn-ghost emp-btn-sm" onClick={() => navigate('/employee/datasets')}>
            ← Back
          </button>
          {availableDatasets.length > 1 && (
            <select className="emp-filter-select" value={selectedDataset?.dataset_id || selectedDataset?.id || ''}
              onChange={(e) => {
                const ds = availableDatasets.find(d => (d.dataset_id || d.id) === e.target.value);
                if (ds) {
                  setSelectedDataset(ds);
                  navigate(`/employee/summary?ds=${ds.dataset_id || ds.id}&name=${encodeURIComponent(ds.name || '')}`);
                }
              }} style={{ minWidth: 180, fontSize: 11 }}>
              {availableDatasets.map(ds => <option key={ds.dataset_id || ds.id} value={ds.dataset_id || ds.id}>{ds.name}</option>)}
            </select>
          )}
          <div>
            <div className="emp-topbar-title">Dataset Summary</div>
            <div className="emp-topbar-sub">{currentDataset.name} · {datasetData?.rows?.toLocaleString() || '—'} rows · {datasetData?.columns || '—'} columns</div>
          </div>
        </div>
        <div className="emp-topbar-actions">
          <button className="emp-btn emp-btn-ghost emp-btn-sm"><Download size={12} /> Export</button>
          <button className="emp-btn emp-btn-primary emp-btn-sm" onClick={() => navigate(`/employee/chat?ds=${selectedDataset?.dataset_id || selectedDataset?.id}`)}>
            <MessageSquare size={12} /> Ask Chatbot
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1 }}>
        {/* TOC Sidebar */}
        <div style={{
          width: 220, flexShrink: 0, padding: '24px 16px',
          borderRight: '1px solid var(--border-color)',
          position: 'sticky', top: 58, height: 'calc(100vh - 58px)', overflowY: 'auto',
        }}>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'var(--text-muted)', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 10 }}>Contents</div>
          {TOC_SECTIONS.map(s => (
            <div
              key={s.id}
              onClick={() => scrollTo(s.id)}
              style={{
                fontFamily: "'DM Mono', monospace", fontSize: 10, color: activeSection === s.id ? 'var(--primary)' : 'var(--text-muted)',
                padding: '5px 8px', borderRadius: 6, cursor: 'pointer', marginBottom: 2,
                display: 'flex', alignItems: 'center', gap: 7, transition: 'all 0.15s',
                background: activeSection === s.id ? 'rgba(88,166,255,0.08)' : 'transparent',
              }}
              onMouseEnter={e => { if (activeSection !== s.id) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
              onMouseLeave={e => { if (activeSection !== s.id) e.currentTarget.style.background = 'transparent'; }}
            >
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor', flexShrink: 0 }} />
              {s.label}
            </div>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, padding: '28px 32px', maxWidth: 900 }}>
          {/* Hero */}
          <div className="glass-panel" id="overview" style={{
            padding: '24px 28px', marginBottom: 28, position: 'relative', overflow: 'hidden',
            scrollMarginTop: 80,
          }}>
            <div style={{
              position: 'absolute', top: -40, right: -40, width: 200, height: 200,
              background: 'radial-gradient(circle, rgba(88,166,255,0.08), transparent 70%)', borderRadius: '50%',
            }} />
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 16 }}>
              <div style={{
                width: 48, height: 48, borderRadius: 12, background: 'rgba(88,166,255,0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0,
              }}>📊</div>
              <div>
                <div style={{ fontSize: 22, fontWeight: 600, color: '#fff', lineHeight: 1.2 }}>{currentDataset.name}</div>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>Processed · Cleaned · Ready for analysis</div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, padding: '4px 10px', borderRadius: 20, background: 'rgba(63,185,80,0.08)', color: 'var(--success)' }}>● Ready</span>
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, padding: '4px 10px', borderRadius: 20, background: 'rgba(88,166,255,0.08)', color: 'var(--primary)' }}>Chatbot Unlocked</span>
              </div>
            </div>
            {datasetData ? (
              <div style={{
                fontSize: 13.5, color: 'var(--text-main)', lineHeight: 1.75,
                padding: '14px 16px', background: 'rgba(13,17,23,0.95)', borderRadius: 10,
                borderLeft: '3px solid var(--primary)', fontStyle: 'italic',
              }}>
                This dataset contains <strong style={{ color: '#fff', fontStyle: 'normal' }}>{datasetData.rows?.toLocaleString() || '—'} records</strong> with <strong style={{ color: '#fff', fontStyle: 'normal' }}>{datasetData.columns} attributes</strong>. 
                The data includes {datasetData.columnTypes ? Object.values(datasetData.columnTypes).filter(t => t === 'numeric').length : 0} numeric columns and {datasetData.columnTypes ? Object.values(datasetData.columnTypes).filter(t => t === 'categorical').length : 0} categorical columns.
              </div>
            ) : (
              <div style={{
                fontSize: 13.5, color: 'var(--text-main)', lineHeight: 1.75,
                padding: '14px 16px', background: 'rgba(13,17,23,0.95)', borderRadius: 10,
                borderLeft: '3px solid var(--primary)', fontStyle: 'italic',
              }}>
                Loading dataset summary...
              </div>
            )}
            <div style={{ display: 'flex', gap: 24, marginTop: 16, flexWrap: 'wrap' }}>
              {[
                { val: datasetData?.rows?.toLocaleString() || '—', lbl: 'Total Rows' }, 
                { val: datasetData?.columns || '—', lbl: 'Columns' }, 
                { val: schema.length, lbl: 'Attributes' },
                { val: selectedDataset?.status === 'completed' ? 'Completed' : 'Ready', lbl: 'Status', color: 'var(--success)' },
              ].map((m, i) => (
                <div key={i} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 20, fontWeight: 600, color: m.color || '#fff' }}>{m.val}</div>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'var(--text-muted)', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 }}>{m.lbl}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Cleaning Summary */}
          <div id="cleaning" style={{ marginBottom: 32, scrollMarginTop: 80 }}>
            <div style={sectionTitleStyle}><Sparkles size={18} /> Cleaning Summary</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
              {[
                { val: '14', lbl: 'Nulls Filled', color: 'var(--success)' }, { val: '7', lbl: 'Dupes Removed', color: 'var(--warning)' },
                { val: '2', lbl: 'Types Fixed', color: 'var(--primary)' }, { val: '23', lbl: 'Cells Modified', color: 'var(--accent)' },
              ].map((s, i) => (
                <div key={i} className="glass-panel" style={{ padding: 14, textAlign: 'center' }}>
                  <div style={{ fontSize: 20, fontWeight: 600, color: s.color }}>{s.val}</div>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'var(--text-muted)', marginTop: 3, textTransform: 'uppercase' }}>{s.lbl}</div>
                </div>
              ))}
            </div>
            <div className="glass-panel" style={{ overflow: 'hidden' }}>
              {CLEAN_STEPS.map((step, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px',
                  borderBottom: i < CLEAN_STEPS.length - 1 ? '1px solid rgba(255,255,255,0.025)' : 'none',
                }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: '50%',
                    background: step.skipped ? 'rgba(255,255,255,0.04)' : 'rgba(63,185,80,0.08)',
                    color: step.skipped ? 'var(--text-muted)' : 'var(--success)',
                    fontFamily: "'DM Mono', monospace", fontSize: 10, fontWeight: 600,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>{step.num}</div>
                  <div style={{ flex: 1, fontSize: 13, fontWeight: 500, color: step.skipped ? 'var(--text-muted)' : '#fff' }}>{step.name}</div>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: step.skipped ? 'var(--text-muted)' : 'var(--text-muted)' }}>{step.detail}</div>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: step.skipped ? 'var(--text-muted)' : 'var(--success)' }}>{step.result}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Schema */}
          <div id="schema" style={{ marginBottom: 32, scrollMarginTop: 80 }}>
            <div style={sectionTitleStyle}>⊞ Schema · {schema.length} Columns</div>
            <div className="glass-panel" style={{ overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    {['#', 'Column Name', 'Type', 'Nullable', 'Unique Values'].map(col => (
                      <th key={col} style={{
                        background: 'rgba(13,17,23,0.95)', padding: '9px 12px', textAlign: 'left',
                        fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'var(--text-muted)',
                        letterSpacing: 1, textTransform: 'uppercase', borderBottom: '1px solid var(--border-color)',
                      }}>{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {schema.slice(0, 15).map((col, i) => (
                    <tr key={i} onMouseEnter={e => e.currentTarget.style.background = 'rgba(22,27,34,0.7)'} onMouseLeave={e => e.currentTarget.style.background = ''}
                      style={{ transition: 'background 0.15s' }}>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.025)', color: 'var(--text-muted)', fontFamily: "'DM Mono', monospace", fontSize: 10 }}>{i + 1}</td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.025)' }}>
                        <code style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--primary)' }}>{col.name}</code>
                      </td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.025)' }}>
                        <span style={{
                          fontFamily: "'DM Mono', monospace", fontSize: 9, padding: '2px 8px', borderRadius: 5,
                          background: typeColors[col.typeClass]?.bg, color: typeColors[col.typeClass]?.color,
                        }}>{datasetData?.columnTypes?.[col.name] || col.type}</span>
                      </td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.025)', color: col.nullable === 'Yes' ? 'var(--warning)' : 'var(--success)', fontSize: 11 }}>{col.nullable}</td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.025)', fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'var(--text-main)' }}>{col.unique}</td>
                    </tr>
                  ))}
                  {schema.length > 15 && (
                    <tr>
                      <td colSpan={5} style={{ padding: '10px 12px', fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'var(--text-muted)', textAlign: 'center' }}>
                        + {schema.length - 15} more columns
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Null Analysis */}
          <div id="nulls" style={{ marginBottom: 32, scrollMarginTop: 80 }}>
            <div style={sectionTitleStyle}>○ Null Analysis (Post-Cleaning)</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {NULL_DATA.map((item, i) => (
                <div key={i} className="glass-panel" style={{ padding: '10px 12px' }}>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'var(--text-main)', marginBottom: 6 }}>{item.col}</div>
                  <div style={{ height: 5, background: 'rgba(255,255,255,0.06)', borderRadius: 5, overflow: 'hidden', marginBottom: 4 }}>
                    <div style={{ height: '100%', width: `${item.pct}%`, background: item.color, borderRadius: 5 }} />
                  </div>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: item.pct === 0 ? 'var(--success)' : 'var(--text-muted)' }}>{item.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Numeric Stats */}
          <div id="numeric" style={{ marginBottom: 32, scrollMarginTop: 80 }}>
            <div style={sectionTitleStyle}>∑ Numeric Column Statistics</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {(numericStats.length > 0 ? numericStats : [{ name: 'No numeric columns', stats: { min: '—', max: '—', mean: '—', count: '0' } }]).map((col, i) => (
                <div key={i} className="glass-panel" style={{ padding: '14px 16px' }}>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--primary)', marginBottom: 8, fontWeight: 600 }}>{col.name}</div>
                  {Object.entries(col.stats).map(([k, v]) => (
                    <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.025)' }}>
                      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'var(--text-muted)' }}>{k}</span>
                      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: '#fff', fontWeight: 500 }}>{v}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* Categorical Profiles */}
          <div id="categorical" style={{ marginBottom: 32, scrollMarginTop: 80 }}>
            <div style={sectionTitleStyle}>◈ Categorical Profiles</div>
            {(categoricalData.length > 0 ? categoricalData : [{ name: 'No categorical columns', values: [] }]).map((cat, ci) => (
              <div key={ci} className="glass-panel" style={{ padding: '14px 16px', marginBottom: 10 }}>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--accent)', marginBottom: 10 }}>
                  {cat.name} ({cat.values.length} unique values)
                </div>
                {cat.values.map((v, vi) => (
                  <div key={vi} style={{ marginBottom: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'var(--text-muted)', marginBottom: 3 }}>
                      <span>{v.label}</span><span>{v.pct}% · {v.rows} rows</span>
                    </div>
                    <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', width: `${v.pct}%`, borderRadius: 4,
                        background: v.color ? `linear-gradient(90deg, ${v.color}, ${v.color})` : 'linear-gradient(90deg, var(--accent), #c4b5fd)',
                      }} />
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Actions */}
          <div id="actions" style={{ marginBottom: 32, scrollMarginTop: 80 }}>
            <div style={sectionTitleStyle}>→ Next Steps</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { icon: '◎', title: 'Ask the Chatbot', sub: 'Query this dataset in natural language · Chatbot has full context', action: () => navigate('/employee/chat'), label: 'Open Chatbot →', primary: true },
                { icon: '▦', title: 'View Dashboard', sub: 'See auto-generated charts and AI insights for this dataset', action: () => navigate('/employee/dashboard'), label: 'Open Dashboard →' },
                { icon: '✦', title: 'Re-clean Dataset', sub: 'Go back to cleaning wizard with v3 selections preserved', action: () => navigate('/employee/cleaning'), label: 'Open Cleaning →' },
              ].map((item, i) => (
                <div key={i} className="glass-panel" style={{ padding: '18px 22px', display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ fontSize: 24 }}>{item.icon}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', marginBottom: 2 }}>{item.title}</div>
                    <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'var(--text-muted)' }}>{item.sub}</div>
                  </div>
                  <button className={`emp-btn ${item.primary ? 'emp-btn-primary' : 'emp-btn-ghost'}`} onClick={item.action}>{item.label}</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </EmployeeLayout>
  );
};

const sectionTitleStyle = {
  fontSize: 17, fontWeight: 600, color: '#fff',
  marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10,
  paddingBottom: 10, borderBottom: '1px solid var(--border-color)',
};

export default EmployeeSummaryPage;
