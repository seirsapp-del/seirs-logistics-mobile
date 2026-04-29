import { create } from 'zustand';

export type JobStatus =
  | 'pending' | 'accepted' | 'arrived' | 'picked_up' | 'in_transit' | 'delivered' | 'cancelled';

export interface ActiveJob {
  id:            string;
  trackingCode:  string;
  status:        JobStatus;
  customerName:  string;
  customerPhone: string;
  pickup:        { address: string; lat: number; lng: number };
  dropoff:       { address: string; lat: number; lng: number };
  earnings:      number;
  packageSize:   'small' | 'medium' | 'large';
  isFragile:     boolean;
  notes?:        string;
  acceptedAt?:   string;
}

export interface DriverLocation {
  lat:       number;
  lng:       number;
  heading?:  number;
  updatedAt: string;
}

interface DriverState {
  isOnline:    boolean;
  activeJob:   ActiveJob | null;
  location:    DriverLocation | null;
  pendingJobs: ActiveJob[];
  isLoading:   boolean;

  setOnline:      (online: boolean) => void;
  setActiveJob:   (job: ActiveJob | null) => void;
  updateJobStatus: (status: JobStatus) => void;
  setLocation:    (loc: DriverLocation) => void;
  setPendingJobs: (jobs: ActiveJob[]) => void;
  removePendingJob: (id: string) => void;
  setLoading:     (loading: boolean) => void;
}

export const useDriverStore = create<DriverState>((set) => ({
  isOnline:    false,
  activeJob:   null,
  location:    null,
  pendingJobs: [],
  isLoading:   false,

  setOnline:    (isOnline)  => set({ isOnline }),
  setActiveJob: (activeJob) => set({ activeJob }),

  updateJobStatus: (status) =>
    set((s) => s.activeJob ? { activeJob: { ...s.activeJob, status } } : {}),

  setLocation: (location) => set({ location }),

  setPendingJobs: (pendingJobs) => set({ pendingJobs }),

  removePendingJob: (id) =>
    set((s) => ({ pendingJobs: s.pendingJobs.filter((j) => j.id !== id) })),

  setLoading: (isLoading) => set({ isLoading }),
}));
