/**
 * Central icon component. The whole app renders icons through this so stroke
 * weight, sizing, and theming stay consistent. Icons come from
 * lucide-react-native; add a new entry to `ICONS` to expose it.
 */
import {
  AlertCircle,
  Check,
  ChevronRight,
  Cloud,
  CloudOff,
  Ellipsis,
  FileText,
  Folder,
  FolderInput,
  FolderPlus,
  LogOut,
  NotebookText,
  Pin,
  Plus,
  RefreshCw,
  Search,
  Settings,
  SquarePen,
  Trash2,
  User,
  WifiOff,
  X,
  type LucideIcon,
} from 'lucide-react-native';

import { useTheme } from '@/hooks/use-theme';

const ICONS = {
  search: Search,
  folder: Folder,
  'folder-plus': FolderPlus,
  'folder-input': FolderInput,
  'all-notes': NotebookText,
  note: FileText,
  trash: Trash2,
  pin: Pin,
  plus: Plus,
  compose: SquarePen,
  more: Ellipsis,
  chevron: ChevronRight,
  check: Check,
  settings: Settings,
  user: User,
  'log-out': LogOut,
  cloud: Cloud,
  'cloud-off': CloudOff,
  sync: RefreshCw,
  error: AlertCircle,
  'wifi-off': WifiOff,
  close: X,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

type IconProps = {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
  fill?: string;
};

export function Icon({ name, size = 22, color, strokeWidth = 2, fill = 'none' }: IconProps) {
  const theme = useTheme();
  const LucideComponent = ICONS[name];
  return (
    <LucideComponent size={size} color={color ?? theme.text} strokeWidth={strokeWidth} fill={fill} />
  );
}
