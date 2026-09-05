import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Note } from '@/types/note';
import { derivePreview, deriveTitle, relativeTime } from '@/utils/format';

type NoteRowProps = {
  note: Note;
  onPress: (note: Note) => void;
  onLongPress?: (note: Note) => void;
  /** Draws a hairline separator above the row, inset to align with the title. */
  topDivider?: boolean;
};

function NoteRowComponent({ note, onPress, onLongPress, topDivider }: NoteRowProps) {
  const theme = useTheme();
  // Locked notes never reveal their content (title or preview) in the list.
  const locked = note.isLocked;
  const title = locked ? 'Locked Note' : deriveTitle(note.content) || 'New Note';
  const preview = locked ? 'This note is locked' : derivePreview(note.content);
  const hasTitle = locked || deriveTitle(note.content).length > 0;

  return (
    <Pressable
      onPress={() => onPress(note)}
      onLongPress={onLongPress ? () => onLongPress(note) : undefined}
      android_ripple={{ color: theme.backgroundSelected }}
      accessibilityRole="button"
      accessibilityLabel={`Note: ${title}`}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? theme.backgroundSelected : theme.background },
      ]}>
      {topDivider && <View style={[styles.divider, { backgroundColor: theme.separator }]} />}
      <View style={styles.titleLine}>
        {note.isPinned && (
          <View style={styles.pin}>
            <Icon name="pin" size={13} color={theme.textSecondary} fill={theme.textSecondary} />
          </View>
        )}
        {locked && (
          <View style={styles.pin}>
            <Icon name="lock" size={13} color={theme.textSecondary} />
          </View>
        )}
        <ThemedText
          type="default"
          numberOfLines={1}
          style={[styles.title, !hasTitle && { color: theme.textSecondary }]}>
          {title}
        </ThemedText>
      </View>
      <View style={styles.metaLine}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.time}>
          {relativeTime(note.updatedAt)}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={styles.preview}>
          {preview.length > 0 ? preview : 'No additional text'}
        </ThemedText>
      </View>
    </Pressable>
  );
}

export const NoteRow = memo(NoteRowComponent);

const styles = StyleSheet.create({
  row: {
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
    gap: Spacing.one,
  },
  divider: {
    position: 'absolute',
    top: 0,
    left: Spacing.four,
    right: 0,
    height: StyleSheet.hairlineWidth,
  },
  titleLine: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pin: {
    marginRight: Spacing.one,
  },
  title: {
    flex: 1,
    fontWeight: '600',
  },
  metaLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  time: {
    flexShrink: 0,
  },
  preview: {
    flex: 1,
  },
});
