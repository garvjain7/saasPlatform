import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Auth from "./pages/Auth";
import EmployeeLogin from "./pages/EmployeeLogin";
import Signup from "./pages/Signup";
import MainLayout from './layout/MainLayout';
import AdminLayout from './layout/AdminLayout';
import DashboardPage from './pages/DashboardPage';
import DatasetsPage from './pages/DatasetsPage';
import ChatPage from './pages/ChatPage';
import UploadPage from './pages/UploadPage';
import DataChatPage from './pages/DataChatPage';
import ProtectedRoute from './components/ProtectedRoute';

// Admin pages
import AdminDashboard from './pages/admin/AdminDashboard';
import LogsPage from './pages/admin/LogsPage';
import PermissionPage from './pages/admin/PermissionPage';

// Employee section pages
import EmployeeDatasetsPage from './pages/employee/EmployeeDatasetsPage';
import EmployeeCleaningPage from './pages/employee/EmployeeCleaningPage';
import EmployeeDashboardPage from './pages/employee/EmployeeDashboardPage';
import EmployeeChatPage from './pages/employee/EmployeeChatPage';
import EmployeeSummaryPage from './pages/employee/EmployeeSummaryPage';
import DatasetAnalysisPage from './pages/employee/DatasetAnalysisPage';
import ColumnCleaningPage from './pages/employee/ColumnCleaningPage';
import VisualizationPage from './pages/employee/VisualizationPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Auth - Unified Login */}
        <Route path="/" element={<Auth />} />
        <Route path="/employee-login" element={<EmployeeLogin />} />
        <Route path="/signup/:role" element={<Signup />} />

        {/* Protected Admin Pipeline */}
        <Route path="/admin" element={<ProtectedRoute allowedRoles={['admin']}><AdminLayout><AdminDashboard /></AdminLayout></ProtectedRoute>} />
        <Route path="/admin/logs" element={<ProtectedRoute allowedRoles={['admin']}><AdminLayout><LogsPage /></AdminLayout></ProtectedRoute>} />
        <Route path="/admin/permissions" element={<ProtectedRoute allowedRoles={['admin']}><AdminLayout><PermissionPage /></AdminLayout></ProtectedRoute>} />

        {/* Data Pipeline (wrapped in MainLayout) */}
        <Route path="/upload" element={<ProtectedRoute><MainLayout><UploadPage /></MainLayout></ProtectedRoute>} />
        <Route path="/datasets" element={<ProtectedRoute><MainLayout><DatasetsPage /></MainLayout></ProtectedRoute>} />
        <Route path="/dashboard/:datasetId" element={<ProtectedRoute><MainLayout><DashboardPage /></MainLayout></ProtectedRoute>} />
        <Route path="/chat/:datasetId" element={<ProtectedRoute><MainLayout><ChatPage /></MainLayout></ProtectedRoute>} />
        <Route path="/datachat" element={<ProtectedRoute><MainLayout><DataChatPage /></MainLayout></ProtectedRoute>} />
        <Route path="/visualization/:datasetId" element={<ProtectedRoute><MainLayout><VisualizationPage /></MainLayout></ProtectedRoute>} />

        {/* Employee Section (pages have their own layouts) */}
        <Route path="/employee" element={<Navigate to="/employee/datasets" replace />} />
        <Route path="/employee/upload" element={<ProtectedRoute><UploadPage /></ProtectedRoute>} />
        <Route path="/employee/datasets" element={<ProtectedRoute><EmployeeDatasetsPage /></ProtectedRoute>} />
        <Route path="/employee/analysis" element={<ProtectedRoute><DatasetAnalysisPage /></ProtectedRoute>} />
        <Route path="/employee/column-cleaning" element={<ProtectedRoute><ColumnCleaningPage /></ProtectedRoute>} />
        <Route path="/employee/cleaning" element={<ProtectedRoute><EmployeeCleaningPage /></ProtectedRoute>} />
        <Route path="/employee/dashboard" element={<ProtectedRoute><EmployeeDashboardPage /></ProtectedRoute>} />
        <Route path="/employee/chat" element={<ProtectedRoute><EmployeeChatPage /></ProtectedRoute>} />
        <Route path="/employee/summary" element={<ProtectedRoute><EmployeeSummaryPage /></ProtectedRoute>} />
        <Route path="/employee/visualization" element={<ProtectedRoute><VisualizationPage /></ProtectedRoute>} />
      </Routes>
    </BrowserRouter>
  );
}
