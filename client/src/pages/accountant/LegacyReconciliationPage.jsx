import React from 'react';
import AccountantLayout from '../../components/AccountantLayout';
import LegacyReconciliation from '../../accountant/LegacyReconciliation';

export default function LegacyReconciliationPage() {
  return (
    <AccountantLayout>
      <LegacyReconciliation />
    </AccountantLayout>
  );
}
