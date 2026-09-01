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
  // Added 2026-08-23 (B-7.1), the third under-fill of this registry. All six
  // were live call sites rendering NOTHING: AlertTriangle is the SOS Emergency
  // drawer row and the seirs-id security warning, QrCode is "My SEIRS ID" in
  // both drawers, ShieldCheck the verified-identity card, FileSignature the
  // contract documents, Flag "Report an issue", File every "other" document.
  AlertTriangle, Flag, QrCode, ShieldCheck, FileSignature, File,
  // Added 2026-08-24 for the package QR screen: the multi-package run
  // pages between one parcel's ticket and the next, and ArrowLeft is
  // already spoken for by the header back button on that screen.
  ChevronLeft, ExternalLink, Route,
  // Added 2026-09-01 for the rebuilt register: customer draws the
  // unchecked box as a Square glyph beside CheckSquare, and this
  // registry renders NOTHING for a name it does not know.
  Square,
  // Added 2026-09-01 for the SOS quick-dial cards: the fire service row
  // needs a flame, and this registry draws NOTHING for a name it does
  // not know, which on an emergency screen is the worst place for it.
  Flame,
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
  // Added 2026-08-23 (B-7.1), the third under-fill of this registry. All six
  // were live call sites rendering NOTHING: AlertTriangle is the SOS Emergency
  // drawer row and the seirs-id security warning, QrCode is "My SEIRS ID" in
  // both drawers, ShieldCheck the verified-identity card, FileSignature the
  // contract documents, Flag "Report an issue", File every "other" document.
  AlertTriangle, Flag, QrCode, ShieldCheck, FileSignature, File,
  // Added 2026-08-24 for the package QR screen: the multi-package run
  // pages between one parcel's ticket and the next, and ArrowLeft is
  // already spoken for by the header back button on that screen.
  ChevronLeft, ExternalLink, Route,
  // Added 2026-09-01 for the rebuilt register: customer draws the
  // unchecked box as a Square glyph beside CheckSquare, and this
  // registry renders NOTHING for a name it does not know.
  Square,
  // Added 2026-09-01 for the SOS quick-dial cards: the fire service row
  // needs a flame, and this registry draws NOTHING for a name it does
  // not know, which on an emergency screen is the worst place for it.
  Flame,
};

// Last-resort glyph, borrowed from the `FALLBACK[name] ?? something` shape
// Illustration.tsx uses. An unregistered name must never again render as
// empty space: a missing SOS icon reads as "there is no button here".
// A visible circle is a control the user can still find and tap.
const FALLBACK_ICON: LucideIcon = Circle;

interface IconProps {
  name:         keyof typeof ICONS;
  size?:        number;
  color?:       string;
  strokeWidth?: number;
}

export function Icon({ name, size = 20, color = '#000', strokeWidth = 1.75 }: IconProps) {
  const registered = ICONS[name];
  // Dev-time warning when a name isn't registered, so it still gets fixed
  // rather than hiding behind the fallback for another three audits.
  if (!registered && __DEV__) {
    console.warn(`[Icon] "${name}" is not registered. Add it to apps/business-app/components/Icon.tsx.`);
  }
  const LucideIcon = registered ?? FALLBACK_ICON;
  return <LucideIcon size={size} color={color} strokeWidth={strokeWidth} />;
}
