import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useSyncStatus } from '@/hooks/use-sync-status';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/store/auth';
import { relativeTime } from '@/utils/format';

/** A compact sync indicator under the home title. Hidden when sync is off. */
export function SyncStatusLine() {
  const theme = useTheme();
  const router = useRouter();
  const { user, isConfigured } = useAuth();
  const sync = useSyncStatus();

  if (!isConfigured) return null;

  if (!user) {
    return (
      <Pressable
        onPress={() => router.push('/auth')}
        accessibilityRole="button"
        style={styles.wrap}>
        <Icon name="cloud-off" size={15} color={theme.textSecondary} />
        <ThemedText type="small" style={{ color: theme.accent }}>
          Sign in to sync
        </ThemedText>
      </Pressable>
    );
  }

  const { icon, label } = describe(sync.phase, sync.lastSyncAt);
  return (
    <View style={styles.wrap}>
      <Icon name={icon} size={15} color={theme.textSecondary} />
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
    </View>
  );
}

function describe(
  phase: string,
  lastSyncAt: number | null,
): { icon: IconName; label: string } {
  switch (phase) {
    case 'syncing':
      return { icon: 'sync', label: 'Syncing…' };
    case 'offline':
      return { icon: 'wifi-off', label: 'Offline' };
    case 'error':
      return { icon: 'error', label: "Couldn't sync" };
    default:
      return {
        icon: 'cloud',
        label: lastSyncAt ? `Synced ${relativeTime(lastSyncAt)}` : 'Synced',
      };
  }
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.two,
  },
});
