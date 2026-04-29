import { create } from 'zustand';

export interface WalletTransaction {
  id:        string;
  type:      'credit' | 'debit';
  amount:    number;
  label:     string;
  date:      string;
  reference?: string;
}

interface WalletState {
  balanceKobo:   number;
  balanceNaira:  number;
  transactions:  WalletTransaction[];
  isLoading:     boolean;

  setBalance:      (kobo: number) => void;
  setTransactions: (txns: WalletTransaction[]) => void;
  addTransaction:  (txn: WalletTransaction) => void;
  setLoading:      (loading: boolean) => void;
}

export const useWalletStore = create<WalletState>((set) => ({
  balanceKobo:  0,
  balanceNaira: 0,
  transactions: [],
  isLoading:    false,

  setBalance: (kobo) => set({ balanceKobo: kobo, balanceNaira: kobo / 100 }),
  setTransactions: (transactions) => set({ transactions }),
  addTransaction: (txn) => set((s) => ({ transactions: [txn, ...s.transactions] })),
  setLoading: (isLoading) => set({ isLoading }),
}));
