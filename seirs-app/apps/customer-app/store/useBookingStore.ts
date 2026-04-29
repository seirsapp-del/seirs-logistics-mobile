import { create } from 'zustand';

export type VehicleType = 'bike' | 'car' | 'van' | 'truck';

export interface Location {
  address: string;
  lat:     number;
  lng:     number;
}

export interface BookingQuote {
  price:        number;
  distance:     string;
  estimatedTime: string;
  vehicleType:  VehicleType;
}

export interface ActiveBooking {
  id:           string;
  trackingCode: string;
  status:       'pending' | 'assigned' | 'picked_up' | 'in_transit' | 'delivered' | 'cancelled';
  driverId?:    string;
  driverName?:  string;
  driverPhone?: string;
  driverRating?: number;
  vehicleType:  VehicleType;
  pickup:       Location;
  dropoff:      Location;
  price:        number;
  createdAt:    string;
}

interface BookingState {
  // Draft booking (before confirmation)
  pickup:      Location | null;
  dropoff:     Location | null;
  vehicleType: VehicleType;
  quote:       BookingQuote | null;

  // Live booking
  activeBooking: ActiveBooking | null;
  isLoading:     boolean;
  error:         string | null;

  // Draft actions
  setPickup:      (loc: Location) => void;
  setDropoff:     (loc: Location) => void;
  setVehicleType: (type: VehicleType) => void;
  setQuote:       (quote: BookingQuote) => void;
  clearDraft:     () => void;

  // Live booking actions
  setActiveBooking: (booking: ActiveBooking | null) => void;
  updateStatus:     (status: ActiveBooking['status']) => void;
  setLoading:       (loading: boolean) => void;
  setError:         (error: string | null) => void;
}

export const useBookingStore = create<BookingState>((set) => ({
  pickup:        null,
  dropoff:       null,
  vehicleType:   'bike',
  quote:         null,
  activeBooking: null,
  isLoading:     false,
  error:         null,

  setPickup:      (loc)   => set({ pickup: loc }),
  setDropoff:     (loc)   => set({ dropoff: loc }),
  setVehicleType: (type)  => set({ vehicleType: type, quote: null }),
  setQuote:       (quote) => set({ quote }),
  clearDraft:     ()      => set({ pickup: null, dropoff: null, quote: null }),

  setActiveBooking: (booking) => set({ activeBooking: booking }),
  updateStatus: (status) =>
    set((s) => s.activeBooking ? { activeBooking: { ...s.activeBooking, status } } : {}),
  setLoading: (isLoading) => set({ isLoading }),
  setError:   (error)     => set({ error }),
}));
