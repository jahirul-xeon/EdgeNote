import { Pressable, StyleSheet } from 'react-native';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** A search-bar-shaped button. Tapping it navigates to the search screen. */
export function SearchField({ onPress }: { onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="search"
      accessibilityLabel="Search notes"
      style={[styles.field, { backgroundColor: theme.backgroundElement }]}>
      <Icon name="search" size={17} color={theme.textSecondary} />
      <ThemedText type="default" themeColor="textSecondary">
        Search
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    height: 38,
    borderRadius: 10,
    paddingHorizontal: Spacing.three,
    marginHorizontal: Spacing.four,
  },
  icon: {
    fontSize: 15,
  },
});
