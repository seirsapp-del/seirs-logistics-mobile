import {
  Package, PackageCheck, PackageX, ScanLine, LayoutDashboard, TrendingUp,
  Settings, LogOut, ArrowRight, ChevronRight, Search, X, Calendar, CheckSquare,
  AlertCircle, Clock, Wallet, Banknote, Users, UserPlus, UserMinus, Camera,
  CheckCircle2, User, Circle, Store, Briefcase, Upload, FileText, Plus, Minus,
  MapPin, Truck, Bike, Car, Box, Weight, ChevronDown, ChevronUp, Eye, EyeOff,
  Lock, Mail, Phone, Building2, Hash, CornerDownRight, Loader2,
  Moon, Sun, Globe, HelpCircle, Share2, Shield,
  Menu, Zap, Star, FileSpreadsheet, RotateCcw, Bell, RefreshCw,
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';

const ICONS: Record<string, LucideIcon> = {
  Package, PackageCheck, PackageX, ScanLine, LayoutDashboard, TrendingUp,
  Settings, LogOut, ArrowRight, ChevronRight, Search, X, Calendar, CheckSquare,
  AlertCircle, Clock, Wallet, Banknote, Users, UserPlus, UserMinus, Camera,
  CheckCircle2, User, Circle, Store, Briefcase, Upload, FileText, Plus, Minus,
  MapPin, Truck, Bike, Car, Box, Weight, ChevronDown, ChevronUp, Eye, EyeOff,
  Lock, Mail, Phone, Building2, Hash, CornerDownRight, Loader2,
  Moon, Sun, Globe, HelpCircle, Share2, Shield,
  Menu, Zap, Star, FileSpreadsheet, RotateCcw, Bell, RefreshCw,
};

interface IconProps {
  name:         keyof typeof ICONS;
  size?:        number;
  color?:       string;
  strokeWidth?: number;
}

export function Icon({ name, size = 20, color = '#000', strokeWidth = 1.75 }: IconProps) {
  const LucideIcon = ICONS[name];
  if (!LucideIcon) return null;
  return <LucideIcon size={size} color={color} strokeWidth={strokeWidth} />;
}
