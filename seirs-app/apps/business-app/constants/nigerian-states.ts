/**
 * All 36 Nigerian states + Federal Capital Territory.
 *
 * Used by the register / address-edit forms to constrain the State field
 * to a known set. Keeps the dispatch system honest — pricing zones,
 * inter-state surcharges, and reporting all key off these canonical names.
 *
 * Order: Lagos + FCT first (most users), then alphabetical.
 */
export const NIGERIAN_STATES = [
  'Lagos',
  'FCT (Abuja)',
  // The rest alphabetical
  'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue',
  'Borno', 'Cross River', 'Delta', 'Ebonyi', 'Edo', 'Ekiti', 'Enugu', 'Gombe',
  'Imo', 'Jigawa', 'Kaduna', 'Kano', 'Katsina', 'Kebbi', 'Kogi', 'Kwara',
  'Nasarawa', 'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo', 'Plateau', 'Rivers',
  'Sokoto', 'Taraba', 'Yobe', 'Zamfara',
] as const;

export type NigerianState = typeof NIGERIAN_STATES[number];
