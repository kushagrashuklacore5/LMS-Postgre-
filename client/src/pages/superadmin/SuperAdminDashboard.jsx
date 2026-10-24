import { useState, useEffect } from "react";

import { useNavigate, useSearchParams } from "react-router-dom";

import { toast } from "react-toastify";

import { useAuth } from "../../auth/auth";

import jsPDF from "jspdf";

import { 
  Building2, 
  Users, 
  GraduationCap, 
  TrendingUp, 
  MapPin, 
  Calendar,
  DollarSign,
  Award,
  BookOpen,
  Target,
  Activity,
  Plus,
  Search,
  Filter,
  MoreVertical,
  Eye,
  Edit,
  Trash2,
  Mail,
  Phone,
  Clock,
  Star,
  ChevronRight,
  BarChart3,
  PieChart,
  UserPlus,
  Building,
  Settings,
  Bell,
  LogOut,
  X,
  Check,
  Lock,
  Shield,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle
} from "lucide-react";

import CreateUniversityForm from "./CreateUniversityForm";
import CreateUserForm from "./CreateUserForm";
import SuperAdminLayout from "../../components/SuperAdminLayout";

const SuperAdminDashboard = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { API, token } = useAuth();
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'overview');
  const [universities, setUniversities] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [generatedCredentials, setGeneratedCredentials] = useState(null);
  const [selectedUni, setSelectedUni] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [viewingUser, setViewingUser] = useState(null);
  const [editingUser, setEditingUser] = useState(null);
  const [userSearchTerm, setUserSearchTerm] = useState("");
  const [savingUser, setSavingUser] = useState(false);

  // Statistics for overview
  const [stats, setStats] = useState({
    totalUniversities: 0,
    totalStudents: 0,
    totalFaculty: 0,
    totalRevenue: 0,
    growthRate: 0,
    activeUsers: 0
  });

  useEffect(() => {
    // Check if user is superadmin
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    if (user.role !== "superadmin") {
      navigate("/superadmin/login");
      return;
    }

    // Set active tab from URL parameters
    const tabParam = searchParams.get('tab');
    setActiveTab(tabParam || 'overview');

    loadUniversities();
    loadUsers();
    loadStats();
  }, [searchParams]);



  const handleTabChange = (tab) => {

    setActiveTab(tab);

    navigate(`/superadmin/dashboard?tab=${tab}`);

  };



  const loadUniversities = async () => {

    try {

      setLoading(true);

      console.log('=== Loading Universities ===');
      console.log('Token available:', !!token);
      console.log('Token length:', token?.length || 0);
      console.log('API URL:', API);
      console.log('User from auth:', user);

      const res = await fetch(`${API}/superadmin/universities`, {

        headers: {

          Authorization: `Bearer ${token}`,

        },

      });

      const data = await res.json();

      if (res.ok) {

        const universitiesData = Array.isArray(data.data) ? data.data : (data.data?.universities || []);
        
        setUniversities(universitiesData);

        setStats(prev => ({ ...prev, totalUniversities: universitiesData.length || 0 }));

      }

    } catch (err) {

      console.error("Error loading universities:", err);

    } finally {

      setLoading(false);

    }

  };



  const loadUsers = async () => {

    try {

      setLoading(true);

      console.log('=== Loading Users ===');
      console.log('Token available:', !!token);
      console.log('Token length:', token?.length || 0);
      console.log('API URL:', API);
      console.log('User from auth:', user);

      const res = await fetch(`${API}/superadmin/users`, {

        headers: {

          Authorization: `Bearer ${token}`,

        },

      });

      const data = await res.json();

      if (res.ok) {

        setUsers(data.data || []);

        // Update stats with actual user data

        setStats(prev => ({

          ...prev,

          totalStudents: data.data?.filter(u => u.role === 'student').length || 0,

          totalFaculty: data.data?.filter(u => u.role === 'faculty').length || 0,

          activeUsers: data.data?.filter(u => u.isApproved).length || 0

        }));

      }

    } catch (err) {

      console.error("Error loading users:", err);

    } finally {

      setLoading(false);

    }

  };



  const loadStats = async () => {

    // Calculate actual stats from real data

    setStats(prev => ({
      ...prev,
      totalUniversities: universities.length,
      totalStudents: users.filter(u => u.role === 'student').length,
      totalFaculty: users.filter(u => u.role === 'faculty').length,
      totalRevenue: Math.floor(Math.random() * 1000000) + 100000,
      growthRate: Math.floor(Math.random() * 30) + 10,
      activeUsers: users.filter(u => u.isApproved).length
    }));
  };




  const handleDeleteUniversity = async (universityId) => {
    if (!confirm('Are you sure you want to delete this university? This action cannot be undone and will also delete all users associated with this university.')) {
      return;
    }
    
    try {
      const res = await fetch(`${API}/superadmin/universities/${universityId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (res.ok) {
        // Remove university from local state
        setUniversities(prev => prev.filter(uni => uni.id !== universityId));
        setStats(prev => ({
          ...prev,
          totalUniversities: prev.totalUniversities - 1
        }));
        setSelectedUni(null);
        toast.success('🗑️ University deleted successfully!');
      } else {
        // Handle error response properly
        const errorText = await res.text();
        let errorMessage = 'Failed to delete university';
        
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.message || errorMessage;
        } catch (parseError) {
          // If response is not JSON, use the text directly
          errorMessage = errorText;
        }
        
        toast.error(errorMessage);
      }
    } catch (err) {
      console.error('Delete university error:', err);
      toast.error('Failed to delete university');
    }
  };

  const handleDeleteUser = async (userId, userName) => {
    if (!window.confirm(`Are you sure you want to delete staff member "${userName || 'this user'}"? This action cannot be undone.`)) {
      return;
    }
    
    try {
      const authToken = token || localStorage.getItem("token");
      const res = await fetch(`${API}/superadmin/users/${userId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      });
      
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setUsers(prev => prev.filter(u => u.id !== userId));
        setStats(prev => ({
          ...prev,
          activeUsers: Math.max(0, prev.activeUsers - 1)
        }));
        if (viewingUser?.id === userId) setViewingUser(null);
        if (editingUser?.id === userId) setEditingUser(null);
        toast.success("🗑️ Staff member deleted successfully!");
      } else {
        toast.error(data.message || "Failed to delete staff member");
      }
    } catch (err) {
      console.error("Delete user error:", err);
      toast.error("Failed to delete staff member");
    }
  };

  const handleUpdateUser = async (e) => {
    e.preventDefault();
    if (!editingUser) return;

    try {
      setSavingUser(true);
      const authToken = token || localStorage.getItem("token");
      const bodyPayload = {
        name: editingUser.name,
        email: editingUser.email,
        role: editingUser.role,
        isApproved: editingUser.isApproved ? 1 : 0,
        universityId: editingUser.university_id ? Number(editingUser.university_id) : null
      };

      if (editingUser.password && editingUser.password.trim()) {
        bodyPayload.password = editingUser.password.trim();
      }

      const res = await fetch(`${API}/superadmin/users/${editingUser.id}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(bodyPayload)
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        let uniName = editingUser.university;
        if (bodyPayload.universityId) {
          const matchedUni = universities.find(u => String(u.id) === String(bodyPayload.universityId));
          if (matchedUni) uniName = matchedUni.name;
        } else {
          uniName = "System Admin";
        }

        setUsers(prev => prev.map(u => {
          if (u.id === editingUser.id) {
            return {
              ...u,
              name: editingUser.name,
              email: editingUser.email,
              role: editingUser.role,
              isApproved: editingUser.isApproved ? 1 : 0,
              university_id: bodyPayload.universityId,
              university: uniName
            };
          }
          return u;
        }));

        toast.success("✅ Staff member updated successfully!");
        setEditingUser(null);
      } else {
        toast.error(data.message || "Failed to update user");
      }
    } catch (err) {
      console.error("Update user error:", err);
      toast.error("Failed to update user");
    } finally {
      setSavingUser(false);
    }
  };


  const handleUniversityCreated = () => {

    loadUniversities();

    loadStats();

    handleTabChange("universities");

    toast.success("🎓 Institute successfully added to your empire!");

  };



  const handleUserCreated = (credentials) => {

    setGeneratedCredentials(credentials);

    loadUsers();

    loadStats();

    toast.success("👤 New team member created successfully!");

  };



  const downloadCredentialsPDF = () => {

    if (!generatedCredentials) return;



    const doc = new jsPDF();

    doc.setFontSize(16);

    doc.text("🔐 Institute Portal Credentials", 20, 20);



    doc.setFontSize(11);

    let yPosition = 40;



    doc.text("Name:", 20, yPosition);

    doc.text(generatedCredentials.name, 60, yPosition);

    yPosition += 10;



    doc.text("Email:", 20, yPosition);

    doc.text(generatedCredentials.email, 60, yPosition);

    yPosition += 10;



    doc.text("Password:", 20, yPosition);

    doc.text(generatedCredentials.password, 60, yPosition);

    yPosition += 10;



    doc.text("Role:", 20, yPosition);

    doc.text(generatedCredentials.role, 60, yPosition);

    yPosition += 15;



    doc.setFontSize(9);

    doc.text("Generated on: " + new Date().toLocaleString(), 20, yPosition);



    doc.save(`${generatedCredentials.email}_credentials.pdf`);

    toast.success("📄 Credentials downloaded!");

  };



  const handleLogout = () => {

    localStorage.removeItem("token");

    localStorage.removeItem("user");

    toast.success("👋 Logged out successfully!");

    navigate("/superadmin/login");

  };



  const filteredUniversities = (universities || []).filter(uni => 

    uni.name.toLowerCase().includes(searchTerm.toLowerCase()) ||

    (uni.area && uni.area.toLowerCase().includes(searchTerm.toLowerCase()))

  );



  const user = JSON.parse(localStorage.getItem("user") || "{}");



  return (

    <SuperAdminLayout>

      {/* Always-rendered regardless of active tab — lets GuideBot know
          up front whether at least one institute exists, since the
          Institutes tab's own card markup only renders once that tab is
          actually active. */}
      <div data-tour-universities-count={universities.length} className="max-w-7xl mx-auto">

        {/* Header Section */}

        <div className="mb-8">

          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-6">

            <div>

              <h1 className="text-3xl font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b] mb-1">
                Institute Dashboard
              </h1>
              <p className="text-xs uppercase tracking-wider text-slate-500 font-semibold">
                Manage and expand your educational network across multiple cities
              </p>

            </div>

          </div>

        </div>



        {/* Success Message */}

        {generatedCredentials && (

          <div data-tour="credentials-banner" className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl p-6 mb-6 shadow-lg">

            <div className="flex justify-between items-start flex-wrap">

              <div>

                <h3 className="font-bold text-green-800 mb-3 flex items-center gap-2">

                  <Award className="text-green-600" size={20} />

                  Team Member Created Successfully!

                </h3>

                <div className="space-y-2 text-sm">

                  <p><span className="font-semibold text-gray-700">Name:</span> <span className="text-gray-900">{generatedCredentials.name}</span></p>

                  <p><span className="font-semibold text-gray-700">Email:</span> <span className="text-gray-900">{generatedCredentials.email}</span></p>

                  <p><span className="font-semibold text-gray-700">Password:</span> <code className="bg-gray-100 px-2 py-1 rounded font-mono text-green-700">{generatedCredentials.password}</code></p>

                  <p><span className="font-semibold text-gray-700">Role:</span> <span className="uppercase text-blue-600 font-semibold">{generatedCredentials.role}</span></p>

                </div>

              </div>

              <button

                onClick={downloadCredentialsPDF}

                data-tour="btn-download-credentials-pdf"

                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-semibold whitespace-nowrap transition-colors shadow-md"

              >

                📄 Download PDF

              </button>

            </div>

          </div>

        )}



        {/* Tab Content */}

        {activeTab === "overview" && (
          <div>
            <div className="flex justify-between items-center mb-6 pb-3 border-b border-[#ebdcaa]/60">
              <h2 className="text-2xl sm:text-3xl font-['DM_Serif_Display',serif] text-[#1e1b4b] tracking-tight">Overview & Global Analytics</h2>
            </div>

            {/* Stats Grid */}
            <div data-tour="overview-stats" className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              <div className="bg-white border border-[#ebdcaa] border-l-4 border-l-[#B99652] rounded-none p-5 shadow-xs hover:shadow-sm transition-all">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 bg-[#fffdf4] border border-[#ebdcaa]/80 flex items-center justify-center text-[#B99652] rounded-none">
                    <Building2 size={20} />
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#B99652] bg-[#fffdf4] px-2 py-0.5 border border-[#ebdcaa]">Total</span>
                </div>
                <div className="text-2xl sm:text-3xl font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b]">{stats.totalUniversities}</div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mt-1">Institutes & Universities</div>
              </div>

              <div className="bg-white border border-[#ebdcaa] border-l-4 border-l-[#B99652] rounded-none p-5 shadow-xs hover:shadow-sm transition-all">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 bg-[#fffdf4] border border-[#ebdcaa]/80 flex items-center justify-center text-[#B99652] rounded-none">
                    <GraduationCap size={20} />
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 border border-emerald-200">Active</span>
                </div>
                <div className="text-2xl sm:text-3xl font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b]">{stats.totalStudents.toLocaleString()}</div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mt-1">Total Enrolled Students</div>
              </div>

              <div className="bg-white border border-[#ebdcaa] border-l-4 border-l-[#B99652] rounded-none p-5 shadow-xs hover:shadow-sm transition-all">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 bg-[#fffdf4] border border-[#ebdcaa]/80 flex items-center justify-center text-[#B99652] rounded-none">
                    <Activity size={20} />
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 bg-blue-50 px-2 py-0.5 border border-blue-200">Live</span>
                </div>
                <div className="text-2xl sm:text-3xl font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b]">{stats.activeUsers}</div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mt-1">Active Online Users</div>
              </div>
            </div>



            {/* Recent Activity & Quick Actions */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div data-tour="recent-activity" className="bg-white/95 backdrop-blur-xs rounded-none border border-[#ebdcaa] p-6 shadow-[0_4px_25px_rgba(185,150,82,0.06)]">
                <h3 className="text-lg font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b] mb-4 flex items-center gap-2.5 pb-3 border-b border-[#ebdcaa]/60">
                  <div className="w-8 h-8 rounded-none bg-[#fffdf4] border border-[#ebdcaa] text-[#B99652] flex items-center justify-center">
                    <Clock size={16} />
                  </div>
                  <span>Recent Activity</span>
                </h3>

                <div className="space-y-3">
                  {universities.slice(0, 3).map((uni) => (
                    <div key={uni.id} className="flex items-center gap-3.5 p-3.5 bg-[#fffdf4]/60 border border-[#ebdcaa] rounded-none hover:border-[#B99652] transition-colors">
                      <div className="w-2.5 h-2.5 bg-[#B99652] rounded-none shrink-0 shadow-2xs"></div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm text-[#1e1b4b] font-['DM_Serif_Display',serif] truncate">{uni.name}</p>
                        <p className="text-xs text-[#7a705a] mt-0.5">New institute registered under empire</p>
                      </div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#92400e] bg-[#fff8e7] border border-[#fde68a] px-2 py-0.5 rounded-none">
                        Active
                      </span>
                    </div>
                  ))}
                  {universities.length === 0 && (
                    <div className="text-center py-6 text-xs text-[#7a705a] italic">
                      No recent activities recorded yet.
                    </div>
                  )}
                </div>
              </div>

              <div data-tour="quick-actions" className="bg-white/95 backdrop-blur-xs rounded-none border border-[#ebdcaa] p-6 shadow-[0_4px_25px_rgba(185,150,82,0.06)]">
                <h3 className="text-lg font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b] mb-4 flex items-center gap-2.5 pb-3 border-b border-[#ebdcaa]/60">
                  <div className="w-8 h-8 rounded-none bg-[#fffdf4] border border-[#ebdcaa] text-[#B99652] flex items-center justify-center">
                    <Target size={16} />
                  </div>
                  <span>Quick Actions</span>
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <button 
                    onClick={() => handleTabChange("createUniversity")}
                    className="p-3.5 bg-white hover:bg-[#fffdf4] border border-[#ebdcaa] hover:border-[#B99652] rounded-none text-left transition-all duration-200 group flex items-center gap-3 shadow-2xs hover:shadow-xs"
                  >
                    <div className="w-10 h-10 rounded-none bg-gradient-to-br from-[#1e1b4b] to-[#2d296a] text-[#ebdcaa] flex items-center justify-center shrink-0 border border-[#3b357a] shadow-2xs group-hover:scale-105 transition-transform">
                      <Building2 size={18} />
                    </div>
                    <div>
                      <span className="block text-xs font-bold text-[#1e1b4b] group-hover:text-[#B99652] transition-colors uppercase tracking-wider">Add Institute</span>
                      <span className="block text-[11px] text-[#7a705a] mt-0.5">Register new institution</span>
                    </div>
                  </button>

                  <button 
                    onClick={() => handleTabChange("createUser")}
                    className="p-3.5 bg-white hover:bg-[#fffdf4] border border-[#ebdcaa] hover:border-[#B99652] rounded-none text-left transition-all duration-200 group flex items-center gap-3 shadow-2xs hover:shadow-xs"
                  >
                    <div className="w-10 h-10 rounded-none bg-gradient-to-br from-[#1e1b4b] to-[#2d296a] text-[#ebdcaa] flex items-center justify-center shrink-0 border border-[#3b357a] shadow-2xs group-hover:scale-105 transition-transform">
                      <UserPlus size={18} />
                    </div>
                    <div>
                      <span className="block text-xs font-bold text-[#1e1b4b] group-hover:text-[#B99652] transition-colors uppercase tracking-wider">Add Staff</span>
                      <span className="block text-[11px] text-[#7a705a] mt-0.5">Hire admin or mentor</span>
                    </div>
                  </button>

                  <button 
                    onClick={() => handleTabChange("universities")}
                    className="p-3.5 bg-white hover:bg-[#fffdf4] border border-[#ebdcaa] hover:border-[#B99652] rounded-none text-left transition-all duration-200 group flex items-center gap-3 shadow-2xs hover:shadow-xs"
                  >
                    <div className="w-10 h-10 rounded-none bg-gradient-to-br from-[#1e1b4b] to-[#2d296a] text-[#ebdcaa] flex items-center justify-center shrink-0 border border-[#3b357a] shadow-2xs group-hover:scale-105 transition-transform">
                      <Building2 size={18} />
                    </div>
                    <div>
                      <span className="block text-xs font-bold text-[#1e1b4b] group-hover:text-[#B99652] transition-colors uppercase tracking-wider">View Institutes</span>
                      <span className="block text-[11px] text-[#7a705a] mt-0.5">Explore empire directory</span>
                    </div>
                  </button>

                  <button 
                    onClick={() => handleTabChange("users")}
                    className="p-3.5 bg-white hover:bg-[#fffdf4] border border-[#ebdcaa] hover:border-[#B99652] rounded-none text-left transition-all duration-200 group flex items-center gap-3 shadow-2xs hover:shadow-xs"
                  >
                    <div className="w-10 h-10 rounded-none bg-gradient-to-br from-[#1e1b4b] to-[#2d296a] text-[#ebdcaa] flex items-center justify-center shrink-0 border border-[#3b357a] shadow-2xs group-hover:scale-105 transition-transform">
                      <Users size={18} />
                    </div>
                    <div>
                      <span className="block text-xs font-bold text-[#1e1b4b] group-hover:text-[#B99652] transition-colors uppercase tracking-wider">View Staff</span>
                      <span className="block text-[11px] text-[#7a705a] mt-0.5">Manage all user accounts</span>
                    </div>
                  </button>
                </div>
              </div>
            </div>

          </div>

        )}



        {activeTab === "universities" && (
          <div>
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-6 pb-3 border-b border-[#ebdcaa]/60">
              <div>
                <h2 className="text-2xl sm:text-3xl font-['DM_Serif_Display',serif] text-[#1e1b4b] tracking-tight">Your Institute Empire</h2>
                <p className="text-xs uppercase tracking-wider text-slate-500 font-semibold mt-1">
                  Manage and expand your educational network across multiple cities ({universities.length} Total)
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3 mt-4 lg:mt-0 w-full sm:w-auto">
                <div className="relative w-full sm:w-80 md:w-96">
                  <Search className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-[#B99652]" size={16} />
                  <input
                    type="text"
                    placeholder="Search institutes..."
                    data-tour="search-universities"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-white border border-[#ebdcaa] rounded-none focus:outline-none focus:border-[#B99652] focus:ring-1 focus:ring-[#B99652] text-sm text-[#1e1b4b] placeholder-slate-400 shadow-xs"
                  />
                  {searchTerm && (
                    <button
                      onClick={() => setSearchTerm("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
                <button 
                  onClick={() => handleTabChange("createUniversity")}
                  className="flex items-center gap-2 px-4 py-2.5 bg-[#B99652] hover:bg-[#a38241] text-white rounded-none font-semibold text-xs uppercase tracking-wider transition-colors shadow-xs"
                >
                  <Plus size={16} />
                  Add Institute
                </button>
              </div>
            </div>
            
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-none h-8 w-8 border-2 border-[#B99652] border-t-transparent"></div>
              </div>
            ) : filteredUniversities.length === 0 ? (
              <div className="text-center py-12 bg-white border border-[#ebdcaa] p-8">
                <Building2 className="text-[#ebdcaa] mx-auto mb-4" size={48} />
                <p className="text-sm font-semibold text-[#1e1b4b] mb-4">No institutes found in your empire.</p>
                <button 
                  onClick={() => handleTabChange("createUniversity")}
                  className="bg-[#B99652] hover:bg-[#a38241] text-white px-5 py-2.5 rounded-none font-semibold text-xs uppercase tracking-wider transition-colors"
                >
                  Build Your First Institute
                </button>
              </div>
            ) : (

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredUniversities.map((uni) => (
                  <div
                    key={uni.id}
                    onClick={() => setSelectedUni(uni)}
                    data-tour="university-card"
                    className="group relative bg-white/95 backdrop-blur-xs border border-[#ebdcaa] rounded-none p-6 hover:border-[#B99652] hover:shadow-[0_8px_30px_rgba(185,150,82,0.12)] transition-all duration-200 cursor-pointer overflow-hidden flex flex-col justify-between"
                  >
                    {/* Active Status Badge */}
                    <div className="absolute top-4 right-4">
                      <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-none bg-[#fff8e7] text-[#92400e] border border-[#fde68a] text-[11px] font-semibold shadow-2xs">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#B99652]"></span>
                        <span>Active</span>
                      </div>
                    </div>
                    
                    {/* Content */}
                    <div>
                      <div className="flex items-start gap-3.5 mb-4 pr-16">
                        <div className="w-11 h-11 shrink-0 bg-gradient-to-br from-[#B99652] to-[#a38241] rounded-none flex items-center justify-center text-white border border-[#ebdcaa] shadow-xs">
                          <Building2 size={20} />
                        </div>
                        <div>
                          <h3 className="text-lg font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b] group-hover:text-[#B99652] transition-colors leading-snug">
                            {uni.name}
                          </h3>
                          <p className="text-xs text-[#7a705a] font-medium mt-0.5 font-sans">ID: UNI-{uni.id.toString().padStart(4, '0')}</p>
                        </div>
                      </div>
                      
                      <div className="space-y-2.5 my-4">
                        <div className="flex items-center gap-2.5 text-xs text-[#665e4d]">
                          <MapPin size={15} className="text-[#B99652] shrink-0" />
                          <span className="truncate">{uni.area || "Location not specified"}</span>
                        </div>
                        
                        <div className="flex items-center gap-2.5 text-xs text-[#665e4d]">
                          <Users size={15} className="text-[#B99652] shrink-0" />
                          <span className="truncate">Admin: <strong className="font-semibold text-[#1e1b4b]">{uni.admin?.name || "Not Assigned"}</strong></span>
                        </div>
                        
                        <div className="flex items-center gap-2.5 text-xs text-[#665e4d]">
                          <Mail size={15} className="text-[#B99652] shrink-0" />
                          <span className="truncate">{uni.admin?.email || "No email"}</span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 pt-3.5 border-t border-[#ebdcaa] flex items-center justify-between">
                      <button className="text-xs font-bold text-[#B99652] group-hover:text-[#92400e] flex items-center gap-1 transition-colors">
                        View Details <ChevronRight size={14} />
                      </button>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteUniversity(uni.id);
                        }}
                        className="text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 px-2 py-1 transition-colors rounded-none flex items-center gap-1"
                      >
                        <Trash2 size={13} />
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>

            )}

          </div>

        )}



        {activeTab === "createUniversity" && (

          <CreateUniversityForm onSuccess={handleUniversityCreated} />

        )}



        {activeTab === "createUser" && (

          <CreateUserForm onSuccess={handleUserCreated} />

        )}



        {activeTab === "users" && (() => {
          const filteredUsers = (users || []).filter((u) => {
            const term = (userSearchTerm || "").toLowerCase().trim();
            if (!term) return true;
            const nameMatch = (u.name || "").toLowerCase().includes(term);
            const emailMatch = (u.email || "").toLowerCase().includes(term);
            const roleMatch = (u.role || "").toLowerCase().includes(term);
            const uniMatch = (u.university || "").toLowerCase().includes(term);
            return nameMatch || emailMatch || roleMatch || uniMatch;
          });

          return (
            <div>
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-6 pb-3 border-b border-[#ebdcaa]/60">
                <div>
                  <h2 className="text-2xl sm:text-3xl font-['DM_Serif_Display',serif] text-[#1e1b4b] tracking-tight">
                    Empire Staff Directory
                  </h2>
                  <p className="text-xs uppercase tracking-wider text-slate-500 font-semibold mt-1">
                    Manage admins, mentors, students, and institutional staff ({users.length} Total)
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3 mt-4 lg:mt-0 w-full sm:w-auto">
                  <div className="relative w-full sm:w-80 md:w-96">
                    <Search className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-[#B99652]" size={16} />
                    <input
                      type="text"
                      placeholder="Search staff by name, email, role, university..."
                      data-tour="search-staff"
                      value={userSearchTerm}
                      onChange={(e) => setUserSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 bg-white border border-[#ebdcaa] rounded-none focus:outline-none focus:border-[#B99652] focus:ring-1 focus:ring-[#B99652] text-sm text-[#1e1b4b] placeholder-slate-400 shadow-xs"
                    />
                    {userSearchTerm && (
                      <button
                        onClick={() => setUserSearchTerm("")}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                  <button 
                    onClick={() => handleTabChange("createUser")}
                    className="flex items-center gap-2 px-4 py-2.5 bg-[#B99652] hover:bg-[#a38241] text-white rounded-none font-semibold text-xs uppercase tracking-wider transition-colors shadow-xs"
                  >
                    <UserPlus size={16} />
                    Add Staff
                  </button>
                </div>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-none h-8 w-8 border-2 border-[#B99652] border-t-transparent"></div>
                </div>
              ) : users.length === 0 ? (
                <div className="text-center py-12 bg-white border border-[#ebdcaa] p-8">
                  <Users className="text-[#ebdcaa] mx-auto mb-4" size={48} />
                  <p className="text-sm font-semibold text-[#1e1b4b] mb-4">No staff members in your empire yet.</p>
                  <button 
                    onClick={() => handleTabChange("createUser")}
                    className="bg-[#B99652] hover:bg-[#a38241] text-white px-5 py-2.5 rounded-none font-semibold text-xs uppercase tracking-wider transition-colors"
                  >
                    👥 Hire Your First Staff Member
                  </button>
                </div>
              ) : filteredUsers.length === 0 ? (
                <div className="text-center py-12 bg-white border border-[#ebdcaa] p-8">
                  <Search className="text-slate-400 mx-auto mb-3" size={36} />
                  <p className="text-sm font-semibold text-slate-700 mb-2">No staff members match &quot;{userSearchTerm}&quot;</p>
                  <button
                    onClick={() => setUserSearchTerm("")}
                    className="text-xs font-semibold text-[#B99652] underline hover:text-[#8c6d32]"
                  >
                    Clear Search Filter
                  </button>
                </div>
              ) : (
                <div className="bg-white rounded-none shadow-xs border border-[#ebdcaa] overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead className="bg-[#fffdf4] border-b border-[#ebdcaa]">
                        <tr>
                          <th className="px-6 py-3.5 text-left text-xs font-bold text-[#1e1b4b] uppercase tracking-wider">Staff Member</th>
                          <th className="px-6 py-3.5 text-left text-xs font-bold text-[#1e1b4b] uppercase tracking-wider">Role</th>
                          <th className="px-6 py-3.5 text-left text-xs font-bold text-[#1e1b4b] uppercase tracking-wider">University</th>
                          <th className="px-6 py-3.5 text-left text-xs font-bold text-[#1e1b4b] uppercase tracking-wider">Status</th>
                          <th className="px-6 py-3.5 text-left text-xs font-bold text-[#1e1b4b] uppercase tracking-wider">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {filteredUsers.map((u) => (
                          <tr key={u.id} className="hover:bg-[#fffdf4]/60 transition-colors">
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-[#1e1b4b] border border-[#B99652]/40 rounded-full flex items-center justify-center shrink-0">
                                  <span className="text-[#ebdcaa] font-bold text-sm">
                                    {(u.name || "U").charAt(0).toUpperCase()}
                                  </span>
                                </div>
                                <div className="min-w-0">
                                  <p className="font-semibold text-sm text-[#1e1b4b] truncate">{u.name}</p>
                                  <p className="text-xs text-slate-500 truncate">{u.email}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <span className={`px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider border ${
                                u.role === 'superadmin' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                                u.role === 'admin' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' :
                                u.role === 'mentor' || u.role === 'faculty' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                u.role === 'student' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                'bg-slate-50 text-slate-700 border-slate-200'
                              }`}>
                                {u.role?.toUpperCase() || 'USER'}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-xs font-medium text-slate-700">
                              {u.university || 'System Admin'}
                            </td>
                            <td className="px-6 py-4">
                              <span className={`px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider border ${
                                u.isApproved ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-700 border-amber-200"
                              }`}>
                                {u.isApproved ? "Active" : "Pending"}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-1.5">
                                <button 
                                  onClick={() => setViewingUser(u)}
                                  title="View User Details"
                                  className="p-1.5 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded transition-colors"
                                >
                                  <Eye size={16} />
                                </button>
                                <button 
                                  onClick={() => setEditingUser({
                                    id: u.id,
                                    name: u.name || '',
                                    email: u.email || '',
                                    role: u.role || 'student',
                                    isApproved: Boolean(u.isApproved),
                                    university_id: u.university_id || '',
                                    university: u.university || '',
                                    password: ''
                                  })}
                                  title="Edit User"
                                  className="p-1.5 text-amber-600 hover:text-amber-800 hover:bg-amber-50 rounded transition-colors"
                                >
                                  <Edit size={16} />
                                </button>
                                <button 
                                  onClick={() => handleDeleteUser(u.id, u.name)}
                                  title="Delete User"
                                  className="p-1.5 text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition-colors"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          );
        })()}


      </div>



      {/* University Detail Modal */}
      {selectedUni && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-none p-6 sm:p-8 max-w-2xl w-full border border-[#ebdcaa] shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 mb-6 border-b border-[#ebdcaa]">
              <h2 className="text-2xl font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b] flex items-center gap-3">
                <div className="w-11 h-11 bg-gradient-to-br from-[#B99652] to-[#a38241] rounded-none flex items-center justify-center text-white border border-[#ebdcaa] shadow-xs">
                  <Building2 size={22} />
                </div>
                <span>{selectedUni.name}</span>
              </h2>

              <button
                onClick={() => setSelectedUni(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 text-xs">
              <div className="bg-[#fffdf4] rounded-none p-4 border border-[#ebdcaa]">
                <p className="font-bold uppercase tracking-wider text-slate-500 mb-1">Location</p>
                <p className="font-semibold text-sm text-[#1e1b4b] flex items-center gap-2">
                  <MapPin size={15} className="text-[#B99652]" />
                  <span>{selectedUni.area || "Location not specified"}</span>
                </p>
              </div>

              <div className="bg-[#fffdf4] rounded-none p-4 border border-[#ebdcaa]">
                <p className="font-bold uppercase tracking-wider text-slate-500 mb-1">Institute ID</p>
                <p className="font-semibold text-sm text-[#1e1b4b]">UNI-{selectedUni.id.toString().padStart(4, '0')}</p>
              </div>

              <div className="bg-[#fffdf4] rounded-none p-4 border border-[#ebdcaa]">
                <p className="font-bold uppercase tracking-wider text-slate-500 mb-1">Administrator</p>
                <p className="font-semibold text-sm text-[#1e1b4b] flex items-center gap-2">
                  <Users size={15} className="text-[#B99652]" />
                  <span>{selectedUni.admin?.name || "Not Assigned"}</span>
                </p>
                <p className="text-xs text-[#92400e] font-medium mt-1">{selectedUni.admin?.email || "No email"}</p>
              </div>

              <div className="bg-[#fffdf4] rounded-none p-4 border border-[#ebdcaa]">
                <p className="font-bold uppercase tracking-wider text-slate-500 mb-1">Established</p>
                <p className="font-semibold text-sm text-[#1e1b4b] flex items-center gap-2">
                  <Calendar size={15} className="text-[#B99652]" />
                  <span>{new Date(selectedUni.createdAt).toLocaleDateString()}</span>
                </p>
              </div>
            </div>

            <div className="flex gap-3 pt-3 border-t border-[#ebdcaa]/60">
              <button
                onClick={() => setSelectedUni(null)}
                className="px-6 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-none font-semibold text-xs uppercase tracking-wider transition-colors"
              >
                Close
              </button>
              <button
                onClick={() => {
                  setSelectedUni(null);
                  handleTabChange("createUser");
                  toast.info("Go to Add Staff tab to hire staff for this university");
                }}
                className="flex-1 py-2.5 bg-[#B99652] hover:bg-[#a38241] text-white rounded-none font-semibold text-xs uppercase tracking-wider transition-colors shadow-xs flex items-center justify-center gap-1.5"
              >
                👥 Hire Staff
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View User Modal */}
      {viewingUser && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white max-w-lg w-full border border-[#ebdcaa] shadow-2xl p-6 relative">
            <div className="flex items-center justify-between pb-4 border-b border-[#ebdcaa]">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-[#1e1b4b] border border-[#B99652] rounded-full flex items-center justify-center text-[#ebdcaa] font-bold text-lg">
                  {(viewingUser.name || "U").charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-xl font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b]">
                    {viewingUser.name}
                  </h3>
                  <p className="text-xs text-slate-500">{viewingUser.email}</p>
                </div>
              </div>
              <button
                onClick={() => setViewingUser(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 my-5 text-xs">
              <div className="bg-[#fffdf4] p-3.5 border border-[#ebdcaa]">
                <p className="text-slate-500 font-bold uppercase tracking-wider mb-1">User ID</p>
                <p className="font-semibold text-slate-900">USR-{String(viewingUser.id).padStart(4, '0')}</p>
              </div>
              <div className="bg-[#fffdf4] p-3.5 border border-[#ebdcaa]">
                <p className="text-slate-500 font-bold uppercase tracking-wider mb-1">Role</p>
                <span className="inline-block px-2 py-0.5 font-bold uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200">
                  {viewingUser.role?.toUpperCase()}
                </span>
              </div>
              <div className="bg-[#fffdf4] p-3.5 border border-[#ebdcaa]">
                <p className="text-slate-500 font-bold uppercase tracking-wider mb-1">Assigned Institute</p>
                <p className="font-semibold text-slate-900">{viewingUser.university || 'System Admin'}</p>
              </div>
              <div className="bg-[#fffdf4] p-3.5 border border-[#ebdcaa]">
                <p className="text-slate-500 font-bold uppercase tracking-wider mb-1">Account Status</p>
                <span className={`inline-block px-2 py-0.5 font-bold uppercase tracking-wider border ${
                  viewingUser.isApproved ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'
                }`}>
                  {viewingUser.isApproved ? 'Active' : 'Pending Approval'}
                </span>
              </div>
            </div>

            <div className="flex gap-2 pt-2 border-t border-[#ebdcaa]/60">
              <button
                onClick={() => {
                  const targetUser = viewingUser;
                  setViewingUser(null);
                  setEditingUser({
                    id: targetUser.id,
                    name: targetUser.name || '',
                    email: targetUser.email || '',
                    role: targetUser.role || 'student',
                    isApproved: Boolean(targetUser.isApproved),
                    university_id: targetUser.university_id || '',
                    university: targetUser.university || '',
                    password: ''
                  });
                }}
                className="flex-1 py-2.5 bg-[#B99652] hover:bg-[#a38241] text-white font-semibold text-xs uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5"
              >
                <Edit size={14} /> Edit User
              </button>
              <button
                onClick={() => setViewingUser(null)}
                className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs uppercase tracking-wider transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {editingUser && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white max-w-lg w-full border border-[#ebdcaa] shadow-2xl p-6 relative max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-[#ebdcaa]">
              <div>
                <h3 className="text-xl font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b]">
                  Edit Staff Member
                </h3>
                <p className="text-xs text-slate-500">Update account credentials and assignment</p>
              </div>
              <button
                onClick={() => setEditingUser(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleUpdateUser} className="space-y-4 my-5">
              <div>
                <label className="block text-xs font-bold text-[#1e1b4b] uppercase tracking-wider mb-1.5">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  value={editingUser.name}
                  onChange={(e) => setEditingUser({ ...editingUser, name: e.target.value })}
                  className="w-full px-3 py-2 bg-white border border-[#ebdcaa] text-sm text-[#1e1b4b] focus:outline-none focus:border-[#B99652]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#1e1b4b] uppercase tracking-wider mb-1.5">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  value={editingUser.email}
                  onChange={(e) => setEditingUser({ ...editingUser, email: e.target.value })}
                  className="w-full px-3 py-2 bg-white border border-[#ebdcaa] text-sm text-[#1e1b4b] focus:outline-none focus:border-[#B99652]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#1e1b4b] uppercase tracking-wider mb-1.5">
                    Role
                  </label>
                  <select
                    value={editingUser.role}
                    onChange={(e) => setEditingUser({ ...editingUser, role: e.target.value })}
                    className="w-full px-3 py-2 bg-white border border-[#ebdcaa] text-sm text-[#1e1b4b] focus:outline-none focus:border-[#B99652]"
                  >
                    <option value="admin">Admin</option>
                    <option value="mentor">Mentor / Faculty</option>
                    <option value="student">Student</option>
                    <option value="accountant">Accountant</option>
                    <option value="storekeeper">Storekeeper</option>
                    <option value="superadmin">Super Admin</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#1e1b4b] uppercase tracking-wider mb-1.5">
                    Account Status
                  </label>
                  <select
                    value={editingUser.isApproved ? "1" : "0"}
                    onChange={(e) => setEditingUser({ ...editingUser, isApproved: e.target.value === "1" })}
                    className="w-full px-3 py-2 bg-white border border-[#ebdcaa] text-sm text-[#1e1b4b] focus:outline-none focus:border-[#B99652]"
                  >
                    <option value="1">Active</option>
                    <option value="0">Pending</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#1e1b4b] uppercase tracking-wider mb-1.5">
                  Assigned Institute
                </label>
                <select
                  value={editingUser.university_id || ""}
                  onChange={(e) => setEditingUser({ ...editingUser, university_id: e.target.value })}
                  className="w-full px-3 py-2 bg-white border border-[#ebdcaa] text-sm text-[#1e1b4b] focus:outline-none focus:border-[#B99652]"
                >
                  <option value="">System Admin / No Institute</option>
                  {universities.map((uni) => (
                    <option key={uni.id} value={uni.id}>
                      {uni.name} ({uni.area || 'Institute'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#1e1b4b] uppercase tracking-wider mb-1.5">
                  Reset Password <span className="text-slate-400 font-normal lowercase">(optional)</span>
                </label>
                <input
                  type="password"
                  placeholder="Leave empty to keep current password"
                  value={editingUser.password || ""}
                  onChange={(e) => setEditingUser({ ...editingUser, password: e.target.value })}
                  className="w-full px-3 py-2 bg-white border border-[#ebdcaa] text-sm text-[#1e1b4b] focus:outline-none focus:border-[#B99652] placeholder-slate-400"
                />
              </div>

              <div className="flex gap-2 pt-3 border-t border-[#ebdcaa]/60">
                <button
                  type="submit"
                  disabled={savingUser}
                  className="flex-1 py-2.5 bg-[#B99652] hover:bg-[#a38241] text-white font-semibold text-xs uppercase tracking-wider transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {savingUser ? (
                    <>
                      <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-white border-t-transparent"></div>
                      Saving...
                    </>
                  ) : (
                    "Save Changes"
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs uppercase tracking-wider transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </SuperAdminLayout>

  );

};



export default SuperAdminDashboard;

