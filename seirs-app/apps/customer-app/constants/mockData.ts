// ─── Nigerian mock data ───────────────────────────────────────────────────────

export const MOCK_USER = {
  id: 'u1',
  name: 'Adebayo Adesola',
  email: 'adebayo@example.com',
  phone: '+234 802 345 6789',
  avatar: null,
  walletBalance: 47500,
  referralCode: 'ADEBAYO20',
  points: 1240,
  tier: 'Gold',
};

export const MOCK_DRIVERS = [
  {
    id: 'd1',
    name: 'Chidi Okonkwo',
    phone: '+234 803 456 7890',
    rating: 4.9,
    trips: 1247,
    vehicle: 'Toyota Corolla 2020',
    plate: 'LND 423 GH',
    vehicleType: 'economy',
    color: 'Silver',
    avatar: null,
    eta: 4,
    isOnline: true,
  },
  {
    id: 'd2',
    name: 'Musa Ibrahim',
    phone: '+234 805 678 9012',
    rating: 4.7,
    trips: 632,
    vehicle: 'Honda Accord 2021',
    plate: 'AGL 881 KK',
    vehicleType: 'premium',
    color: 'Black',
    avatar: null,
    eta: 7,
    isOnline: true,
  },
  {
    id: 'd3',
    name: 'Tunde Bakare',
    phone: '+234 807 890 1234',
    rating: 4.6,
    trips: 389,
    vehicle: 'Hiace Bus 2019',
    plate: 'LSR 220 AA',
    vehicleType: 'truck',
    color: 'White',
    avatar: null,
    eta: 12,
    isOnline: true,
  },
];

// Ride vehicles — what passengers see on /request and /vehicle-select.
// Nigerian transport names per spec; prices computed via calcRideFare().
export const RIDE_VEHICLES = [
  {
    id: 'okada',
    label: 'Okada',
    icon: 'bicycle-outline',
    subKey: 'okadaSub',
    description: 'Fastest in traffic',
    eta: '2 min',
    base: 600,
    perKm: 60,
    capacityKey: 'capacityRider',
    capacityCount: 1,
    features: ['Fast', 'Cheap'],
    shareable: false,
  },
  {
    id: 'keke',
    label: 'Keke',
    icon: 'car-outline',
    subKey: 'kekeSub',
    description: 'Affordable shaded ride',
    eta: '3 min',
    base: 900,
    perKm: 90,
    capacityKey: 'capacityRiders',
    capacityCount: 3,
    features: ['Shaded', 'Affordable'],
    shareable: false,
  },
  {
    id: 'car',
    label: 'Car',
    icon: 'car-sport-outline',
    subKey: 'carSub',
    description: 'Comfortable AC ride',
    eta: '4 min',
    base: 1500,
    perKm: 180,
    capacityKey: 'capacityRiders',
    capacityCount: 4,
    features: ['AC', 'Comfort'],
    shareable: true,
  },
  {
    id: 'danfo',
    label: 'Danfo',
    icon: 'bus-outline',
    subKey: 'danfoSub',
    description: 'Group / shared bus',
    eta: '8 min',
    base: 3500,
    perKm: 300,
    capacityKey: 'capacityRiders',
    capacityCount: 14,
    features: ['Large', 'Group'],
    shareable: true,
  },
] as const;

// Ride fare = base + (distance × per-km) + 15% service.
// Shared ride applies a 20% discount on car / danfo only.
export function calcRideFare(vehicleId: string, distKm: number, shared: boolean) {
  const v = RIDE_VEHICLES.find(x => x.id === vehicleId) ?? RIDE_VEHICLES[0];
  const safeKm   = Math.max(0, distKm || 0);
  const base     = v.base;
  const dist     = Math.round(safeKm * v.perKm);
  const subtotal = base + dist;
  const service  = Math.round(subtotal * 0.15);
  const gross    = subtotal + service;
  const discount = shared && v.shareable ? Math.round(gross * 0.20) : 0;
  return { base, dist, service, discount, total: gross - discount, vehicle: v };
}

export const MOCK_VEHICLES = [
  {
    id: 'economy',
    label: 'Economy',
    icon: 'car-outline',
    description: 'Affordable everyday rides',
    eta: '4 min',
    price: 1800,
    priceLabel: '₦1,800',
    capacity: '1–3 passengers',
    features: ['AC', 'Music'],
  },
  {
    id: 'premium',
    label: 'Premium',
    icon: 'car-sport-outline',
    description: 'Comfortable premium cars',
    eta: '6 min',
    price: 3500,
    priceLabel: '₦3,500',
    capacity: '1–4 passengers',
    features: ['AC', 'Music', 'WiFi', 'Water'],
  },
  {
    id: 'truck',
    label: 'Truck / Van',
    icon: 'bus-outline',
    description: 'Large loads and group moves',
    eta: '12 min',
    price: 7500,
    priceLabel: '₦7,500',
    capacity: 'Bulky cargo',
    features: ['Covered', 'Ramp', 'Straps'],
  },
];

export const MOCK_TRIPS = [
  {
    id: 't1',
    status: 'completed',
    pickupAddress: 'Victoria Island, Lagos',
    pickupLat: 6.4281, pickupLng: 3.4219,
    dropoffAddress: 'Lekki Phase 1, Lagos',
    dropoffLat: 6.4474, dropoffLng: 3.4553,
    price: 2400,
    date: '2026-04-27T10:30:00Z',
    duration: '22 min',
    distance: '8.4 km',
    driver: MOCK_DRIVERS[0],
    vehicleType: 'economy',
    paymentMethod: 'wallet',
    trackingCode: 'SRS-VT12AB34',
    rating: 5,
  },
  {
    id: 't2',
    status: 'completed',
    pickupAddress: 'Yaba, Lagos',
    pickupLat: 6.5118, pickupLng: 3.3712,
    dropoffAddress: 'Ikeja GRA, Lagos',
    dropoffLat: 6.5825, dropoffLng: 3.3517,
    price: 3100,
    date: '2026-04-25T14:15:00Z',
    duration: '31 min',
    distance: '11.2 km',
    driver: MOCK_DRIVERS[1],
    vehicleType: 'premium',
    paymentMethod: 'card',
    trackingCode: 'SRS-YB56CD78',
    rating: 4,
  },
  {
    id: 't3',
    status: 'in_progress',
    pickupAddress: 'Surulere, Lagos',
    pickupLat: 6.5023, pickupLng: 3.3603,
    dropoffAddress: 'Ajah, Lagos',
    dropoffLat: 6.4685, dropoffLng: 3.5852,
    price: 4800,
    date: '2026-04-28T09:00:00Z',
    duration: '—',
    distance: '18.6 km',
    driver: MOCK_DRIVERS[0],
    vehicleType: 'economy',
    paymentMethod: 'cash',
    trackingCode: 'SRS-SR90EF12',
    rating: null,
  },
  {
    id: 't4',
    status: 'cancelled',
    pickupAddress: 'Ikoyi, Lagos',
    pickupLat: 6.4500, pickupLng: 3.4400,
    dropoffAddress: 'Maryland, Lagos',
    dropoffLat: 6.5712, dropoffLng: 3.3661,
    price: 2100,
    date: '2026-04-22T16:45:00Z',
    duration: '—',
    distance: '7.1 km',
    driver: null,
    vehicleType: 'economy',
    paymentMethod: 'wallet',
    trackingCode: 'SRS-IK34GH56',
    rating: null,
  },
  {
    id: 't5',
    status: 'completed',
    pickupAddress: 'Gbagada, Lagos',
    pickupLat: 6.5520, pickupLng: 3.3870,
    dropoffAddress: 'CMS Marina, Lagos',
    dropoffLat: 6.4530, dropoffLng: 3.3960,
    price: 1900,
    date: '2026-04-20T08:00:00Z',
    duration: '18 min',
    distance: '6.3 km',
    driver: MOCK_DRIVERS[2],
    vehicleType: 'economy',
    paymentMethod: 'card',
    trackingCode: 'SRS-GB78IJ90',
    rating: 5,
  },
];

export const MOCK_TRANSACTIONS = [
  { id: 'tx1', type: 'credit',  label: 'Wallet Top-up',    amount: 20000, date: '2026-04-27', method: 'Bank Transfer', status: 'success' },
  { id: 'tx2', type: 'debit',   label: 'Trip Payment',     amount: 2400,  date: '2026-04-27', method: 'Wallet',        status: 'success' },
  { id: 'tx3', type: 'debit',   label: 'Trip Payment',     amount: 3100,  date: '2026-04-25', method: 'Card',          status: 'success' },
  { id: 'tx4', type: 'credit',  label: 'Referral Bonus',   amount: 1000,  date: '2026-04-24', method: 'Referral',      status: 'success' },
  { id: 'tx5', type: 'debit',   label: 'Trip Payment',     amount: 4800,  date: '2026-04-23', method: 'Cash',          status: 'pending' },
  { id: 'tx6', type: 'credit',  label: 'Promo Cashback',   amount: 500,   date: '2026-04-21', method: 'Promo',         status: 'success' },
  { id: 'tx7', type: 'debit',   label: 'Trip Payment',     amount: 1900,  date: '2026-04-20', method: 'Card',          status: 'success' },
];

export const MOCK_MESSAGES = [
  {
    id: 'chat1',
    driver: MOCK_DRIVERS[0],
    lastMessage: 'I am 2 minutes away from your location',
    lastTime: '10:32 AM',
    unread: 1,
    tripId: 't3',
    messages: [
      { id: 'm1', text: 'Hello, I have arrived at the pickup point.', from: 'driver', time: '10:28 AM' },
      { id: 'm2', text: 'Okay, I\'m coming down now. I\'m wearing a red top.', from: 'me', time: '10:29 AM' },
      { id: 'm3', text: 'Alright, no problem. I\'m in a silver Corolla.', from: 'driver', time: '10:30 AM' },
      { id: 'm4', text: 'I am 2 minutes away from your location', from: 'driver', time: '10:32 AM' },
    ],
  },
  {
    id: 'chat2',
    driver: MOCK_DRIVERS[1],
    lastMessage: 'Trip completed. Thanks for riding with me!',
    lastTime: 'Yesterday',
    unread: 0,
    tripId: 't2',
    messages: [
      { id: 'm1', text: 'On my way to you', from: 'driver', time: '2:10 PM' },
      { id: 'm2', text: 'How far are you?', from: 'me', time: '2:12 PM' },
      { id: 'm3', text: '5 minutes max', from: 'driver', time: '2:13 PM' },
      { id: 'm4', text: 'Trip completed. Thanks for riding with me!', from: 'driver', time: '2:46 PM' },
    ],
  },
];

export const MOCK_NOTIFICATIONS = [
  { id: 'n1', type: 'trip',    title: 'Trip Completed',        body: 'Your trip to Lekki Phase 1 has been completed.', time: '10:35 AM', read: false },
  { id: 'n2', type: 'payment', title: 'Payment Successful',    body: '₦2,400 deducted from your wallet.', time: '10:35 AM', read: false },
  { id: 'n3', type: 'promo',   title: 'New Promo Available',   body: 'Use code SAVE500 and get ₦500 off your next ride.', time: 'Yesterday', read: true },
  { id: 'n4', type: 'trip',    title: 'Driver Assigned',       body: 'Chidi Okonkwo is on his way.', time: '2 days ago', read: true },
  { id: 'n5', type: 'system',  title: 'Profile Verified',      body: 'Your account has been fully verified.', time: '3 days ago', read: true },
];

export const MOCK_PROMOS = [
  { id: 'p1', code: 'SEIRS100', label: '₦100 off',  desc: 'First ride discount', expiry: '2026-05-31', valid: true },
  { id: 'p2', code: 'SAVE500',  label: '₦500 off',  desc: 'Weekend special',     expiry: '2026-04-30', valid: true },
  { id: 'p3', code: 'FREEMI',   label: 'Free ride', desc: 'Monthly reward',       expiry: '2026-04-30', valid: true },
];

export const MOCK_REWARDS = [
  { id: 'r1', label: '₦500 Ride Credit',  points: 500,  icon: 'car-outline' },
  { id: 'r2', label: '₦1,000 Cashback',   points: 1000, icon: 'cash-outline' },
  { id: 'r3', label: 'Free Premium Ride', points: 2000, icon: 'star-outline' },
  { id: 'r4', label: 'Priority Support',  points: 3000, icon: 'headset-outline' },
];

export const FARE_BREAKDOWN = {
  baseFare:    500,
  distanceFee: 840,
  timeFee:     200,
  serviceFee:  160,
  discount:    0,
  total:       1700,
};

export const SAVED_CARDS = [
  { id: 'card1', last4: '4532', brand: 'Visa',       expiry: '09/27', isDefault: true  },
  { id: 'card2', last4: '8874', brand: 'Mastercard', expiry: '12/26', isDefault: false },
];

export const HELP_FAQS = [
  { q: 'How do I cancel a ride?', a: 'You can cancel a ride within 3 minutes of booking without any charge. After 3 minutes, a ₦200 cancellation fee applies.' },
  { q: 'How do I top up my wallet?', a: 'Go to Wallet → Top Up. You can fund your wallet via bank transfer, card, or USSD.' },
  { q: 'What happens if my driver doesn\'t show up?', a: 'If your driver cancels or does not arrive, you will not be charged. You can request another driver immediately.' },
  { q: 'How do I report a lost item?', a: 'Go to your trip history, open the trip, and tap "Report Issue". Select "Lost Item" and describe it.' },
  { q: 'How are prices calculated?', a: 'Prices are based on distance, estimated travel time, vehicle type, and current demand. You always see the price before confirming.' },
  { q: 'Is my payment secure?', a: 'Yes. All card payments are processed by Flutterwave with 3D Secure. We do not store full card details on our servers.' },
];

export const LAGOS_COORDS = {
  latitude: 6.5244,
  longitude: 3.3792,
  latitudeDelta: 0.04,
  longitudeDelta: 0.04,
};

export const POPULAR_LOCATIONS = [
  { id: 'l1', label: 'Victoria Island',    address: 'Victoria Island, Lagos', lat: 6.4281, lng: 3.4219 },
  { id: 'l2', label: 'Lekki Phase 1',      address: 'Lekki Phase 1, Lagos',   lat: 6.4469, lng: 3.4720 },
  { id: 'l3', label: 'Ikeja GRA',          address: 'Ikeja GRA, Lagos',       lat: 6.5957, lng: 3.3381 },
  { id: 'l4', label: 'Yaba',               address: 'Yaba, Lagos',            lat: 6.5134, lng: 3.3727 },
  { id: 'l5', label: 'Murtala Int\'l Airport', address: 'MMIA, Ikeja, Lagos', lat: 6.5774, lng: 3.3210 },
];
