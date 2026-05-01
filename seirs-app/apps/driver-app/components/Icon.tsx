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
  if (!LucideIcon) return null;
  return <LucideIcon size={size} color={color} strokeWidth={strokeWidth} />;
}
