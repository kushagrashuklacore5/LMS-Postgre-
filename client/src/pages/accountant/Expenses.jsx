import { useAuth } from "../../auth/auth";
import { useTranslation } from "../../context/TranslationContext";
import AccountantLayout from "../../components/AccountantLayout";
import { TrendingDown } from "lucide-react";

const Expenses = () => {
  const { user } = useAuth();
  const { t } = useTranslation();

  return (
    <AccountantLayout>
      <div className="space-y-8">
        <div>
          <h2 className="text-3xl font-bold text-white mb-2">💰 Expenses</h2>
          <p className="text-gray-400">Track all school and institutional expenses</p>
        </div>

        <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-12 text-center">
          <TrendingDown size={64} className="mx-auto text-gray-600 mb-4" />
          <h3 className="text-2xl font-bold text-white mb-2">No Expenses Recorded</h3>
          <p className="text-gray-400">Expense records will appear here as they are logged in the system.</p>
        </div>
      </div>
    </AccountantLayout>
  );
};

export default Expenses;