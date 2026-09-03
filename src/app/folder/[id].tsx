import { FlashList } from '@shopify/flash-list';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';
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
import { hapticLight, hapticWarning } from '@/utils/haptics';
import type { Note } from '@/types/note';

type ListItem = { type: 'header'; title: string } | { type: 'note'; note: Note };

export default function FolderNotesScreen() {
  const theme = useTheme();
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
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

  const data = useMemo<ListItem[]>(() => {
    const pinned = notes.filter((n) => n.isPinned);
    const others = notes.filter((n) => !n.isPinned);
    const items: ListItem[] = [];
    if (pinned.length > 0) {
      items.push({ type: 'header', title: 'Pinned' });
      pinned.forEach((note) => items.push({ type: 'note', note }));
    }
    if (others.length > 0) {
      if (pinned.length > 0) items.push({ type: 'header', title: 'Notes' });
      others.forEach((note) => items.push({ type: 'note', note }));
    }
    return items;
  }, [notes]);

  const openNote = (note: Note) => router.push({ pathname: '/note/[id]', params: { id: note.id } });

  const handleCreate = async () => {
    hapticLight();
    const note = await createNote({ folderId: folderId === ALL_NOTES_FOLDER ? null : folderId });
    router.push({ pathname: '/note/[id]', params: { id: note.id } });
  };

  const handleLongPress = (note: Note) => {
    Alert.alert(deriveTitle(note.content) || 'New Note', undefined, [
      {
        text: note.isPinned ? 'Unpin' : 'Pin',
        onPress: () => {
          hapticLight();
          void setPinned(note.id, !note.isPinned);
        },
      },
      {
        text: 'Move to Folder…',
        onPress: () => router.push({ pathname: '/move/[id]', params: { id: note.id } }),
      },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          hapticWarning();
          void deleteNote(note.id);
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <ThemedView style={styles.container}>
      <OfflineBanner />
      <FlashList
        data={data}
        keyExtractor={(item) => (item.type === 'header' ? `h-${item.title}` : item.note.id)}
        getItemType={(item) => item.type}
        contentContainerStyle={{ paddingTop: Spacing.two, paddingBottom: insets.bottom + 96 }}
        renderItem={({ item }) =>
          item.type === 'header' ? (
            <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionHeader}>
              {item.title}
            </ThemedText>
          ) : (
            <NoteRow note={item.note} onPress={openNote} onLongPress={handleLongPress} />
          )
        }
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
      />

      <Animated.View
        entering={reduceMotion ? undefined : FadeIn.duration(250)}
        style={[styles.fabWrap, { bottom: insets.bottom + Spacing.four }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="New note"
          onPress={handleCreate}
          style={({ pressed }) => [
            styles.fab,
            {
              backgroundColor: theme.accent,
              opacity: pressed ? 0.85 : 1,
              transform: [{ scale: pressed ? 0.96 : 1 }],
            },
          ]}>
          <Icon name="compose" size={26} color={theme.accentContrast} />
        </Pressable>
      </Animated.View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  sectionHeader: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.one,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  empty: { alignItems: 'center', justifyContent: 'center', paddingTop: Spacing.six, gap: Spacing.two },
  emptyText: { textAlign: 'center', paddingHorizontal: Spacing.six },
  fabWrap: { position: 'absolute', right: Spacing.four },
  fab: {
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
});
