import { StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useNetworkStatus } from '@/hooks/use-network-status';

/** Slim banner shown only while the device is offline (§11 sync status UI). */
export function OfflineBanner() {
  const { isConnected, isInternetReachable } = useNetworkStatus();
  const offline = !isConnected || !isInternetReachable;
  if (!offline) return null;

  return (
    <View style={styles.banner}>
      <Icon name="wifi-off" size={14} color="#ffffff" />
      <ThemedText type="small" style={styles.text}>
        Offline · changes saved on this device
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    gap: Spacing.two,
    backgroundColor: '#8A6D0B',
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    color: '#ffffff',
  },
});
