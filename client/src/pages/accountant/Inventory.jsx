import { useAuth } from "../../auth/auth";
import { useTranslation } from "../../context/TranslationContext";
import AccountantLayout from "../../components/AccountantLayout";
import { BarChart3 } from "lucide-react";

const Inventory = () => {
  const { user } = useAuth();
  const { t } = useTranslation();

  return (
    <AccountantLayout>
      <div className="space-y-8">
        <div>
          <h2 className="text-3xl font-bold text-white mb-2">📦 Inventory</h2>
          <p className="text-gray-400">Manage school inventory and resources</p>
        </div>

        <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-12 text-center">
          <BarChart3 size={64} className="mx-auto text-gray-600 mb-4" />
          <h3 className="text-2xl font-bold text-white mb-2">No Inventory Data</h3>
          <p className="text-gray-400">Inventory records will appear here once items are added to the system.</p>
        </div>
      </div>
    </AccountantLayout>
  );
};

export default Inventory;