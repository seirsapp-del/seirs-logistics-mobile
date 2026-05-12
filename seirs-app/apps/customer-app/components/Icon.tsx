import * as LucideIcons from 'lucide-react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';

type IconName = keyof typeof LucideIcons;

interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

export function Icon({ name, size = 20, color, strokeWidth = 1.75 }: IconProps) {
  const cs = useColorScheme();
  const theme = Colors[cs ?? 'light'];
  const IconComponent = LucideIcons[name] as React.ComponentType<{
    size: number;
    color: string;
    strokeWidth: number;
  }>;
  // Dev-time warning — silently returning null makes invisible-button
  // bugs hard to spot. Pulled from a real bug class found in business-app.
  if (!IconComponent) {
    if (__DEV__) console.warn(`[Icon] "${String(name)}" is not a valid lucide-react-native icon.`);
    return null;
  }
  return (
    <IconComponent
      size={size}
      color={color ?? theme.icon}
      strokeWidth={strokeWidth}
    />
  );
}
