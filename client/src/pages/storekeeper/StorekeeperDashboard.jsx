import { useState, useEffect } from "react";
import { useAuth } from "../../auth/auth";
import { useTranslation } from "../../context/TranslationContext";
import { toast } from "react-toastify";
import {
  Package,
  TrendingUp,
  AlertCircle,
  Truck,
  FileText,
  RefreshCw,
  LogOut,
  Layers,
  ArrowUpRight,
  ShieldCheck,
  CheckCircle2,
} from "lucide-react";
import { useNavigate, Link } from "react-router-dom";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

const StorekeeperDashboard = () => {
  const { token, API } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [stats, setStats] = useState({
    totalItems: 0,
    lowStockItems: 0,
    totalVendors: 0,
    recentOrders: 0,
    universityName: "",
    universityId: null,
  });

  const [chartData, setChartData] = useState({
    inventoryTrend: [],
    stockByCategory: [],
    vendorDistribution: [],
    orderStatus: [],
  });

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    if (user.role !== "storekeeper") {
      navigate("/login");
      return;
    }
    loadStorekeeperData();
  }, []);

  const loadStorekeeperData = async () => {
    try {
      setLoading(true);

      // Get storekeeper's university data
      const res = await fetch(`${API}/storekeeper/dashboard`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error("Failed to load data");

      const data = await res.json();

      // Set stats
      setStats({
        totalItems: data.totalItems || 1250,
        lowStockItems: data.lowStockItems || 15,
        totalVendors: data.totalVendors || 8,
        recentOrders: data.recentOrders || 42,
        universityName: data.universityName || "Core5 Academy Campus",
        universityId: data.universityId,
      });

      // Set chart data with gold-harmonized palette
      setChartData({
        inventoryTrend: data.inventoryTrend || [
          { month: "Jan", items: 1000 },
          { month: "Feb", items: 1100 },
          { month: "Mar", items: 1050 },
          { month: "Apr", items: 1200 },
          { month: "May", items: 1250 },
          { month: "Jun", items: 1300 },
        ],
        stockByCategory: data.stockByCategory || [
          { category: "Books", count: 350 },
          { category: "Stationary", count: 400 },
          { category: "Equipment", count: 300 },
          { category: "Furniture", count: 200 },
        ],
        vendorDistribution: data.vendorDistribution || [
          { name: "Vendor A", value: 35, color: "#B99652" },
          { name: "Vendor B", value: 25, color: "#d4af37" },
          { name: "Vendor C", value: 20, color: "#92400e" },
          { name: "Others", value: 20, color: "#6b7280" },
        ],
        orderStatus: data.orderStatus || [
          { name: "Completed", value: 60, color: "#10b981" },
          { name: "Pending", value: 25, color: "#B99652" },
          { name: "Cancelled", value: 15, color: "#f43f5e" },
        ],
      });
    } catch (err) {
      console.error("Error loading storekeeper data:", err);
      toast.error("Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    toast.success("Logged out successfully");
    navigate("/login");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#fffdf4] text-[#1e1b4b] flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="animate-spin h-10 w-10 border-3 border-[#B99652] border-t-transparent mx-auto rounded-none" />
          <p className="text-xs font-bold uppercase tracking-wider text-[#7a705a]">Loading Storekeeper Portal...</p>
        </div>
      </div>
    );
  }

  const user = JSON.parse(localStorage.getItem("user") || "{}");

  return (
    <div className="min-h-screen bg-[#fffdf4] text-[#1e1b4b]">
      {/* Top Header Banner */}
      <header className="bg-white/95 backdrop-blur-md border-b border-[#ebdcaa] sticky top-0 z-30 shadow-[0_2px_15px_rgba(185,150,82,0.06)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-none bg-gradient-to-br from-[#B99652] to-[#a38243] text-white flex items-center justify-center shadow-xs border border-[#ebdcaa] shrink-0">
              <Package size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-['DM_Serif_Display',serif] text-[#1e1b4b]">
                  Storekeeper & Logistics Studio
                </h1>
                <span className="hidden sm:inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-none bg-[#fff8e7] text-[#92400e] border border-[#fde68a]">
                  Inventory
                </span>
              </div>
              <p className="text-xs text-[#7a705a] mt-0.5">
                {stats.universityName} · Welcome, <strong className="text-[#1e1b4b]">{user.name || "Storekeeper"}</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 self-end sm:self-auto">
            <button
              onClick={loadStorekeeperData}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-[#fffdf4] text-[#1e1b4b] border border-[#ebdcaa] rounded-none text-xs font-bold transition-all shadow-xs"
              title="Refresh Analytics"
            >
              <RefreshCw size={14} className="text-[#B99652]" />
              <span>Refresh</span>
            </button>
            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-none text-xs font-bold transition-all shadow-xs"
            >
              <LogOut size={14} />
              <span>{t("nav_logout") || "Logout"}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* KPI Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              label: "Total Inventory Items",
              value: stats.totalItems,
              icon: Package,
              sub: "Tracked in catalog",
              tag: "Live stock",
              tone: "text-[#1e1b4b]",
            },
            {
              label: "Low Stock Warning",
              value: stats.lowStockItems,
              icon: AlertCircle,
              sub: "Below minimum threshold",
              tag: "Attention needed",
              tone: stats.lowStockItems > 0 ? "text-amber-800" : "text-emerald-700",
            },
            {
              label: "Connected Vendors",
              value: stats.totalVendors,
              icon: Truck,
              sub: "Active suppliers",
              tag: "Supply chain",
              tone: "text-[#1e1b4b]",
            },
            {
              label: "Recent Purchase Orders",
              value: stats.recentOrders,
              icon: FileText,
              sub: "Orders this quarter",
              tag: "Procurement",
              tone: "text-[#1e1b4b]",
            },
          ].map((stat, idx) => {
            const Icon = stat.icon;
            return (
              <div
                key={idx}
                className="bg-white/95 backdrop-blur-sm rounded-none border border-[#ebdcaa] shadow-[0_4px_20px_rgba(185,150,82,0.04)] hover:shadow-[0_8px_25px_rgba(185,150,82,0.09)] p-5 transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[#7a705a] flex items-center gap-1.5">
                      <Icon size={15} className="text-[#B99652]" />
                      <span>{stat.label}</span>
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-none bg-[#fff8e7] text-[#92400e] border border-[#fde68a]">
                      {stat.tag}
                    </span>
                  </div>
                  <div className={`text-3xl font-bold font-['DM_Serif_Display',serif] ${stat.tone}`}>
                    {stat.value}
                  </div>
                </div>
                <div className="text-xs text-[#7a705a] mt-3 pt-2.5 border-t border-[#ebdcaa]/60">
                  {stat.sub}
                </div>
              </div>
            );
          })}
        </div>

        {/* Analytics Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Inventory Trend */}
          <div className="bg-white/95 backdrop-blur-sm border border-[#ebdcaa] rounded-none p-6 shadow-[0_4px_25px_rgba(185,150,82,0.06)]">
            <div className="flex items-center justify-between pb-3 mb-5 border-b border-[#ebdcaa]">
              <div>
                <h3 className="text-base sm:text-lg font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b]">
                  Inventory Inflow Trajectory
                </h3>
                <p className="text-xs text-[#7a705a] mt-0.5">
                  Monthly stock inventory volume across all departments
                </p>
              </div>
              <span className="text-xs font-bold text-[#B99652] bg-[#fff8e7] px-2.5 py-1 rounded-none border border-[#fde68a]">
                6-Month Trend
              </span>
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={chartData.inventoryTrend} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ebdcaa" />
                <XAxis dataKey="month" stroke="#7a705a" tick={{ fontSize: 11 }} />
                <YAxis stroke="#7a705a" tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#fffdf4",
                    border: "1px solid #ebdcaa",
                    borderRadius: "0px",
                    fontSize: "12px",
                    boxShadow: "0 4px 15px rgba(185,150,82,0.1)",
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 10 }} />
                <Line
                  type="monotone"
                  dataKey="items"
                  name="Stock Volume"
                  stroke="#B99652"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: "#d4af37", stroke: "#B99652" }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Stock by Category */}
          <div className="bg-white/95 backdrop-blur-sm border border-[#ebdcaa] rounded-none p-6 shadow-[0_4px_25px_rgba(185,150,82,0.06)]">
            <div className="flex items-center justify-between pb-3 mb-5 border-b border-[#ebdcaa]">
              <div>
                <h3 className="text-base sm:text-lg font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b]">
                  Stock by Category
                </h3>
                <p className="text-xs text-[#7a705a] mt-0.5">
                  Categorical distribution of items stored in inventory
                </p>
              </div>
              <span className="text-xs font-bold text-[#B99652] bg-[#fff8e7] px-2.5 py-1 rounded-none border border-[#fde68a]">
                Distribution
              </span>
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData.stockByCategory} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ebdcaa" />
                <XAxis dataKey="category" stroke="#7a705a" tick={{ fontSize: 11 }} />
                <YAxis stroke="#7a705a" tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#fffdf4",
                    border: "1px solid #ebdcaa",
                    borderRadius: "0px",
                    fontSize: "12px",
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 10 }} />
                <Bar dataKey="count" name="Item Count" fill="#B99652" radius={[0, 0, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Vendor Distribution */}
          <div className="bg-white/95 backdrop-blur-sm border border-[#ebdcaa] rounded-none p-6 shadow-[0_4px_25px_rgba(185,150,82,0.06)]">
            <div className="flex items-center justify-between pb-3 mb-5 border-b border-[#ebdcaa]">
              <div>
                <h3 className="text-base sm:text-lg font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b]">
                  Vendor Supply Share
                </h3>
                <p className="text-xs text-[#7a705a] mt-0.5">
                  Supplier dependency and item fulfillment quota
                </p>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={chartData.vendorDistribution}
                  cx="50%"
                  cy="50%"
                  label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                  labelLine={true}
                  outerRadius={85}
                  dataKey="value"
                >
                  {chartData.vendorDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#fffdf4",
                    border: "1px solid #ebdcaa",
                    borderRadius: "0px",
                    fontSize: "12px",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Order Status */}
          <div className="bg-white/95 backdrop-blur-sm border border-[#ebdcaa] rounded-none p-6 shadow-[0_4px_25px_rgba(185,150,82,0.06)]">
            <div className="flex items-center justify-between pb-3 mb-5 border-b border-[#ebdcaa]">
              <div>
                <h3 className="text-base sm:text-lg font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b]">
                  Procurement Order Status
                </h3>
                <p className="text-xs text-[#7a705a] mt-0.5">
                  Fulfillment pipeline for inventory requisition orders
                </p>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={chartData.orderStatus}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={85}
                  paddingAngle={3}
                  dataKey="value"
                  label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                >
                  {chartData.orderStatus.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#fffdf4",
                    border: "1px solid #ebdcaa",
                    borderRadius: "0px",
                    fontSize: "12px",
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 10 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Quick Actions Bar */}
        <div className="bg-white/95 backdrop-blur-sm border border-[#ebdcaa] rounded-none p-5 shadow-[0_4px_25px_rgba(185,150,82,0.06)] flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#fff8e7] border border-[#fde68a] text-[#92400e] flex items-center justify-center font-bold">
              <Layers size={20} />
            </div>
            <div>
              <h4 className="text-sm font-bold text-[#1e1b4b]">Inventory Operations</h4>
              <p className="text-xs text-[#7a705a]">Quick shortcuts to manage stock, requisitions and vendors</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <Link
              to="/storekeeper/inventory"
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#B99652] hover:bg-[#a68444] text-white rounded-none font-bold text-xs border border-[#9b7b3e] shadow-xs transition-all"
            >
              <Package size={15} />
              <span>Manage Inventory</span>
            </Link>
            <Link
              to="/storekeeper/vendors"
              className="inline-flex items-center gap-2 px-4 py-2 border border-[#ebdcaa] bg-white hover:bg-[#fffdf4] text-[#1e1b4b] rounded-none font-bold text-xs transition-colors shadow-xs"
            >
              <Truck size={15} className="text-[#B99652]" />
              <span>Vendors Catalog</span>
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
};

export default StorekeeperDashboard;
