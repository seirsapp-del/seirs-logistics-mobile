// ─── Driver-side mock data (Nigerian context) ─────────────────────────────

export const MOCK_DRIVER = {
  id:          'd1',
  name:        'Chidi Okonkwo',
  email:       'chidi.driver@seirs.app',
  phone:       '+234 803 456 7890',
  avatar:      null,
  rating:      4.9,
  totalTrips:  1247,
  joinedDate:  '2024-01-15',
  status:      'approved',     // pending | approved | rejected
  isOnline:    false,
  tier:        'Gold',
  balance:     84750,
  totalEarned: 2340000,
  vehicle: {
    make:    'Toyota',
    model:   'Corolla',
    year:    '2020',
    color:   'Silver',
    plate:   'LND 423 GH',
    type:    'economy',
  },
};

export const MOCK_DRIVER_JOBS = [
  {
    id:          'job1',
    status:      'assigned',
    urgency:     'instant',
    customer:    { id: 'c1', name: 'Adebayo Adesola', phone: '+234 802 345 6789', avatar: null },
    pickupAddress:  'Victoria Island, Lagos',
    dropoffAddress: 'Lekki Phase 1, Lagos',
    pickupLat:   6.4281, pickupLng:   3.4219,
    dropoffLat:  6.4469, dropoffLng:  3.4720,
    distanceKm:  8.4,
    packageSize: 'Small',
    packageDescription: 'Documents',
    isFragile:   false,
    price:       2400,
    driverEarnings: 1920,
    estimatedDuration: '22 min',
    trackingCode: 'SRS-VT12AB34',
  },
  {
    id:          'job2',
    status:      'assigned',
    urgency:     'standard',
    customer:    { id: 'c2', name: 'Kemi Adeyemo', phone: '+234 805 678 9012', avatar: null },
    pickupAddress:  'Yaba, Lagos',
    dropoffAddress: 'Ikeja GRA, Lagos',
    pickupLat:   6.5134, pickupLng:   3.3727,
    dropoffLat:  6.5957, dropoffLng:  3.3381,
    distanceKm:  11.2,
    packageSize: 'Medium',
    packageDescription: 'Electronics',
    isFragile:   true,
    price:       3100,
    driverEarnings: 2480,
    estimatedDuration: '31 min',
    trackingCode: 'SRS-YB56CD78',
  },
];

export const MOCK_DRIVER_DELIVERIES = [
  {
    id:          'del1',
    status:      'delivered',
    customer:    { id: 'c1', name: 'Adebayo Adesola', phone: '+234 802 345 6789', avatar: null },
    pickupAddress:  'Victoria Island, Lagos',
    dropoffAddress: 'Lekki Phase 1, Lagos',
    distanceKm:  8.4,
    price:       2400,
    driverEarnings: 1920,
    date:        '2026-04-27T10:30:00Z',
    duration:    '22 min',
    trackingCode: 'SRS-VT12AB34',
    rating:      5,
    ratingComment: 'Very professional and punctual!',
    paymentMethod: 'wallet',
  },
  {
    id:          'del2',
    status:      'delivered',
    customer:    { id: 'c2', name: 'Kemi Adeyemo', phone: '+234 805 678 9012', avatar: null },
    pickupAddress:  'Yaba, Lagos',
    dropoffAddress: 'Ikeja GRA, Lagos',
    distanceKm:  11.2,
    price:       3100,
    driverEarnings: 2480,
    date:        '2026-04-25T14:15:00Z',
    duration:    '31 min',
    trackingCode: 'SRS-YB56CD78',
    rating:      5,
    ratingComment: null,
    paymentMethod: 'card',
  },
  {
    id:          'del3',
    status:      'cancelled',
    customer:    { id: 'c3', name: 'Femi Oladele', phone: '+234 807 890 1234', avatar: null },
    pickupAddress:  'Ikoyi, Lagos',
    dropoffAddress: 'Maryland, Lagos',
    distanceKm:  7.1,
    price:       2100,
    driverEarnings: 0,
    date:        '2026-04-22T16:45:00Z',
    duration:    '-',
    trackingCode: 'SRS-IK34GH56',
    rating:      null,
    ratingComment: null,
    paymentMethod: 'wallet',
  },
  {
    id:          'del4',
    status:      'delivered',
    customer:    { id: 'c4', name: 'Aisha Mohammed', phone: '+234 808 012 3456', avatar: null },
    pickupAddress:  'Gbagada, Lagos',
    dropoffAddress: 'CMS Marina, Lagos',
    distanceKm:  6.3,
    price:       1900,
    driverEarnings: 1520,
    date:        '2026-04-20T08:00:00Z',
    duration:    '18 min',
    trackingCode: 'SRS-GB78IJ90',
    rating:      4,
    ratingComment: 'Good driver.',
    paymentMethod: 'cash',
  },
  {
    id:          'del5',
    status:      'delivered',
    customer:    { id: 'c5', name: 'Tunde Adewale', phone: '+234 809 234 5678', avatar: null },
    pickupAddress:  'Surulere, Lagos',
    dropoffAddress: 'Ajah, Lagos',
    distanceKm:  18.6,
    price:       4800,
    driverEarnings: 3840,
    date:        '2026-04-18T09:00:00Z',
    duration:    '42 min',
    trackingCode: 'SRS-SR90EF12',
    rating:      5,
    ratingComment: 'Excellent service, will use again.',
    paymentMethod: 'wallet',
  },
];

export const MOCK_DRIVER_EARNINGS = [
  { id: 'e1',  type: 'credit', label: 'Trip Payout',     amount: 1920, date: '2026-04-27', tripId: 'del1', status: 'success' },
  { id: 'e2',  type: 'credit', label: 'Trip Payout',     amount: 2480, date: '2026-04-25', tripId: 'del2', status: 'success' },
  { id: 'e3',  type: 'debit',  label: 'Withdrawal',      amount: 5000, date: '2026-04-23', tripId: null,   status: 'success' },
  { id: 'e4',  type: 'credit', label: 'Trip Payout',     amount: 1520, date: '2026-04-20', tripId: 'del4', status: 'success' },
  { id: 'e5',  type: 'credit', label: 'Trip Payout',     amount: 3840, date: '2026-04-18', tripId: 'del5', status: 'success' },
  { id: 'e6',  type: 'credit', label: 'Bonus - Weekend', amount: 500,  date: '2026-04-14', tripId: null,   status: 'success' },
  { id: 'e7',  type: 'debit',  label: 'Withdrawal',      amount: 10000,date: '2026-04-10', tripId: null,   status: 'success' },
];

export const MOCK_DRIVER_RATINGS = {
  average: 4.9,
  total:   1247,
  breakdown: [
    { stars: 5, count: 1100, pct: 0.883 },
    { stars: 4, count: 112,  pct: 0.090 },
    { stars: 3, count: 22,   pct: 0.018 },
    { stars: 2, count: 8,    pct: 0.006 },
    { stars: 1, count: 5,    pct: 0.004 },
  ],
  recent: [
    { id: 'rt1', customer: 'Adebayo A.', stars: 5, comment: 'Very professional and punctual!', date: '2026-04-27' },
    { id: 'rt2', customer: 'Kemi A.',   stars: 5, comment: null,                               date: '2026-04-25' },
    { id: 'rt3', customer: 'Ngozi N.', stars: 4, comment: 'Good driver.',                      date: '2026-04-20' },
    { id: 'rt4', customer: 'Tunde A.', stars: 5, comment: 'Excellent service, will use again.', date: '2026-04-18' },
  ],
};

export const MOCK_DRIVER_BANK_ACCOUNTS = [
  { id: 'bank1', bankName: 'Guaranty Trust Bank', accountName: 'Chidi Okonkwo', accountNumber: '0123456789', isDefault: true },
  { id: 'bank2', bankName: 'Zenith Bank',         accountName: 'Chidi Okonkwo', accountNumber: '2098765432', isDefault: false },
];

export const MOCK_DRIVER_MESSAGES = [
  {
    id:          'dchat1',
    customer:    { id: 'c1', name: 'Adebayo Adesola', phone: '+234 802 345 6789', avatar: null },
    lastMessage: 'Please hurry, I have a meeting.',
    lastTime:    '10:28 AM',
    unread:      1,
    tripId:      'del1',
    messages: [
      { id: 'm1', text: 'Hello, I am on my way to your pickup location.',            from: 'me',       time: '10:24 AM' },
      { id: 'm2', text: 'Okay, I will be outside in 2 minutes.',                    from: 'customer', time: '10:25 AM' },
      { id: 'm3', text: 'I am 3 minutes away. Silver Corolla - plate LND 423 GH.',  from: 'me',       time: '10:26 AM' },
      { id: 'm4', text: 'Please hurry, I have a meeting.',                          from: 'customer', time: '10:28 AM' },
    ],
  },
  {
    id:          'dchat2',
    customer:    { id: 'c2', name: 'Kemi Adeyemo', phone: '+234 805 678 9012', avatar: null },
    lastMessage: 'Thanks, great service!',
    lastTime:    'Yesterday',
    unread:      0,
    tripId:      'del2',
    messages: [
      { id: 'm1', text: 'I have arrived at your pickup.',         from: 'me',       time: '2:10 PM' },
      { id: 'm2', text: 'Coming down now.',                       from: 'customer', time: '2:11 PM' },
      { id: 'm3', text: 'Package delivered. Have a great day!',   from: 'me',       time: '2:46 PM' },
      { id: 'm4', text: 'Thanks, great service!',                 from: 'customer', time: '2:47 PM' },
    ],
  },
];

// Verified against the live system 2026-08-10 (founder audit): the old
// answers promised instant earnings, an invented ₦200 no-show fee, a
// 500-trip rating window, and decline penalties, none of which exist.
export const DRIVER_HELP_FAQS = [
  { topic: 'Earnings', q: 'When will I receive my earnings?',       a: 'Earnings from each delivery clear 2 business days after it completes, then you can withdraw free any time (minimum ₦1,000). Need it sooner? Instant withdrawal unlocks earnings that are at least 24 hours old for a small fee, shown before you confirm.' },
  { topic: 'Earnings', q: 'How much does SEIRS take per delivery?', a: 'SEIRS takes a 30% service fee from each delivery fare; you keep 70%. Every trip in your earnings history shows the fare, the SEIRS fee, and your net so you can check the math yourself.' },
  { topic: 'Safety',   q: 'How do I report a difficult customer?',  a: 'Open Contact Support from the menu and describe what happened; you can reference the tracking code of the trip. Support replies during working hours (6am to 10pm WAT). For danger or threats, use SOS immediately.' },
  { topic: 'Trips',    q: 'What if the customer does not show up?', a: 'Message or call the customer from the trip screen first. If they stay unreachable, contact support from the same trip so the team can resolve it; do not abandon the package or leave it unattended.' },
  { topic: 'Account',  q: 'How is my rating calculated?',           a: 'Your rating is the average of every customer rating on your completed deliveries. If your average stays below 3.5, your account may be reviewed; the Ratings screen shows tips to improve.' },
  { topic: 'KYC',      q: 'What documents do I need for KYC?',      a: 'A government-issued ID (NIN, driver\'s licence, or international passport, front and back), a selfie, your driver\'s licence, vehicle photos, proof of vehicle ownership, and a valid insurance certificate. A guarantor letter is recommended but optional.' },
  { topic: 'Account',  q: 'Can I change my vehicle or bank account?', a: 'Yes, but both are protected changes: submit the new details in the app and our team reviews them before they apply. Bank changes pause withdrawals until approved; vehicle changes need photos of the outside, inside, and plate.' },
  { topic: 'Trips',    q: 'Can I decline a job request?',           a: 'Yes, you can decline any job request without penalty. Going into Wind Down mode stops new offers entirely while you finish your current jobs.' },
];

export const NIGERIAN_BANKS = [
  'Access Bank', 'Fidelity Bank', 'First Bank', 'First City Monument Bank (FCMB)',
  'Guaranty Trust Bank (GTB)', 'Opay', 'Palmpay', 'Polaris Bank',
  'Stanbic IBTC', 'Sterling Bank', 'Union Bank', 'United Bank for Africa (UBA)',
  'Wema Bank', 'Zenith Bank', 'Kuda Bank', 'Providus Bank',
];

export const WEEKLY_EARNINGS = [
  { day: 'Mon', amount: 8400  },
  { day: 'Tue', amount: 12300 },
  { day: 'Wed', amount: 6700  },
  { day: 'Thu', amount: 15800 },
  { day: 'Fri', amount: 21200 },
  { day: 'Sat', amount: 18900 },
  { day: 'Sun', amount: 9600  },
];
