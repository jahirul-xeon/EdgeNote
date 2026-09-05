/**
 * Inline player for audio-note attachments. A play/pause button, a progress
 * bar, and the elapsed/total time. Source is the local recording, or the cloud
 * URL when only that is available.
 */
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

export function AudioPlayer({ uri, name }: { uri?: string; name?: string | null }) {
  const theme = useTheme();
  const source = useMemo(() => (uri ? { uri } : undefined), [uri]);
  const player = useAudioPlayer(source);
  const status = useAudioPlayerStatus(player);

  const duration = status.duration || 0;
  const current = status.currentTime || 0;
  const progress = duration > 0 ? Math.min(1, current / duration) : 0;

  const toggle = () => {
    if (!uri) return;
    if (status.playing) {
      player.pause();
    } else {
      if (status.didJustFinish || current >= duration) player.seekTo(0);
      player.play();
    }
  };

  return (
    <View style={[styles.wrap, { backgroundColor: theme.backgroundElement }]}>
      <Pressable
        onPress={toggle}
        accessibilityRole="button"
        accessibilityLabel={status.playing ? 'Pause' : 'Play'}
        style={[styles.playBtn, { backgroundColor: theme.accent }]}>
        <Icon name={status.playing ? 'pause' : 'play'} size={18} color="#fff" />
      </Pressable>
      <View style={styles.body}>
        <ThemedText type="small" numberOfLines={1} style={styles.name}>
          {name ?? 'Audio note'}
        </ThemedText>
        <View style={[styles.track, { backgroundColor: theme.separator }]}>
          <View style={[styles.fill, { backgroundColor: theme.accent, width: `${progress * 100}%` }]} />
        </View>
      </View>
      <ThemedText type="small" themeColor="textSecondary" style={styles.time}>
        {formatTime(status.playing || current > 0 ? current : duration)}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.two,
    paddingRight: Spacing.three,
    borderRadius: 12,
    marginVertical: Spacing.two,
  },
  playBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, gap: 6 },
  name: { fontWeight: '600' },
  track: { height: 4, borderRadius: 2, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2 },
  time: { flexShrink: 0, minWidth: 34, textAlign: 'right' },
});
