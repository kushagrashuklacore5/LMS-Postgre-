
import { Routes, Route, Navigate, useLocation } from "react-router-dom";

import { useEffect, useState, lazy, Suspense } from 'react';

import { useTranslation } from './context/TranslationContext';
import { SUPPORTED_LANGUAGES } from './i18n/languageRegistry';

import { useAuth } from "./auth/auth";






import { ToastContainer } from "react-toastify";


import ControlledTermsModal from "./components/ControlledTermsModal";



/* ================= PUBLIC ================= */






/* ================= ADMIN ================= */












/* ================= ACCOUNTANT ================= */






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





/* ================= STOREKEEPER ================= */




/* ================= VENDOR ================= */

import VendorLayout from "./components/VendorLayout";








/* ================= CALENDAR ================= */




/* ================= MENTOR ================= */




















/* ================= STUDENT ================= */
















/* ================= SHARED ================= */


import ProtectedRoute from "./components/ProtectedRoute";

// Pages load on first visit (one file per page) instead of all in the first download.
const ClassroomDetails = lazy(() => import("./pages/admin/ClassroomDetails"));
const SuperAdminLogin = lazy(() => import("./pages/superadmin/SuperAdminLogin"));
const SuperAdminDashboard = lazy(() => import("./pages/superadmin/SuperAdminDashboard"));
const SuperAdminSubscription = lazy(() => import("./pages/superadmin/SuperAdminSubscription"));
const InternalAdminPortal = lazy(() => import("./pages/internal/InternalAdminPortal"));
const VendorManagement = lazy(() => import("./storekeeper/VendorManagement"));
const DatabaseExport = lazy(() => import("./pages/admin/DatabaseExport"));
const Home = lazy(() => import("./pages/Home"));
const Login = lazy(() => import("./pages/Login"));
const Register = lazy(() => import("./pages/Register"));
const AdminDashboard = lazy(() => import("./pages/admin/Admin-Dashboard"));
const CreateCourseAdmin = lazy(() => import("./pages/admin/CreateCourseAdmin"));
const AdminCourses = lazy(() => import("./pages/admin/AdminCourses"));
const MyStudents = lazy(() => import("./pages/mentor/MyStudents"));
const LiveLecture = lazy(() => import("./pages/LiveLecture"));
const StudentLectures = lazy(() => import("./pages/student/StudentLectures"));
const UserList = lazy(() => import("./pages/admin/UserList"));
const MentorApproval = lazy(() => import("./pages/admin/MentorApproval"));
const Analytics = lazy(() => import("./pages/admin/Analytics"));
const AddStudent = lazy(() => import("./pages/admin/AddStudent"));
const AddTeacher = lazy(() => import("./pages/admin/AddTeacher"));
const Classrooms = lazy(() => import("./pages/admin/Classrooms"));
const FeeStructure = lazy(() => import("./pages/admin/FeeStructure"));
const AccountantDashboard = lazy(() => import("./pages/accountant/AccountantDashboard_temp"));
const PaymentHistory = lazy(() => import("./pages/accountant/PaymentHistory_temp"));
const VendorInvoiceManagement = lazy(() => import("./pages/accountant/VendorInvoiceManagement"));
const Expenses = lazy(() => import("./pages/accountant/Expenses_temp"));
const AccountantDatabaseExport = lazy(() => import("./pages/accountant/DatabaseExport"));
const FeesCollection = lazy(() => import("./pages/accountant/FeesCollection_temp"));
const LegacyReconciliationPage = lazy(() => import("./pages/accountant/LegacyReconciliationPage"));
const StorekeeperDashboard = lazy(() => import("./storekeeper/StorekeeperDashboardSimple"));
const VendorDashboard = lazy(() => import("./vendor/VendorDashboard"));
const VendorInvoices = lazy(() => import("./vendor/VendorInvoices"));
const VendorStock = lazy(() => import("./vendor/VendorStock"));
const VendorPayments = lazy(() => import("./vendor/VendorPayments"));
const VendorOrders = lazy(() => import("./vendor/VendorOrders"));
const CalendarPage = lazy(() => import("./calendar/CalendarPage"));
const MentorDashboard = lazy(() => import("./pages/mentor/MentorDashboard"));
const CreateCourse = lazy(() => import("./pages/mentor/CreateCourse"));
const AddChapter = lazy(() => import("./pages/mentor/AddChapter"));
const AssignStudent = lazy(() => import("./pages/mentor/AssignStudents"));
const Progress = lazy(() => import("./pages/mentor/Progress"));
const CreateAssessment = lazy(() => import("./pages/mentor/CreateAssessment"));
const DesignAssessment = lazy(() => import("./pages/mentor/DesignAssessment"));
const MyClassroom = lazy(() => import("./pages/mentor/MyClassroom"));
const MentorClassrooms = lazy(() => import("./pages/mentor/MentorClassrooms"));
const ClassroomDetail = lazy(() => import("./pages/mentor/ClassroomDetail"));
const CourseTeacherPortal = lazy(() => import("./pages/mentor/CourseTeacherPortal"));
const AttendanceManagement = lazy(() => import("./pages/mentor/AttendanceManagement"));
const ClassResults = lazy(() => import("./pages/mentor/ClassResults"));
const AddResult = lazy(() => import("./pages/mentor/AddResult"));
const MentorCourseDetails = lazy(() => import("./pages/mentor/MentorCourseDetails"));
const CourseMaterialsUpload = lazy(() => import("./pages/mentor/CourseMaterialsUpload"));
const ClassFeeStatus = lazy(() => import("./pages/mentor/ClassFeeStatus"));
const StudentDashboard = lazy(() => import("./pages/student/Student-Dashboard"));
const Subscription = lazy(() => import("./pages/student/Subscription"));
const Courses = lazy(() => import("./pages/student/Courses"));
const CourseViewer = lazy(() => import("./pages/student/CourseViewer"));
const Certificates = lazy(() => import("./pages/student/Certificates"));
const AttemptAssessment = lazy(() => import("./pages/student/AttemptAssessment"));
const StudentResults = lazy(() => import("./pages/student/StudentResults"));
const StudentAttendance = lazy(() => import("./pages/student/StudentAttendance"));
const Timetable = lazy(() => import("./pages/student/Timetable"));
const PayFees = lazy(() => import("./pages/student/PayFees"));
const Requirements = lazy(() => import("./pages/mentor/Requirements"));
const Announcements = lazy(() => import("./pages/Announcements"));
const StudentSetupPassword = lazy(() => import("./pages/StudentSetupPassword"));
const StudentImport = lazy(() => import("./pages/admin/StudentImport"));
const TeacherAssessments = lazy(() => import("./pages/assessment-agent/TeacherAssessments"));
const StudentTests = lazy(() => import("./pages/assessment-agent/StudentTests"));
const StudentPerformanceReport = lazy(() => import("./pages/assessment-agent/StudentPerformanceReport"));
const StudentAttempt = lazy(() => import("./pages/assessment-agent/StudentAttempt"));
const StudentPerformance = lazy(() => import("./pages/assessment-agent/StudentPerformance"));
const TeacherAssignments = lazy(() => import("./pages/assessment-agent/TeacherAssignments"));
const StudentAssignments = lazy(() => import("./pages/assessment-agent/StudentAssignments"));
const StudentAssignment = lazy(() => import("./pages/assessment-agent/StudentAssignment"));

/* ================= AI MODULES ================= */



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

        <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-[#fffdf4]" role="status" aria-live="polite"><div className="animate-spin h-10 w-10 border-4 border-[#B99652] border-t-transparent rounded-full" aria-hidden="true"></div><span className="sr-only">Loading…</span></div>}>
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

          {/* Test button for terms modal: development builds only (never in production) */}
          {import.meta.env.DEV && <Route path="/test-terms" element={
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
          } />}



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

          {/* "Manage Course" (My Classrooms → Courses) opens the course management page; this path had
              no route, so the page rendered blank. */}
          <Route
            path="/mentor/course/:courseId/manage"
            element={
              <ProtectedRoute requiredRole="mentor">
                <CourseTeacherPortal />
              </ProtectedRoute>
            }
          />

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

          <Route path="/superadmin/dashboard" element={<ProtectedRoute requiredRole="superadmin"><SuperAdminDashboard /></ProtectedRoute>} />

          <Route path="/superadmin/subscription" element={<ProtectedRoute requiredRole="superadmin"><SuperAdminSubscription /></ProtectedRoute>} />

          {/* ===== INTERNAL ADMIN PORTAL ===== */}
          <Route path="/internal-admin-portal" element={<ProtectedRoute requiredRole="superadmin"><InternalAdminPortal /></ProtectedRoute>} />



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
        </Suspense>

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

