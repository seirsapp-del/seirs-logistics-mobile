/**
 * Default seed for the pricing system — matches seirs-pricing-spec.html
 * v1 (12 May 2026). On first boot, the PricingService seeds these rows
 * if no active RateCard or ServiceCategory rows exist. The Nigerian
 * reviewer's JSON later overrides these via /admin/rate-card.
 *
 * Keep this file in sync with the HTML spec OR be ready to re-seed when
 * the reviewer JSON arrives.
 */

export const DEFAULT_RATE_CARD = {
  version: 1,
  isActive: true,
  changeReason: 'Initial seed — matches seirs-pricing-spec.html v1',

  fuelPrices: {
    petrolPerLitreNgn: 950,
    dieselPerLitreNgn: 1250,
  },

  vehicleRates: {
    bicycle: {
      baseFareCustomer: 200, baseFareDriver: 120,
      labourPerKmCustomer: 50, labourPerKmDriver: 40,
      kmPerLitre: 999_999, fuelType: 'none' as const,
      maxPayloadKg: 5,
    },
    motorcycle: {
      baseFareCustomer: 300, baseFareDriver: 200,
      labourPerKmCustomer: 100, labourPerKmDriver: 80,
      kmPerLitre: 45, fuelType: 'petrol' as const,
      maxPayloadKg: 20,
    },
    tricycle: {
      baseFareCustomer: 400, baseFareDriver: 250,
      labourPerKmCustomer: 120, labourPerKmDriver: 90,
      kmPerLitre: 25, fuelType: 'petrol' as const,
      maxPayloadKg: 100,
    },
    car: {
      baseFareCustomer: 500, baseFareDriver: 300,
      labourPerKmCustomer: 140, labourPerKmDriver: 110,
      kmPerLitre: 12, fuelType: 'petrol' as const,
      maxPayloadKg: 200,
    },
    van: {
      baseFareCustomer: 800, baseFareDriver: 500,
      labourPerKmCustomer: 160, labourPerKmDriver: 120,
      kmPerLitre: 8, fuelType: 'petrol' as const,
      maxPayloadKg: 800,
    },
    truck_small: {
      baseFareCustomer: 1500, baseFareDriver: 1000,
      labourPerKmCustomer: 200, labourPerKmDriver: 160,
      kmPerLitre: 5, fuelType: 'diesel' as const,
      maxPayloadKg: 3000,
    },
    truck_large: {
      baseFareCustomer: 3000, baseFareDriver: 2000,
      labourPerKmCustomer: 280, labourPerKmDriver: 220,
      kmPerLitre: 3, fuelType: 'diesel' as const,
      maxPayloadKg: 10000,
    },
  },

  stopAndDwell: {
    perStopBonusCustomer: 300,
    perStopBonusDriver: 200,
    perDwellMinuteCustomer: 40,
    perDwellMinuteDriver: 25,
    freeDwellThresholdMinutes: 5,
    dwellCapMinutes: 30,
  },

  weightTiers: [
    { minKg: 0,   maxKg: 5,    extraMinutes: 1,  why: 'Hand-carry, single trip' },
    { minKg: 5,   maxKg: 20,   extraMinutes: 3,  why: 'One trip, two-handed or hand-cart' },
    { minKg: 20,  maxKg: 50,   extraMinutes: 6,  why: 'Multiple trips or two-person carry' },
    { minKg: 50,  maxKg: 200,  extraMinutes: 12, why: 'Trolley, multi-person, partial unload' },
    { minKg: 200, maxKg: 500,  extraMinutes: 20, why: 'Crew effort, full truck bed' },
    { minKg: 500, maxKg: null, extraMinutes: 40, why: 'Full loading crew, possibly hydraulic lift' },
  ],

  dwellBuffers: {
    baselineMinutes: 2,   // every stop — Nigerian cultural buffer
    estateMinutes:   2,   // compound / gated estate
    marketMinutes:   3,   // open market / stall
    govtMinutes:     5,   // government building / bank
  },

  timeSurcharges: {
    night:   { windowStart: '22:00', windowEnd: '05:00', customerPercent: 25, driverSharePercent: 80 },
    peak:    { windowStart: '17:00', windowEnd: '19:00', customerPercent: 15, driverSharePercent: 60 },
    weekend: { customerPercent: 10, driverSharePercent: 70 },
  },

  // New state-aware zone tier. Legacy fields kept for backwards-compat
  // with v1 rate cards still in pricing.service fallback logic.
  zoneSurcharges: {
    intraStateLongHaulKm:     100,
    intraStateLongHaulPct:    15,
    interStateAdjacentPct:    20,
    interStateDistantPct:     30,
    crossZonePct:             40,
    restrictedZoneDefaultPct: 50,
    overnightFeeKm:           500,
    overnightFeeNgn:          5000,
    // Legacy (still consumed by v1 fallback)
    intraStatePercent:        0,
    interStatePercent:        20,
    longDistancePercent:      30,
    longDistanceThresholdKm:  100,
    overnightThresholdKm:     500,
    restrictedZones:          [],
  },

  // Regional pricing — six geopolitical zones + per-state overrides +
  // admin-addable sub-zones. Matches customer-app's DEFAULT_RATE_CARD
  // (constants/rateCard.ts) so locally-computed quotes equal backend.
  regions: {
    zoneOverrides: {
      SW: { rateMultiplier: 1.00, reason: 'Baseline — calibrated for SW urban (Lagos/Ibadan/Abeokuta).' },
      SE: { rateMultiplier: 0.95, reason: 'Lower wages + denser urban network.' },
      SS: { rateMultiplier: 1.10, fuelPrices: { petrolNgn: 1050, dieselNgn: 1350 }, reason: 'Oil delta — security + fuel supply quirks.' },
      NC: { rateMultiplier: 1.05, reason: 'FCT premium + longer rural routes.' },
      NW: { rateMultiplier: 0.90, reason: 'Lower wage base + cheaper fuel access (Kano hub).' },
      NE: { rateMultiplier: 1.15, dwellBufferMin: 3, reason: 'Security premium (parts of Borno/Yobe/Adamawa).' },
    },
    stateOverrides: {
      LA: { rateMultiplier: 1.10, reason: 'Lagos — traffic + higher cost of living.' },
      FC: { rateMultiplier: 1.10, reason: 'FCT — institutional demand premium.' },
      RI: { rateMultiplier: 1.15, reason: 'Port Harcourt — refinery/oil traffic + security.' },
      BO: { rateMultiplier: 1.30, reason: 'Borno — heightened security across most LGAs.' },
      KN: { rateMultiplier: 0.85, reason: 'Kano metro — cheaper than SW baseline.' },
    },
    restrictedSubZones: [
      {
        id:           'seed_bo_ne_corridor',
        name:         'NE corridor (security advisory)',
        stateCode:    'BO',
        surchargePct: 50,
        reason:       'Active security advisory; admin can refine to specific LGAs.',
        active:       true,
      },
    ],
  },

  discounts: {
    bulkUploadOffPercent: 10,
    bulkUploadMinPackages: 25,
    recurringOffPercent: 5,
    loyaltyPointValueNgn: 1,    // 1 point = ₦1, earned 1 per ₦100 funded
    welcomeOffPercent: 15,
    welcomeMaxNgn: 500,
  },

  feeRules: {
    cancelPreAssignCustomer: 0,
    cancelPostAssignCustomer: 300,
    cancelPostAssignDriver: 200,
    senderNoShowFlat: 300,
    senderNoShowWaitMinutes: 10,
    returnTripBaseFee: 500,
    returnCallAttempts: 3,
  },

  partnerStore: {
    perPackageFeeNgn: 500,
    overstayTier1StartDay: 3,
    overstayTier1DailyFeeNgn: 200,
    overstayTier2DailyFeeNgn: 500,
    returnTriggerDay: 6,
    partnerSharePercent: 70,
    defaultMaxCapacity: 50,
  },

  vatRate: 0.075,
};

export const DEFAULT_SERVICE_CATEGORIES: Array<{
  code: string; name: string; examples: string;
  suggestedVehicles: string[]; setupDwellMinutes: number;
  surchargePercent: number; safetyRules: any; sortOrder: number;
}> = [
  { code: 'documents', name: 'Documents',
    examples: 'Letters, contracts, invoices, archive boxes',
    suggestedVehicles: ['bicycle', 'motorcycle', 'tricycle'],
    setupDwellMinutes: 3, surchargePercent: 0,
    safetyRules: null, sortOrder: 1 },

  { code: 'small_parcel', name: 'Small parcels',
    examples: 'Phones, books, cosmetics, shoes',
    suggestedVehicles: ['motorcycle', 'tricycle'],
    setupDwellMinutes: 4, surchargePercent: 0,
    safetyRules: null, sortOrder: 2 },

  { code: 'standard_parcel', name: 'Standard parcels',
    examples: 'Boxed goods, small appliances',
    suggestedVehicles: ['tricycle', 'car'],
    setupDwellMinutes: 5, surchargePercent: 0,
    safetyRules: null, sortOrder: 3 },

  { code: 'fragile', name: 'Fragile / Electronics',
    examples: 'Glassware, phones, laptops, art',
    suggestedVehicles: ['car', 'van'],
    setupDwellMinutes: 7, surchargePercent: 20,
    safetyRules: {
      blockedVehicles: ['bicycle'],
      warningVehicles: ['motorcycle'],
      weightThresholdKg: 3,
      warningCopy: 'Fragile items above 3kg shouldn\'t go on a motorcycle. SEIRS isn\'t liable for breakage on motorcycle pickups.',
    },
    sortOrder: 4 },

  { code: 'food_hot', name: 'Hot food',
    examples: 'Restaurant orders, jollof, suya',
    suggestedVehicles: ['motorcycle', 'car'],
    setupDwellMinutes: 4, surchargePercent: 10,
    safetyRules: null, sortOrder: 5 },

  { code: 'food_cold', name: 'Cold / Frozen food',
    examples: 'Groceries, ice cream, meat',
    suggestedVehicles: ['van'],
    setupDwellMinutes: 6, surchargePercent: 30,
    safetyRules: {
      blockedVehicles: ['bicycle', 'motorcycle'],
      warningCopy: 'Cold-chain items need a van or truck. Motorcycle/bike can\'t maintain temperature.',
    },
    sortOrder: 6 },

  { code: 'medical', name: 'Medical supplies',
    examples: 'Lab samples, medication, vaccines',
    suggestedVehicles: ['car', 'van'],
    setupDwellMinutes: 7, surchargePercent: 25,
    safetyRules: null, sortOrder: 7 },

  { code: 'bulk_goods', name: 'Bulk goods',
    examples: 'Bags of rice, grains, cement, sand',
    suggestedVehicles: ['van', 'truck_small'],
    setupDwellMinutes: 10, surchargePercent: 0,
    safetyRules: {
      blockedVehicles: ['bicycle', 'motorcycle'],
      warningCopy: 'Bulk goods need a van or larger.',
    },
    sortOrder: 8 },

  { code: 'farm_produce', name: 'Farm produce',
    examples: 'Yam, plantain, palm oil, tubers, fish',
    suggestedVehicles: ['tricycle', 'van', 'truck_small'],
    setupDwellMinutes: 12, surchargePercent: 0,
    safetyRules: {
      warningVehicles: ['bicycle', 'motorcycle'],
      weightThresholdKg: 20,
      warningCopy: 'Farm produce over 20kg shouldn\'t go on a motorcycle.',
    },
    sortOrder: 9 },

  { code: 'building', name: 'Building materials',
    examples: 'Cement bags, blocks, rods, tiles',
    suggestedVehicles: ['truck_small', 'truck_large'],
    setupDwellMinutes: 15, surchargePercent: 15,
    safetyRules: {
      blockedVehicles: ['bicycle', 'motorcycle', 'tricycle', 'car', 'van'],
      warningCopy: 'Building materials require a truck.',
    },
    sortOrder: 10 },

  { code: 'lumber', name: 'Lumber / Sawmill',
    examples: 'Planks, beams, raw wood',
    suggestedVehicles: ['truck_large'],
    setupDwellMinutes: 18, surchargePercent: 20,
    safetyRules: {
      blockedVehicles: ['bicycle', 'motorcycle', 'tricycle', 'car', 'van', 'truck_small'],
      warningCopy: 'Lumber requires a large truck — long loads are unsafe on smaller vehicles.',
    },
    sortOrder: 11 },

  { code: 'house_move_single', name: 'House move — single item',
    examples: 'Sofa, fridge, wardrobe, bed',
    suggestedVehicles: ['van', 'truck_small'],
    setupDwellMinutes: 20, surchargePercent: 25,
    safetyRules: {
      blockedVehicles: ['bicycle', 'motorcycle', 'tricycle', 'car'],
      warningCopy: 'House-move items need a van or truck.',
    },
    sortOrder: 12 },

  { code: 'house_move_full', name: 'House move — full unit',
    examples: 'Studio / 1BR / 2BR / 3BR relocation',
    suggestedVehicles: ['truck_large'],
    setupDwellMinutes: 60, surchargePercent: 40,
    safetyRules: {
      blockedVehicles: ['bicycle', 'motorcycle', 'tricycle', 'car', 'van', 'truck_small'],
      warningCopy: 'Full house moves require a large truck and admin approval — contact support.',
    },
    sortOrder: 13 },

  { code: 'live_animals', name: 'Live animals',
    examples: 'Poultry, goats, sheep, rams',
    suggestedVehicles: ['van', 'truck_small', 'truck_large'],
    setupDwellMinutes: 15, surchargePercent: 30,
    safetyRules: {
      blockedVehicles: ['bicycle', 'motorcycle', 'tricycle', 'car'],
      warningCopy: 'Live animals require a ventilated van or truck. Welfare cert needed for inter-state.',
    },
    sortOrder: 14 },

  { code: 'industrial', name: 'Industrial parts',
    examples: 'Machinery components, generators',
    suggestedVehicles: ['van', 'truck_small'],
    setupDwellMinutes: 12, surchargePercent: 15,
    safetyRules: {
      blockedVehicles: ['bicycle', 'motorcycle'],
      warningCopy: 'Industrial parts need a van or truck.',
    },
    sortOrder: 15 },

  { code: 'other', name: 'Other / Special',
    examples: 'Anything not listed — free text',
    suggestedVehicles: ['car', 'van'],
    setupDwellMinutes: 5, surchargePercent: 0,
    safetyRules: {
      warningCopy: 'Special items are routed to admin for pricing approval before dispatch.',
    },
    sortOrder: 99 },
];
