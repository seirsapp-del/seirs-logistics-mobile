import { create } from 'zustand';

export interface EarningsTransaction {
  id:        string;
  type:      'trip' | 'bonus' | 'withdrawal' | 'adjustment';
  amount:    number;
  label:     string;
  date:      string;
  tripId?:   string;
  status:    'completed' | 'pending' | 'failed';
}

interface EarningsState {
  balance:           number;
  weeklyEarnings:    number;
  totalEarnings:     number;
  transactions:      EarningsTransaction[];
  isLoading:         boolean;

  setBalance:        (amount: number) => void;
  setWeeklyEarnings: (amount: number) => void;
  setTotalEarnings:  (amount: number) => void;
  setTransactions:   (txns: EarningsTransaction[]) => void;
  addTransaction:    (txn: EarningsTransaction) => void;
  setLoading:        (loading: boolean) => void;
}

export const useEarningsStore = create<EarningsState>((set) => ({
  balance:        0,
  weeklyEarnings: 0,
  totalEarnings:  0,
  transactions:   [],
  isLoading:      false,

  setBalance:        (balance)        => set({ balance }),
  setWeeklyEarnings: (weeklyEarnings) => set({ weeklyEarnings }),
  setTotalEarnings:  (totalEarnings)  => set({ totalEarnings }),
  setTransactions:   (transactions)   => set({ transactions }),
  addTransaction: (txn) =>
    set((s) => ({ transactions: [txn, ...s.transactions] })),
  setLoading: (isLoading) => set({ isLoading }),
}));
