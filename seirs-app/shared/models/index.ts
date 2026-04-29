// ─── Shared domain models ────────────────────────────────────────
// Single source of truth for all TypeScript interfaces used across
// customer-app, driver-app, and admin-dashboard.

export interface User {
  id:        string;
  name:      string;
  email:     string;
  phone:     string;
  role:      'customer' | 'driver' | 'admin';
  token:     string;
  avatar?:   string | null;
  createdAt: string;
}

export interface Driver {
  id:           string;
  name:         string;
  email:        string;
  phone:        string;
  avatar:       string | null;
  rating:       number;
  totalTrips:   number;
  status:       'pending' | 'approved' | 'rejected' | 'suspended';
  isOnline:     boolean;
  tier:         'Bronze' | 'Silver' | 'Gold' | 'Platinum';
  balance:      number;
  totalEarned:  number;
  vehicle:      Vehicle;
}

export interface Vehicle {
  make:   string;
  model:  string;
  year:   string;
  color:  string;
  plate:  string;
  type:   'bicycle' | 'motorcycle' | 'economy' | 'suv' | 'van' | 'truck';
}

export interface Trip {
  id:              string;
  status:          TripStatus;
  customer:        Pick<User, 'id' | 'name' | 'phone' | 'avatar'>;
  driver?:         Pick<Driver, 'id' | 'name' | 'phone' | 'avatar' | 'rating' | 'vehicle'> | null;
  pickupAddress:   string;
  dropoffAddress:  string;
  pickupLat:       number;
  pickupLng:       number;
  dropoffLat:      number;
  dropoffLng:      number;
  distanceKm:      number;
  price:           number;
  driverEarnings:  number;
  date:            string;
  duration:        string;
  trackingCode:    string;
  rating?:         number | null;
  ratingComment?:  string | null;
  paymentMethod:   PaymentMethod;
  packageSize?:    string;
  isFragile?:      boolean;
  urgency?:        'instant' | 'standard' | 'scheduled';
}

export type TripStatus =
  | 'pending'
  | 'assigned'
  | 'picked_up'
  | 'in_transit'
  | 'delivered'
  | 'cancelled';

export type PaymentMethod = 'wallet' | 'card' | 'cash' | 'bank_transfer' | 'ussd';

export interface Payment {
  id:            string;
  type:          'credit' | 'debit';
  label:         string;
  amount:        number;
  date:          string;
  tripId:        string | null;
  status:        'success' | 'pending' | 'failed';
  paymentMethod: PaymentMethod;
}

export interface Wallet {
  balance:      number;
  totalSpent:   number;
  totalEarned:  number;
  currency:     'NGN';
}

export interface Notification {
  id:      string;
  title:   string;
  body:    string;
  type:    'job' | 'payment' | 'system' | 'rating' | 'promo';
  read:    boolean;
  time:    string;
  tripId?: string | null;
}

export interface ChatMessage {
  id:    string;
  text:  string;
  from:  'me' | 'customer' | 'driver';
  time:  string;
}

export interface ChatConversation {
  id:          string;
  participant: Pick<User, 'id' | 'name' | 'phone' | 'avatar'>;
  lastMessage: string;
  lastTime:    string;
  unread:      number;
  tripId:      string;
  messages:    ChatMessage[];
}

export interface BankAccount {
  id:            string;
  bankName:      string;
  accountName:   string;
  accountNumber: string;
  isDefault:     boolean;
}

export interface Rating {
  average:   number;
  total:     number;
  breakdown: { stars: number; count: number; pct: number }[];
  recent:    { id: string; customer: string; stars: number; comment: string | null; date: string }[];
}

export interface ApiError {
  message:    string;
  statusCode: number;
}

export interface PaginatedResponse<T> {
  data:    T[];
  total:   number;
  page:    number;
  limit:   number;
}
