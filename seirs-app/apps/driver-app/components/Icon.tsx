import * as LucideIcons from 'lucide-react-native';

interface IconProps {
  name: keyof typeof LucideIcons;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

export function Icon({ name, size = 20, color = '#000', strokeWidth = 1.75 }: IconProps) {
  const LucideIcon = LucideIcons[name] as React.ComponentType<{
    size?: number; color?: string; strokeWidth?: number;
  }>;
  // Dev-time warning — silently returning null makes invisible-button
  // bugs hard to spot. Same pattern as customer + business Icon.
  if (!LucideIcon) {
    if (__DEV__) console.warn(`[Icon] "${String(name)}" is not a valid lucide-react-native icon.`);
    return null;
  }
  return <LucideIcon size={size} color={color} strokeWidth={strokeWidth} />;
}
