import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { resetDatabase } from '@/database/database';
import { resetSyncCursor } from '@/services/sync/syncEngine';
import { useSyncStatus } from '@/hooks/use-sync-status';
import { useTheme } from '@/hooks/use-theme';
import { useAppearance, type AppearancePreference } from '@/store/appearance';
import { useAuth } from '@/store/auth';
import { hapticSelection } from '@/utils/haptics';
import { relativeTime } from '@/utils/format';

const PHASE_LABEL: Record<string, string> = {
  idle: 'Up to date',
  syncing: 'Syncing…',
  offline: 'Offline',
  error: "Couldn't sync",
};

function Group({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  return <View style={[styles.group, { backgroundColor: theme.backgroundElement }]}>{children}</View>;
}

function Row({
  icon,
  label,
  value,
  onPress,
  destructive,
  accent,
  selected,
}: {
  icon?: IconName;
  label: string;
  value?: string;
  onPress?: () => void;
  destructive?: boolean;
  accent?: boolean;
  selected?: boolean;
}) {
  const theme = useTheme();
  const color = destructive ? theme.danger : accent ? theme.accent : theme.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      android_ripple={{ color: theme.backgroundSelected }}
      accessibilityRole={selected !== undefined ? 'radio' : 'button'}
      accessibilityState={selected !== undefined ? { selected } : undefined}
      style={({ pressed }) => [styles.row, pressed && onPress ? { backgroundColor: theme.backgroundSelected } : null]}>
      {icon ? <Icon name={icon} size={20} color={color} /> : null}
      <ThemedText type="default" style={[styles.rowLabel, { color }]}>
        {label}
      </ThemedText>
      {value ? (
        <ThemedText type="default" themeColor="textSecondary">
          {value}
        </ThemedText>
      ) : null}
      {selected ? <Icon name="check" size={20} color={theme.accent} /> : null}
    </Pressable>
  );
}

function Divider() {
  const theme = useTheme();
  return <View style={[styles.divider, { backgroundColor: theme.separator }]} />;
}

export default function SettingsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { user, isConfigured, signOut, syncNow } = useAuth();
  const { preference, setPreference } = useAppearance();
  const sync = useSyncStatus();
  const version = Constants.expoConfig?.version ?? '1.0.0';

  const appearanceOptions: { key: AppearancePreference; label: string }[] = [
    { key: 'system', label: 'System' },
    { key: 'light', label: 'Light' },
    { key: 'dark', label: 'Dark' },
  ];

  const chooseAppearance = (next: AppearancePreference) => {
    hapticSelection();
    setPreference(next);
  };

  const handleSignOut = () => {
    Alert.alert('Sign Out?', 'Your notes stay on this device.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: () => signOut() },
    ]);
  };

  const handleClearCache = () => {
    const message = user
      ? 'This clears all local notes and folders. Anything already synced will be pulled back from the cloud.'
      : 'This permanently deletes all local notes and folders.';
    Alert.alert('Clear Local Cache?', message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: async () => {
          await resetDatabase();
          // When signed in, wipe the pull watermark and re-sync so cloud data
          // flows back in; without this the incremental pull skips it.
          if (user) {
            await resetSyncCursor(user.uid);
            syncNow();
          }
        },
      },
    ]);
  };

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText type="smallBold" themeColor="textSecondary" style={styles.header}>
          ACCOUNT
        </ThemedText>
        <Group>
          {!isConfigured ? (
            <View style={styles.note}>
              <ThemedText type="small" themeColor="textSecondary">
                Cloud sync isn&apos;t configured. Add your edgeflare tenant to a{' '}
                <ThemedText type="code">.env.local</ThemedText> file to enable syncing. Your notes
                are saved on this device regardless.
              </ThemedText>
            </View>
          ) : user ? (
            <>
              <Row
                icon="user"
                label={user.displayName || user.email || 'Signed in'}
                value={user.displayName && user.email ? user.email : undefined}
              />
              <Divider />
              <Row icon="log-out" label="Sign Out" onPress={handleSignOut} destructive />
            </>
          ) : (
            <Row icon="user" label="Sign In or Create Account" onPress={() => router.push('/auth')} accent />
          )}
        </Group>

        {isConfigured && user && (
          <>
            <ThemedText type="smallBold" themeColor="textSecondary" style={styles.header}>
              SYNC
            </ThemedText>
            <Group>
              <Row icon="cloud" label="Status" value={PHASE_LABEL[sync.phase]} />
              <Divider />
              <Row
                label="Last Synced"
                value={sync.lastSyncAt ? relativeTime(sync.lastSyncAt) : 'Never'}
              />
              {sync.pendingCount > 0 && (
                <>
                  <Divider />
                  <Row label="Pending Changes" value={String(sync.pendingCount)} />
                </>
              )}
              <Divider />
              <Row icon="sync" label="Sync Now" onPress={syncNow} accent />
            </Group>
          </>
        )}

        <ThemedText type="smallBold" themeColor="textSecondary" style={styles.header}>
          APPEARANCE
        </ThemedText>
        <Group>
          {appearanceOptions.map((option, index) => (
            <View key={option.key}>
              {index > 0 && <Divider />}
              <Row
                label={option.label}
                selected={preference === option.key}
                onPress={() => chooseAppearance(option.key)}
              />
            </View>
          ))}
        </Group>

        <ThemedText type="smallBold" themeColor="textSecondary" style={styles.header}>
          STORAGE
        </ThemedText>
        <Group>
          <Row icon="trash" label="Clear Local Cache" onPress={handleClearCache} destructive />
        </Group>

        <ThemedText type="smallBold" themeColor="textSecondary" style={styles.header}>
          ABOUT
        </ThemedText>
        <Group>
          <Row label="Version" value={version} />
        </Group>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingBottom: Spacing.six },
  header: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.one,
    letterSpacing: 0.5,
  },
  group: { marginHorizontal: Spacing.three, borderRadius: 12, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
  },
  rowLabel: { flex: 1 },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: Spacing.four },
  note: { padding: Spacing.four },
});
