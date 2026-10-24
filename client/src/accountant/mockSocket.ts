type PaymentEvent = {
  id: string;
  studentId?: string;
  vendorId?: string;
  amount: number;
  type: 'Student Payment' | 'Vendor Payment';
  status: 'Success' | 'Pending' | 'Failed';
  timestamp: string;
};

const listeners: ((e: PaymentEvent) => void)[] = [];

export function emitPayment(event: PaymentEvent) {
  listeners.forEach((l) => l(event));
}

export function onPayment(listener: (e: PaymentEvent) => void) {
  listeners.push(listener);
  return () => {
    const idx = listeners.indexOf(listener);
    if (idx >= 0) listeners.splice(idx, 1);
  };
}

// Helper to simulate payments every 10s (for demo)
export function startSimulatedPayments() {
  setInterval(() => {
    const event: PaymentEvent = {
      id: 'TX' + Math.floor(Math.random() * 100000),
      studentId: 'S' + Math.floor(1000 + Math.random() * 9000),
      amount: Math.floor(500 + Math.random() * 5000),
      type: 'Student Payment',
      status: 'Success',
      timestamp: new Date().toISOString(),
    };
    emitPayment(event);
  }, 10000);
}
