export interface PaymentRecord {
  url: string;
  amount: string;
  txHash: string;
  timestamp: string;
  status: 'success' | 'failed';
}
