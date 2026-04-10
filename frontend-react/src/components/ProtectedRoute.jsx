import { Navigate } from "react-router-dom";

export default function ProtectedRoute({ children, allowedRoles = [] }) {
    const token = localStorage.getItem("token");
    const role = localStorage.getItem("role");

    // No token - redirect to role selection
    if (!token) {
        return <Navigate to="/" replace />;
    }

    // If allowedRoles specified, check role matches
    if (allowedRoles.length > 0 && !allowedRoles.includes(role)) {
        // Redirect based on role - datasets page only
        if (role === 'admin') {
            return <Navigate to="/admin" replace />;
        } else {
            return <Navigate to="/employee/datasets" replace />;
        }
    }

    return children;
}