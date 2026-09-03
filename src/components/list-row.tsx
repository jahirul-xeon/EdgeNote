import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ListRowProps = {
  icon?: IconName;
  iconColor?: string;
  label: string;
  count?: number;
  onPress?: () => void;
  onLongPress?: () => void;
  showChevron?: boolean;
  /** Renders a trailing checkmark instead of a chevron (for pickers). */
  selected?: boolean;
};

/** An iOS-style grouped list row: icon, label, trailing count + chevron. */
export function ListRow({
  icon,
  iconColor,
  label,
  count,
  onPress,
  onLongPress,
  showChevron = true,
  selected,
}: ListRowProps) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      android_ripple={{ color: theme.backgroundSelected }}
      accessibilityRole="button"
      accessibilityLabel={count !== undefined ? `${label}, ${count} notes` : label}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement },
      ]}>
      {icon ? (
        <View style={styles.iconWrap}>
          <Icon name={icon} size={20} color={iconColor ?? theme.accent} />
        </View>
      ) : null}
      <ThemedText type="default" style={styles.label} numberOfLines={1}>
        {label}
      </ThemedText>
      {count !== undefined && (
        <ThemedText type="default" themeColor="textSecondary">
          {count}
        </ThemedText>
      )}
      {selected !== undefined ? (
        selected ? (
          <Icon name="check" size={20} color={theme.accent} />
        ) : (
          <View style={styles.checkPlaceholder} />
        )
      ) : (
        showChevron && <Icon name="chevron" size={20} color={theme.textSecondary} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
  },
  iconWrap: {
    width: 26,
    alignItems: 'center',
  },
  label: {
    flex: 1,
  },
  checkPlaceholder: {
    width: 20,
  },
});
