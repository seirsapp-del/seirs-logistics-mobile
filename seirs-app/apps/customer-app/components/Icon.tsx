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
  if (!IconComponent) return null;
  return (
    <IconComponent
      size={size}
      color={color ?? theme.icon}
      strokeWidth={strokeWidth}
    />
  );
}
