import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

export type VehicleType =
  | 'bicycle'
  | 'motorcycle'
  | 'tricycle'
  | 'car'
  | 'van'
  | 'truck_small'
  | 'truck_large';

// Maps SEIRS vehicle types to MaterialCommunityIcons names. All 3 apps
// + the admin dashboard use this so a "motorcycle" looks identical in
// every screen — no mismatched emojis or one-off icon choices.
const ICON_MAP: Record<VehicleType, ComponentProps<typeof MaterialCommunityIcons>['name']> = {
  bicycle:     'bicycle',
  motorcycle:  'motorbike',
  tricycle:    'rickshaw',
  car:         'car',
  van:         'van-utility',
  truck_small: 'truck',
  truck_large: 'truck-cargo-container',
};

interface Props {
  type:    VehicleType;
  size?:   number;
  color?:  string;
}

export function VehicleIcon({ type, size = 24, color = '#0F2B4C' }: Props) {
  const name = ICON_MAP[type] ?? 'car';
  return <MaterialCommunityIcons name={name} size={size} color={color} />;
}
