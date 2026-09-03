/**
 * Effective theme colors, honoring the user's appearance preference
 * (System / Light / Dark) from the appearance store.
 */
import { Colors } from '@/constants/theme';
import { useAppearance } from '@/store/appearance';

export function useTheme() {
  const { scheme } = useAppearance();
  return Colors[scheme];
}
