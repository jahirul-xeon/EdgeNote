/**
 * Rich preview card for a pasted link. Tapping opens the URL in the in-app
 * browser; long-press surfaces the block's action sheet (Open / Remove).
 * Metadata (title/description/image) lives on the block itself, so the card
 * renders offline once it has been fetched.
 */
import { Image } from 'expo-image';
import { openBrowserAsync, WebBrowserPresentationStyle } from 'expo-web-browser';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { useTheme } from '@/hooks/use-theme';
import { domainOf } from '@/services/links/linkPreview';
import type { ContentBlock } from '@/types/blocks';

type ThemeColors = ReturnType<typeof useTheme>;
type LinkBlock = Extract<ContentBlock, { type: 'link' }>;

export function LinkPreviewCard({
  block,
  theme,
  onLongPress,
}: {
  block: LinkBlock;
  theme: ThemeColors;
  onLongPress: () => void;
}) {
  const open = () => {
    void openBrowserAsync(block.url, {
      presentationStyle: WebBrowserPresentationStyle.AUTOMATIC,
    }).catch(() => {});
  };

  const host = domainOf(block.url);

  return (
    <Pressable
      onPress={open}
      onLongPress={onLongPress}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: theme.backgroundElement, borderColor: theme.separator, opacity: pressed ? 0.75 : 1 },
      ]}>
      {block.image ? (
        <Image source={{ uri: block.image }} style={styles.image} contentFit="cover" transition={150} />
      ) : null}
      <View style={styles.body}>
        <View style={styles.hostRow}>
          <Icon name="link" size={12} color={theme.textSecondary} />
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={styles.host}>
            {host}
          </ThemedText>
        </View>
        <ThemedText type="default" numberOfLines={2} style={styles.title}>
          {block.title ?? block.url}
        </ThemedText>
        {block.description ? (
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
            {block.description}
          </ThemedText>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    marginVertical: Spacing.two,
  },
  image: { width: '100%', height: 160 },
  body: { padding: Spacing.three, gap: 3 },
  hostRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  host: { flex: 1 },
  title: { fontWeight: '600' },
});
