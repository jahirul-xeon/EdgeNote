import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { Alert, Pressable, SectionList, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { NoteRow } from '@/components/notes/note-row';
import { OfflineBanner } from '@/components/offline-banner';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { getFolder } from '@/database/foldersRepository';
import { ALL_NOTES_FOLDER, createNote, deleteNote, setPinned } from '@/database/notesRepository';
import { useFolderNotes } from '@/hooks/use-folder-notes';
import { useTheme } from '@/hooks/use-theme';
import { deriveTitle } from '@/utils/format';
import type { Note } from '@/types/note';

export default function FolderNotesScreen() {
  const theme = useTheme();
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const folderId = id ?? ALL_NOTES_FOLDER;
  const { notes, loading } = useFolderNotes(folderId);
  const [title, setTitle] = useState(folderId === ALL_NOTES_FOLDER ? 'All Notes' : 'Notes');

  useEffect(() => {
    let active = true;
    if (folderId !== ALL_NOTES_FOLDER) {
      getFolder(folderId).then((folder) => {
        if (active && folder) setTitle(folder.name);
      });
    }
    return () => {
      active = false;
    };
  }, [folderId]);

  useLayoutEffect(() => {
    navigation.setOptions({ title });
  }, [navigation, title]);

  const sections = useMemo(() => {
    const pinned = notes.filter((n) => n.isPinned);
    const others = notes.filter((n) => !n.isPinned);
    const result: { title: string; data: Note[] }[] = [];
    if (pinned.length > 0) result.push({ title: 'Pinned', data: pinned });
    if (others.length > 0) result.push({ title: 'Notes', data: others });
    return result;
  }, [notes]);

  const openNote = (note: Note) => router.push({ pathname: '/note/[id]', params: { id: note.id } });

  const handleCreate = async () => {
    const note = await createNote({ folderId: folderId === ALL_NOTES_FOLDER ? null : folderId });
    router.push({ pathname: '/note/[id]', params: { id: note.id } });
  };

  const handleLongPress = (note: Note) => {
    Alert.alert(deriveTitle(note.content) || 'New Note', undefined, [
      { text: note.isPinned ? 'Unpin' : 'Pin', onPress: () => setPinned(note.id, !note.isPinned) },
      {
        text: 'Move to Folder…',
        onPress: () => router.push({ pathname: '/move/[id]', params: { id: note.id } }),
      },
      { text: 'Delete', style: 'destructive', onPress: () => deleteNote(note.id) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <ThemedView style={styles.container}>
      <OfflineBanner />
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 96 }]}
        renderSectionHeader={({ section }) => (
          <ThemedText
            type="smallBold"
            themeColor="textSecondary"
            style={[styles.sectionHeader, { backgroundColor: theme.background }]}>
            {section.title}
          </ThemedText>
        )}
        renderItem={({ item }) => (
          <NoteRow note={item} onPress={openNote} onLongPress={handleLongPress} />
        )}
        ItemSeparatorComponent={() => (
          <View style={[styles.separator, { backgroundColor: theme.separator }]} />
        )}
        ListEmptyComponent={
          loading ? null : (
            <View style={styles.empty}>
              <ThemedText type="subtitle" style={styles.emptyText}>
                No Notes
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.emptyText}>
                Tap the compose button to add one.
              </ThemedText>
            </View>
          )
        }
        stickySectionHeadersEnabled={false}
      />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="New note"
        onPress={handleCreate}
        style={({ pressed }) => [
          styles.fab,
          {
            bottom: insets.bottom + Spacing.four,
            backgroundColor: theme.accent,
            opacity: pressed ? 0.85 : 1,
            transform: [{ scale: pressed ? 0.96 : 1 }],
          },
        ]}>
        <Icon name="compose" size={26} color={theme.accentContrast} />
      </Pressable>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  listContent: { flexGrow: 1, paddingTop: Spacing.two },
  sectionHeader: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.one,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: Spacing.four },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: Spacing.six, gap: Spacing.two },
  emptyText: { textAlign: 'center', paddingHorizontal: Spacing.six },
  fab: {
    position: 'absolute',
    right: Spacing.four,
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  fabIcon: { fontSize: 32, lineHeight: 36, fontWeight: '300' },
});
