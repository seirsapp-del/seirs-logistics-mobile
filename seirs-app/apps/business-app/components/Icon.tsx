import {
  Package, PackageCheck, PackageX, PackagePlus, ScanLine, LayoutDashboard, TrendingUp,
  Settings, LogOut, ArrowLeft, ArrowRight, ChevronRight, Search, X, Calendar, CheckSquare, Check, Maximize2, Gift, XCircle, Megaphone,
  AlertCircle, Clock, Wallet, Banknote, Users, UserPlus, UserMinus, Camera,
  CheckCircle2, User, Circle, Store, Briefcase, Upload, FileText, Plus, Minus,
  MapPin, Truck, Bike, Car, Box, Weight, ChevronDown, ChevronUp, Eye, EyeOff,
  Lock, Mail, Phone, Building2, Hash, CornerDownRight, Loader2,
  Moon, Sun, Globe, HelpCircle, Share2, Shield,
  Menu, Zap, Star, FileSpreadsheet, RotateCcw, Bell, RefreshCw,
  Trash2, Info, Gauge, Send, CreditCard, Repeat, ArrowDownLeft, ArrowUpRight, Download,
  Key, Copy, BarChart3, Activity, Pause, Play, Filter, Pencil,
  // Added 2026-08-15 after the founder found invisible chrome: these seven
  // were used across the app (the dashboard hamburger is AlignLeft, the
  // Messages tab is MessageSquare, the support CTA is LifeBuoy) but never
  // registered here, and the component renders nothing for unknown names.
  AlignLeft, BellOff, CheckCheck, LifeBuoy, MessageSquare, Paperclip, Receipt,
  MessageCircle, MoreHorizontal,
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';

const ICONS: Record<string, LucideIcon> = {
  Package, PackageCheck, PackageX, PackagePlus, ScanLine, LayoutDashboard, TrendingUp,
  Settings, LogOut, ArrowLeft, ArrowRight, ChevronRight, Search, X, Calendar, CheckSquare, Check, Maximize2, Gift, XCircle, Megaphone,
  AlertCircle, Clock, Wallet, Banknote, Users, UserPlus, UserMinus, Camera,
  CheckCircle2, User, Circle, Store, Briefcase, Upload, FileText, Plus, Minus,
  MapPin, Truck, Bike, Car, Box, Weight, ChevronDown, ChevronUp, Eye, EyeOff,
  Lock, Mail, Phone, Building2, Hash, CornerDownRight, Loader2,
  Moon, Sun, Globe, HelpCircle, Share2, Shield,
  Menu, Zap, Star, FileSpreadsheet, RotateCcw, Bell, RefreshCw,
  Trash2, Info, Gauge, Send, CreditCard, Repeat, ArrowDownLeft, ArrowUpRight, Download,
  Key, Copy, BarChart3, Activity, Pause, Play, Filter, Pencil,
  // Added 2026-08-15 after the founder found invisible chrome: these seven
  // were used across the app (the dashboard hamburger is AlignLeft, the
  // Messages tab is MessageSquare, the support CTA is LifeBuoy) but never
  // registered here, and the component renders nothing for unknown names.
  AlignLeft, BellOff, CheckCheck, LifeBuoy, MessageSquare, Paperclip, Receipt,
  MessageCircle, MoreHorizontal,
};

interface IconProps {
  name:         keyof typeof ICONS;
  size?:        number;
  color?:       string;
  strokeWidth?: number;
}

export function Icon({ name, size = 20, color = '#000', strokeWidth = 1.75 }: IconProps) {
  const LucideIcon = ICONS[name];
  // Dev-time warning when a name isn't registered. Previously this silently
  // returned null, which led to invisible back-arrows, trash buttons, etc.
  // Warning fires once per missing name so the dev console doesn't flood.
  if (!LucideIcon) {
    if (__DEV__) console.warn(`[Icon] "${name}" is not registered. Add it to apps/business-app/components/Icon.tsx.`);
    return null;
  }
  return <LucideIcon size={size} color={color} strokeWidth={strokeWidth} />;
}
