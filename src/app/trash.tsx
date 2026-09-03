import { useEffect, useLayoutEffect, useState } from 'react';
import { useNavigation } from 'expo-router';
import { Alert, Pressable, SectionList, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { subscribeToChanges } from '@/database/changeBus';
import {
  emptyTrash,
  getDeletedNotes,
  permanentlyDeleteNote,
  restoreNote,
} from '@/database/notesRepository';
import { useTheme } from '@/hooks/use-theme';
import { deriveTitle, derivePreview, relativeTime } from '@/utils/format';
import type { Note } from '@/types/note';

export default function TrashScreen() {
  const theme = useTheme();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [notes, setNotes] = useState<Note[]>([]);

  useEffect(() => {
    let active = true;
    const run = () => {
      getDeletedNotes().then((next) => {
        if (active) setNotes(next);
      });
    };
    run();
    const unsubscribe = subscribeToChanges(run);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: 'Recently Deleted',
      headerRight: () =>
        notes.length > 0 ? (
          <Pressable onPress={handleEmpty} hitSlop={8} accessibilityRole="button">
            <ThemedText type="default" style={{ color: theme.accent }}>
              Empty
            </ThemedText>
          </Pressable>
        ) : null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation, notes.length, theme.accent]);

  const handleEmpty = () => {
    Alert.alert('Empty Recently Deleted?', 'This permanently deletes all notes here.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete All', style: 'destructive', onPress: () => emptyTrash() },
    ]);
  };

  const handleLongPress = (note: Note) => {
    Alert.alert(deriveTitle(note.content) || 'New Note', undefined, [
      { text: 'Restore', onPress: () => restoreNote(note.id) },
      {
        text: 'Delete Permanently',
        style: 'destructive',
        onPress: () =>
          Alert.alert('Delete Permanently?', 'This cannot be undone.', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: () => permanentlyDeleteNote(note.id),
            },
          ]),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <ThemedView style={styles.container}>
      <SectionList
        sections={notes.length > 0 ? [{ title: '', data: notes }] : []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.four }]}
        ListHeaderComponent={
          notes.length > 0 ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
              Notes are kept here after deletion. Long-press to restore or delete permanently.
            </ThemedText>
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => handleLongPress(item)}
            onLongPress={() => handleLongPress(item)}
            android_ripple={{ color: theme.backgroundSelected }}
            style={({ pressed }) => [
              styles.row,
              { backgroundColor: pressed ? theme.backgroundSelected : theme.background },
            ]}>
            <ThemedText type="default" numberOfLines={1} style={styles.title}>
              {deriveTitle(item.content) || 'New Note'}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
              {item.deletedAt ? `Deleted ${relativeTime(item.deletedAt)}` : ''} · {derivePreview(item.content) || 'No additional text'}
            </ThemedText>
          </Pressable>
        )}
        ItemSeparatorComponent={() => (
          <View style={[styles.separator, { backgroundColor: theme.separator }]} />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <ThemedText type="subtitle" style={styles.emptyText}>
              No Deleted Notes
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.emptyText}>
              Notes you delete appear here before they are removed for good.
            </ThemedText>
          </View>
        }
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flexGrow: 1, paddingTop: Spacing.two },
  hint: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.three },
  row: { paddingVertical: Spacing.three, paddingHorizontal: Spacing.four, gap: Spacing.one },
  title: { fontWeight: '600' },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: Spacing.four },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: Spacing.six, gap: Spacing.two },
  emptyText: { textAlign: 'center', paddingHorizontal: Spacing.six },
});
