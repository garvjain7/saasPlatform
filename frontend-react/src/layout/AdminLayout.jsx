import { useState } from 'react';
import {
  LayoutDashboard, FileText, Shield, Users, Database,
  Settings, LogOut, Search, Bell, Activity,
  Menu, X
} from 'lucide-react';
import { useNavigate, useLocation, Link } from 'react-router-dom';

const navItems = [
  {
    label: 'Main', items: [
      { path: '/admin', icon: LayoutDashboard, text: 'Dashboard' },
      { path: '/admin/permissions', icon: Shield, text: 'Permissions', badge: 3 },
      { path: '/admin/logs', icon: FileText, text: 'Logs' },
    ]
  },
  {
    label: 'Manage', items: [
      { path: '/admin', icon: Users, text: 'Employees' },
      { path: '/datasets', icon: Database, text: 'Datasets' },
      { path: '/admin/permissions', icon: Shield, text: 'Permissions' },
    ]
  },
  {
    label: 'Company', items: [
      { path: '/admin', icon: Settings, text: 'Settings' },
    ]
  },
];

export default function AdminLayout({ children, title, subtitle }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const email = localStorage.getItem('email') || 'admin@datainsights.ai';
  const initials = email.slice(0, 2).toUpperCase();

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    localStorage.removeItem('email');
    navigate('/');
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-color)' }}>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="admin-sidebar-overlay"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`admin-sidebar ${mobileOpen ? 'mobile-open' : ''}`}>
        <div className="admin-sidebar-logo">
          <Link to="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Activity color="var(--primary)" size={20} />
            <div>
              <div className="admin-logo-text">Data<span className="gradient-text">Insights</span></div>
              <div className="admin-logo-sub">Admin Panel</div>
            </div>
          </Link>
        </div>

        <div className="admin-company-card">
          <div className="admin-company-avatar">AC</div>
          <div>
            <div className="admin-company-name">Acme Corp</div>
            <div className="admin-company-role">Administrator</div>
          </div>
        </div>

        <nav className="admin-nav">
          {navItems.map((section, si) => (
            <div key={si}>
              <div className="admin-nav-label">{section.label}</div>
              {section.items.map((item, ii) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;
                return (
                  <a
                    key={ii}
                    onClick={() => { navigate(item.path); setMobileOpen(false); }}
                    className={`admin-nav-item ${isActive ? 'active' : ''}`}
                  >
                    <Icon size={16} className="admin-nav-icon" />
                    <span>{item.text}</span>
                    {item.badge && <span className="admin-nav-badge">{item.badge}</span>}
                  </a>
                );
              })}
              {si < navItems.length - 1 && <div className="admin-nav-divider" />}
            </div>
          ))}
        </nav>

        <div className="admin-sidebar-bottom">
          <div className="admin-user-card">
            <div className="admin-user-avatar">{initials}</div>
            <div>
              <div className="admin-user-name">{email.split('@')[0]}</div>
              <div className="admin-user-email">{email}</div>
            </div>
            <LogOut size={14} className="admin-logout-btn" onClick={handleLogout} />
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="admin-main">
        <header className="admin-topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button className="admin-mobile-menu" onClick={() => setMobileOpen(!mobileOpen)}>
              {mobileOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
            <div>
              <div className="admin-topbar-title">{title || 'Dashboard'}</div>
              {subtitle && <div className="admin-topbar-sub">{subtitle}</div>}
            </div>
          </div>
          <div className="admin-topbar-actions">
            <div className="admin-search-bar">
              <Search size={14} />
              <input type="text" placeholder="Search employees, datasets..." />
            </div>
            <button className="admin-icon-btn">
              <Bell size={16} />
              <span className="admin-notif-dot" />
            </button>
          </div>
        </header>
        <div className="admin-content">
          {children}
        </div>
      </main>
    </div>
  );
}
