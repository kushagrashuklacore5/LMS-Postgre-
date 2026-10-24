import ClassroomDetails from "./pages/admin/ClassroomDetails";

import { Routes, Route, Navigate, useLocation } from "react-router-dom";

import { useEffect, useState } from 'react';

import { useTranslation } from './context/TranslationContext';
import { SUPPORTED_LANGUAGES } from './i18n/languageRegistry';

import { useAuth } from "./auth/auth";

import SuperAdminLogin from "./pages/superadmin/SuperAdminLogin";

import SuperAdminDashboard from "./pages/superadmin/SuperAdminDashboard";

import SuperAdminSubscription from "./pages/superadmin/SuperAdminSubscription";

import InternalAdminPortal from "./pages/internal/InternalAdminPortal";

import VendorManagement from "./storekeeper/VendorManagement";

import { ToastContainer } from "react-toastify";

import DatabaseExport from "./pages/admin/DatabaseExport";

import ControlledTermsModal from "./components/ControlledTermsModal";



/* ================= PUBLIC ================= */

import Home from "./pages/Home";

import Login from "./pages/Login";

import Register from "./pages/Register";



/* ================= ADMIN ================= */

import AdminDashboard from "./pages/admin/Admin-Dashboard";

import CreateCourseAdmin from "./pages/admin/CreateCourseAdmin";
import AdminCourses from "./pages/admin/AdminCourses";
import MyStudents from "./pages/mentor/MyStudents";
import LiveLecture from "./pages/LiveLecture";
import StudentLectures from "./pages/student/StudentLectures";

import UserList from "./pages/admin/UserList";

import MentorApproval from "./pages/admin/MentorApproval";

import Analytics from "./pages/admin/Analytics";

import AddStudent from "./pages/admin/AddStudent";

import AddTeacher from "./pages/admin/AddTeacher";

import Classrooms from "./pages/admin/Classrooms";

import FeeStructure from "./pages/admin/FeeStructure";



/* ================= ACCOUNTANT ================= */

import AccountantDashboard from "./pages/accountant/AccountantDashboard_temp";

import PaymentHistory from "./pages/accountant/PaymentHistory_temp";

import VendorInvoiceManagement from "./pages/accountant/VendorInvoiceManagement";

import Expenses from "./pages/accountant/Expenses_temp";

import AccountantDatabaseExport from "./pages/accountant/DatabaseExport";

// Simple test component
const TestDatabaseExport = () => {
  return (
    <div style={{ padding: '50px', backgroundColor: 'red', color: 'white', fontSize: '24px' }}>
      <h1>🗄️ TEST DATABASE EXPORT PAGE</h1>
      <p>If you see this, the routing works!</p>
      <button onClick={() => alert('Button works!')} style={{ padding: '10px', margin: '10px', backgroundColor: 'white', color: 'red' }}>
        Click Me!
      </button>
    </div>
  );
};

import FeesCollection from "./pages/accountant/FeesCollection_temp";

import LegacyReconciliationPage from "./pages/accountant/LegacyReconciliationPage";



/* ================= STOREKEEPER ================= */

import StorekeeperDashboard from "./storekeeper/StorekeeperDashboardSimple";



/* ================= VENDOR ================= */

import VendorLayout from "./components/VendorLayout";

import VendorDashboard from "./vendor/VendorDashboard";

import VendorInvoices from "./vendor/VendorInvoices";

import VendorStock from "./vendor/VendorStock";

import VendorPayments from "./vendor/VendorPayments";

import VendorOrders from "./vendor/VendorOrders";



/* ================= CALENDAR ================= */

import CalendarPage from "./calendar/CalendarPage";



/* ================= MENTOR ================= */

import MentorDashboard from "./pages/mentor/MentorDashboard";

import CreateCourse from "./pages/mentor/CreateCourse";

import AddChapter from "./pages/mentor/AddChapter";

import AssignStudent from "./pages/mentor/AssignStudents";

import Progress from "./pages/mentor/Progress";

import CreateAssessment from "./pages/mentor/CreateAssessment";

import DesignAssessment from "./pages/mentor/DesignAssessment";

import MyClassroom from "./pages/mentor/MyClassroom";

import MentorClassrooms from "./pages/mentor/MentorClassrooms";

import ClassroomDetail from "./pages/mentor/ClassroomDetail";

import CourseTeacherPortal from "./pages/mentor/CourseTeacherPortal";

import AttendanceManagement from "./pages/mentor/AttendanceManagement";

import ClassResults from "./pages/mentor/ClassResults";

import AddResult from "./pages/mentor/AddResult";

import MentorCourseDetails from "./pages/mentor/MentorCourseDetails";

import CourseMaterialsUpload from "./pages/mentor/CourseMaterialsUpload";

import ClassFeeStatus from "./pages/mentor/ClassFeeStatus";



/* ================= STUDENT ================= */

import StudentDashboard from "./pages/student/Student-Dashboard";

import Subscription from "./pages/student/Subscription";

import Courses from "./pages/student/Courses";

import CourseViewer from "./pages/student/CourseViewer";

import Certificates from "./pages/student/Certificates";

import AttemptAssessment from "./pages/student/AttemptAssessment";

import StudentResults from "./pages/student/StudentResults";

import StudentAttendance from "./pages/student/StudentAttendance";



import Timetable from "./pages/student/Timetable";

import PayFees from "./pages/student/PayFees";

import Requirements from "./pages/mentor/Requirements";



/* ================= SHARED ================= */

import Announcements from "./pages/Announcements";

import ProtectedRoute from "./components/ProtectedRoute";

/* ================= AI MODULES ================= */
import StudentSetupPassword from "./pages/StudentSetupPassword";
import StudentImport from "./pages/admin/StudentImport";
import TeacherAssessments from "./pages/assessment-agent/TeacherAssessments";
import StudentTests from "./pages/assessment-agent/StudentTests";
import StudentPerformanceReport from "./pages/assessment-agent/StudentPerformanceReport";
import StudentAttempt from "./pages/assessment-agent/StudentAttempt";
import StudentPerformance from "./pages/assessment-agent/StudentPerformance";
import TeacherAssignments from "./pages/assessment-agent/TeacherAssignments";
import StudentAssignments from "./pages/assessment-agent/StudentAssignments";
import StudentAssignment from "./pages/assessment-agent/StudentAssignment";



// Root redirect component

const RootRedirect = () => {

  const { user } = useAuth();

  

  if (!user) {
    return <Home />;
  }

  

  // Redirect based on user role

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

  

  const path = dashboardMap[user.role];

  if (path) {

    return <Navigate to={path} replace />;

  }

  

  return <Home />;
};



function App() {

  const location = useLocation();

  const { currentLanguage } = useTranslation();

  const { user, token } = useAuth();

  const [showTermsModal, setShowTermsModal] = useState(false);

  // Check if user is authenticated
  const isAuthenticated = !!(token && user);

  console.log('🏠 App render:', { location: location.pathname, isAuthenticated, user });

  // Check if current route is a public/auth page that should allow scrolling

  const isAuthPage = ['/login', '/register', '/home', '/'].includes(location.pathname);

  // Check if user needs to accept terms (after login but before accessing any protected route)
  
  useEffect(() => {
    
    console.log('🔍 Terms Check:', { isAuthenticated, isAuthPage, userId: user?.id, location: location.pathname });
    
    // Show terms modal immediately after login when user is authenticated and not on auth pages
    if (isAuthenticated === true && user?.id && !isAuthPage) {
      
      const hasAcceptedTerms = localStorage.getItem(`terms_accepted_${user?.id}`);
      
      console.log('📋 Terms Status:', { hasAcceptedTerms, showTermsModal });
      
      if (!hasAcceptedTerms && !showTermsModal) {
        
        console.log('⚠️ Showing terms modal');
        setShowTermsModal(true);
        
      }
      
    }
    
  }, [token, user?.id, isAuthPage, location.pathname]);

  // Translation state management is handled by TranslationContext

  // No need for DOM translation here - components use t() function

  useEffect(() => {
    try {
      const langMeta = SUPPORTED_LANGUAGES[currentLanguage];
      const shortLang = langMeta?.legacyCode || currentLanguage?.split('-')[0] || 'en';
      const direction = langMeta?.dir || 'ltr';
      document.documentElement.lang = shortLang;
      document.documentElement.dir = direction;
    } catch (e) {
      console.warn('Language document setup failed:', e);
    }
  }, [currentLanguage]);

  const handleTermsAccept = () => {

    localStorage.setItem(`terms_accepted_${user?.id}`, 'true');

    setShowTermsModal(false);

  };

  // Test function to manually trigger modal
  const testShowModal = () => {
    console.log('🧪 Test: Manually showing modal');
    setShowTermsModal(true);
  };

  // Clear terms acceptance for testing
  const clearTermsAcceptance = () => {
    if (user?.id) {
      localStorage.removeItem(`terms_accepted_${user?.id}`);
      console.log('🗑️ Cleared terms acceptance for user:', user?.id);
      setShowTermsModal(false); // Reset to false first
      setTimeout(() => setShowTermsModal(true), 100); // Then show modal
    }
  };

  return (
    <>
      <div className={isAuthPage ? "min-h-screen" : "h-screen w-screen overflow-hidden"}>
        <ToastContainer 
          position="top-right" 
          autoClose={5000}
          hideProgressBar={false}
          newestOnTop={false}
          closeOnClick
          rtl={false}
          pauseOnFocusLoss
          draggable
          pauseOnHover
          theme="light"
        />

        <Routes>

          {/* ===== PUBLIC ===== */}

          <Route path="/" element={<RootRedirect />} />

          <Route path="/home" element={<Home />} />
          <Route path="/admin/courses" element={<ProtectedRoute requiredRole="admin"><AdminCourses /></ProtectedRoute>} />
          <Route path="/mentor/students" element={<ProtectedRoute requiredRole="mentor"><MyStudents /></ProtectedRoute>} />
          <Route path="/live/:lectureId" element={<ProtectedRoute><LiveLecture /></ProtectedRoute>} />
          <Route path="/student/lectures" element={<ProtectedRoute requiredRole="student"><StudentLectures /></ProtectedRoute>} />

          <Route path="/login" element={<Home />} />

          <Route path="/register" element={<Register />} />

          {/* ===== AI MODULE ROUTES ===== */}
          <Route path="/setup-password" element={<StudentSetupPassword />} />
          <Route path="/admin/student-import" element={<ProtectedRoute requiredRole="admin"><StudentImport /></ProtectedRoute>} />
          <Route path="/teacher/assessments" element={<ProtectedRoute requiredRole="mentor"><TeacherAssessments /></ProtectedRoute>} />
          <Route path="/teacher/assessments/assignments" element={<ProtectedRoute requiredRole="mentor"><TeacherAssignments /></ProtectedRoute>} />
          <Route path="/teacher/assessments/students/:studentId" element={<ProtectedRoute requiredRole="mentor"><StudentPerformance /></ProtectedRoute>} />
          <Route path="/student/assessment-agent/assignments" element={<ProtectedRoute requiredRole="student"><StudentAssignments /></ProtectedRoute>} />
          <Route path="/student/assessment-agent/assignments/:id" element={<ProtectedRoute requiredRole="student"><StudentAssignment /></ProtectedRoute>} />
          <Route path="/student/assessment-agent/tests" element={<ProtectedRoute requiredRole="student"><StudentTests /></ProtectedRoute>} />
          <Route path="/student/assessment-agent/reports/:reportId" element={<ProtectedRoute requiredRole="student"><StudentPerformanceReport /></ProtectedRoute>} />
          <Route path="/student/assessment-agent/attempts/:attemptId" element={<ProtectedRoute requiredRole="student"><StudentAttempt /></ProtectedRoute>} />

          {/* Test button for terms modal */}
          <Route path="/test-terms" element={
            <div style={{padding: '50px', textAlign: 'center'}}>
              <h1>Terms Modal Test</h1>
              <button 
                onClick={testShowModal}
                style={{padding: '10px 20px', backgroundColor: 'blue', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', margin: '10px'}}
              >
                Test Terms Modal
              </button>
              <button 
                onClick={clearTermsAcceptance}
                style={{padding: '10px 20px', backgroundColor: 'red', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', margin: '10px'}}
              >
                Clear Terms & Show
              </button>
            </div>
          } />



          {/* ===== ADMIN ===== */}

          <Route

            path="/admin/dashboard"

            element={

              <ProtectedRoute requiredRole="admin">

                <AdminDashboard />

              </ProtectedRoute>

            }

          />



          <Route

            path="/admin/create-course"

            element={

              <ProtectedRoute requiredRole="admin">

                <CreateCourseAdmin />

              </ProtectedRoute>

            }

          />

          <Route

            path="/mentor/add-result"

            element={

              <ProtectedRoute requiredRole="mentor">

                <AddResult />

              </ProtectedRoute>

            }

          />



          <Route

            path="/admin/users"

            element={

              <ProtectedRoute requiredRole="admin">

                <UserList />

              </ProtectedRoute>

            }

          />



          <Route

            path="/admin/mentors"

            element={

              <ProtectedRoute requiredRole="admin">

                <MentorApproval />

              </ProtectedRoute>

            }

          />



          <Route

            path="/admin/analytics"

            element={

              <ProtectedRoute requiredRole="admin">

                <Analytics />

              </ProtectedRoute>

            }

          />



          <Route

            path="/admin/fee-structure"

            element={

              <ProtectedRoute requiredRole="admin">

                <FeeStructure />

              </ProtectedRoute>

            }

          />



          <Route

            path="/admin/add-student"

            element={

              <ProtectedRoute requiredRole="admin">

                <AddStudent />

              </ProtectedRoute>

            }

          />



          <Route

            path="/admin/add-teacher"

            element={

              <ProtectedRoute requiredRole="admin">

                <AddTeacher />

              </ProtectedRoute>

            }

          />



          {/* ===== CLASSROOMS ===== */}

          <Route

            path="/admin/classrooms"

            element={

              <ProtectedRoute requiredRole="admin">

                <Classrooms />

              </ProtectedRoute>

            }

          />



          <Route

            path="/admin/classrooms/:classroomId"

            element={

              <ProtectedRoute requiredRole="admin">

                <ClassroomDetails />

              </ProtectedRoute>

            }

          />



          <Route

            path="/admin/calendar"

            element={

              <ProtectedRoute requiredRole="admin">

                <CalendarPage role="admin" />

              </ProtectedRoute>

            }

          />



          {/* ✅ MENTOR ROUTES */}

          <Route

            path="/mentor/dashboard"

            element={

              <ProtectedRoute requiredRole="mentor">

                <MentorDashboard />

              </ProtectedRoute>

            }

          />

          <Route

            path="/mentor/classrooms"

            element={

              <ProtectedRoute requiredRole="mentor">

                <MentorClassrooms />

              </ProtectedRoute>

            }

          />

          <Route

            path="/mentor/classroom/:classroomId"

            element={

              <ProtectedRoute requiredRole="mentor">

                <ClassroomDetail />

              </ProtectedRoute>

            }

          />

          <Route

            path="/mentor/results"

            element={

              <ProtectedRoute requiredRole="mentor">

                <ClassResults />

              </ProtectedRoute>

            }

          />

          <Route

            path="/mentor/requirements"

            element={

              <ProtectedRoute requiredRole="mentor">

                <Requirements />

              </ProtectedRoute>

            }

          />



          {/* ✅ MY CLASSROOM */}

          <Route

            path="/mentor/classroom"

            element={

              <ProtectedRoute requiredRole="mentor">

                <MyClassroom />

              </ProtectedRoute>

            }

          />



          {/* ✅ ATTENDANCE */}

          <Route

            path="/mentor/attendance"

            element={

              <ProtectedRoute requiredRole="mentor">

                <AttendanceManagement />

              </ProtectedRoute>

            }

          />



          {/* ✅ COURSE TEACHER PORTAL */}

          <Route

            path="/mentor/course/:courseId"

            element={

              <ProtectedRoute requiredRole="mentor">

                <CourseTeacherPortal />

              </ProtectedRoute>

            }

          />



          <Route

            path="/mentor/create-course"

            element={

              <ProtectedRoute requiredRole="mentor">

                <CreateCourse />

              </ProtectedRoute>

            }

          />



          <Route

            path="/mentor/add-chapter"

            element={

              <ProtectedRoute requiredRole="mentor">

                <AddChapter />

              </ProtectedRoute>

            }

          />



          <Route

            path="/mentor/assign-students"

            element={

              <ProtectedRoute requiredRole="mentor">

                <AssignStudent />

              </ProtectedRoute>

            }

          />



          <Route

            path="/mentor/progress"

            element={

              <ProtectedRoute requiredRole="mentor">

                <Progress />

              </ProtectedRoute>

            }

          />

          <Route

            path="/mentor/fee-monitoring"

            element={

              <ProtectedRoute requiredRole="mentor">

                <ClassFeeStatus />

              </ProtectedRoute>

            }

          />



          <Route

            path="/mentor/create-assessment"

            element={

              <ProtectedRoute requiredRole="mentor">

                <CreateAssessment />

              </ProtectedRoute>

            }

          />

          <Route

            path="/mentor/course/:courseId"

            element={

              <ProtectedRoute requiredRole="mentor">

                <MentorCourseDetails />

              </ProtectedRoute>

            }

          />



          {/* ✅ COURSE MATERIALS UPLOAD */}

          <Route

            path="/mentor/course/:courseId/materials"

            element={

              <ProtectedRoute requiredRole="mentor">

                <CourseMaterialsUpload />

              </ProtectedRoute>

            }

          />



          <Route

            path="/mentor/assessment/:assessmentId"

            element={

              <ProtectedRoute requiredRole="mentor">

                <DesignAssessment />

              </ProtectedRoute>

            }

          />



          <Route

            path="/mentor/calendar"

            element={

              <ProtectedRoute requiredRole="mentor">

                <CalendarPage role="mentor" />

              </ProtectedRoute>

            }

          />



          {/* ===== STUDENT ===== */}

          <Route

            path="/student/dashboard"

            element={

              <ProtectedRoute requiredRole="student">

                <StudentDashboard />

              </ProtectedRoute>

            }

          />

          <Route

            path="/student/subscription"

            element={

              <ProtectedRoute requiredRole="student">

                <Subscription />

              </ProtectedRoute>

            }

          />



          {/* ===== ACCOUNTANT ===== */}

          <Route

            path="/accountant/dashboard"

            element={

              <ProtectedRoute requiredRole="accountant">

                <AccountantDashboard />

              </ProtectedRoute>

            }

          />



          <Route

            path="/accountant/vendor-invoices"

            element={

              <ProtectedRoute requiredRole="accountant">

                <VendorInvoiceManagement />

              </ProtectedRoute>

            }

          />

          <Route

            path="/accountant/payment-history"

            element={

              <ProtectedRoute requiredRole="accountant">

                <PaymentHistory />

              </ProtectedRoute>

            }

          />



          <Route

            path="/accountant/fee-monitoring"

            element={

              <ProtectedRoute requiredRole="accountant">

                <ClassFeeStatus />

              </ProtectedRoute>

            }

          />



          <Route

            path="/accountant/fees"

            element={

              <ProtectedRoute requiredRole="accountant">

                <FeesCollection />

              </ProtectedRoute>

            }

          />



          <Route

            path="/accountant/legacy-reconciliation"

            element={

              <ProtectedRoute requiredRole="accountant">

                <LegacyReconciliationPage />

              </ProtectedRoute>

            }

          />



          <Route

            path="/accountant/expenses"

            element={

              <ProtectedRoute requiredRole="accountant">

                <Expenses />

              </ProtectedRoute>

            }

          />



          <Route

            path="/accountant/database-export"

            element={

              <ProtectedRoute requiredRole="accountant">

                <AccountantDatabaseExport />

              </ProtectedRoute>

            }

          />

          <Route

            path="/accountant/reports"

            element={

              <ProtectedRoute requiredRole="accountant">

                <AccountantDatabaseExport />

              </ProtectedRoute>

            }

          />



          {/* ===== STOREKEEPER ===== */}

          <Route
            path="/storekeeper/*"
            element={
              <ProtectedRoute requiredRole="storekeeper">
                <StorekeeperDashboard />
              </ProtectedRoute>
            }
          />



          {/* ===== VENDOR ===== */}

          <Route

            path="/vendor/dashboard"

            element={

              <ProtectedRoute requiredRole="vendor">

                <VendorLayout>

                  <VendorDashboard />

                </VendorLayout>

              </ProtectedRoute>

            }

          />



          <Route

            path="/vendor/invoices"

            element={

              <ProtectedRoute requiredRole="vendor">

                <VendorLayout>

                  <VendorInvoices />

                </VendorLayout>

              </ProtectedRoute>

            }

          />



          <Route

            path="/vendor/orders"

            element={

              <ProtectedRoute requiredRole="vendor">

                <VendorLayout>

                  <VendorOrders />

                </VendorLayout>

              </ProtectedRoute>

            }

          />



          <Route

            path="/vendor/stock"

            element={

              <ProtectedRoute requiredRole="vendor">

                <VendorLayout>

                  <VendorStock />

                </VendorLayout>

              </ProtectedRoute>

            }

          />



          <Route

            path="/vendor/payments"

            element={

              <ProtectedRoute requiredRole="vendor">

                <VendorLayout>

                  <VendorPayments />

                </VendorLayout>

              </ProtectedRoute>

            }

          />



          {/* ✅ TIMETABLE */}

          <Route

            path="/student/timetable"

            element={

              <ProtectedRoute requiredRole="student">

                <Timetable />

              </ProtectedRoute>

            }

          />



          <Route

            path="/student/pay-fees"

            element={

              <ProtectedRoute requiredRole="student">

                <PayFees />

              </ProtectedRoute>

            }

          />



          <Route

            path="/student/results"

            element={

              <ProtectedRoute requiredRole="student">

                <StudentResults />

              </ProtectedRoute>

            }

          />



          <Route

            path="/student/attendance"

            element={

              <ProtectedRoute requiredRole="student">

                <StudentAttendance />

              </ProtectedRoute>

            }

          />



          <Route path="/superadmin/login" element={<SuperAdminLogin />} />

          <Route path="/superadmin/dashboard" element={<SuperAdminDashboard />} />

          <Route path="/superadmin/subscription" element={<SuperAdminSubscription />} />

          {/* ===== INTERNAL ADMIN PORTAL ===== */}
          <Route path="/internal-admin-portal" element={<InternalAdminPortal />} />



          <Route

            path="/student/courses"

            element={

              <ProtectedRoute requiredRole="student">

                <Courses />

              </ProtectedRoute>

            }

          />



          <Route

            path="/student/course/:courseId"

            element={

              <ProtectedRoute requiredRole="student">

                <CourseViewer />

              </ProtectedRoute>

            }

          />



          {/* ✅ ATTEMPT ASSESSMENT */}

          <Route

            path="/student/assessment/:assessmentId"

            element={

              <ProtectedRoute requiredRole="student">

                <AttemptAssessment />

              </ProtectedRoute>

            }

          />



          <Route

            path="/student/certificates"

            element={

              <ProtectedRoute requiredRole="student">

                <Certificates />

              </ProtectedRoute>

            }

          />



          <Route

            path="/student/calendar"

            element={

              <ProtectedRoute requiredRole="student">

                <CalendarPage role="student" />

              </ProtectedRoute>

            }

          />



          {/* ===== ANNOUNCEMENTS ===== */}

          <Route

            path="/announcements"

            element={

              <ProtectedRoute>

                <Announcements />

              </ProtectedRoute>

            }

          />



          <Route

            path="/admin/announcements"

            element={

              <ProtectedRoute requiredRole="admin">

                <Announcements />

              </ProtectedRoute>

            }

          />



          <Route

            path="/admin/database-export"

            element={

              <ProtectedRoute requiredRole="admin">

                <DatabaseExport />

              </ProtectedRoute>

            }

          />



          <Route

            path="/accountant/*"

            element={

              <ProtectedRoute requiredRole="accountant">

                <AccountantDashboard />

              </ProtectedRoute>

            }

          />



          <Route

            path="/storekeeper/*"

            element={

              <ProtectedRoute requiredRole="storekeeper">

                <StorekeeperDashboard />

              </ProtectedRoute>

            }

          />

        </Routes>

      </div>

      {/* Terms and Conditions Modal */}
      <ControlledTermsModal 
        isOpen={showTermsModal} 
        onAccept={handleTermsAccept}
      />
    </>
  );

}



export default App;

