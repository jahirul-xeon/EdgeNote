/**
 * Bottom action sheet (Telegram-style). Used instead of `Alert.alert` for
 * attachment actions — Android's Alert caps at 3 buttons, so a 4th (Cancel)
 * silently disappears. This renders every action plus Cancel on both platforms.
 */
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type SheetAction = {
  label: string;
  icon?: IconName;
  destructive?: boolean;
  onPress: () => void;
};

export function ActionSheet({
  visible,
  title,
  actions,
  onClose,
}: {
  visible: boolean;
  title?: string;
  actions: SheetAction[];
  onClose: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const run = (action: SheetAction) => {
    onClose();
    // Let the sheet dismiss before the action (which may open another modal).
    requestAnimationFrame(action.onPress);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[
            styles.sheet,
            { backgroundColor: theme.background, paddingBottom: insets.bottom + Spacing.two },
          ]}>
          {title ? (
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={styles.title}>
              {title}
            </ThemedText>
          ) : null}

          <View style={[styles.group, { backgroundColor: theme.backgroundElement }]}>
            {actions.map((action, i) => (
              <Pressable
                key={action.label}
                onPress={() => run(action)}
                style={({ pressed }) => [
                  styles.row,
                  i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.separator },
                  { opacity: pressed ? 0.6 : 1 },
                ]}>
                {action.icon ? (
                  <Icon
                    name={action.icon}
                    size={20}
                    color={action.destructive ? theme.danger : theme.text}
                  />
                ) : null}
                <ThemedText
                  style={[styles.rowLabel, action.destructive ? { color: theme.danger } : null]}>
                  {action.label}
                </ThemedText>
              </Pressable>
            ))}
          </View>

          <Pressable
            onPress={onClose}
            style={({ pressed }) => [
              styles.cancel,
              { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.6 : 1 },
            ]}>
            <ThemedText style={[styles.cancelLabel, { color: theme.accent }]}>Cancel</ThemedText>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { paddingHorizontal: Spacing.three, paddingTop: Spacing.two },
  title: { textAlign: 'center', paddingVertical: Spacing.two },
  group: { borderRadius: 14, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
  },
  rowLabel: { fontSize: 16 },
  cancel: {
    marginTop: Spacing.two,
    borderRadius: 14,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  cancelLabel: { fontSize: 16, fontWeight: '600' },
});
