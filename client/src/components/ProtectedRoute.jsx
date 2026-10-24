import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/auth';

const ProtectedRoute = ({ children, requiredRole }) => {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to="/login" />;
  }

  // Allow superadmin to access superadmin and admin routes
  if (user.role === "superadmin" && (requiredRole === "superadmin" || requiredRole === "admin")) {
    return children;
  }

  // Allow teachers to access mentor routes
  if (requiredRole === "mentor" && (user.role === "mentor" || user.role === "teacher")) {
    return children;
  }

  // Check if user has the required role
  if (requiredRole && user.role !== requiredRole) {
    // Redirect to appropriate dashboard based on actual user role
    const dashboardMap = {
      'superadmin': '/superadmin/dashboard',
      'admin': '/admin/dashboard',
      'mentor': '/mentor/dashboard',
      'teacher': '/mentor/dashboard',
      'student': '/student/dashboard',
      'accountant': '/accountant/dashboard',
      'storekeeper': '/storekeeper/dashboard',
      'vendor': '/vendor/dashboard'
    };
    
    const redirectPath = dashboardMap[user.role] || '/login';
    console.warn(`🚫 User role '${user.role}' not authorized for route requiring '${requiredRole}'. Redirecting to ${redirectPath}`);
    return <Navigate to={redirectPath} />;
  }

  return children;
};

export default ProtectedRoute;

