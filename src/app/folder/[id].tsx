import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionSheet, type SheetAction } from '@/components/action-sheet';
import { Icon } from '@/components/icon';
import { NoteRow } from '@/components/notes/note-row';
import { OfflineBanner } from '@/components/offline-banner';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { getFolder } from '@/database/foldersRepository';
import {
  ALL_NOTES_FOLDER,
  createNote,
  deleteNote,
  setLocked,
  setPinned,
} from '@/database/notesRepository';
import { authenticate } from '@/services/security/biometrics';
import { useFolderNotes } from '@/hooks/use-folder-notes';
import { useTheme } from '@/hooks/use-theme';
import { dateGroupLabel, deriveTitle } from '@/utils/format';
import { hapticLight, hapticSelection, hapticWarning } from '@/utils/haptics';
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
  const [isSmart, setIsSmart] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let active = true;
    if (folderId !== ALL_NOTES_FOLDER) {
      getFolder(folderId).then((folder) => {
        if (active && folder) {
          setTitle(folder.name);
          setIsSmart(folder.smartRule !== null);
        }
      });
    }
    return () => {
      active = false;
    };
  }, [folderId]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title,
      headerLargeTitle: true,
      headerLargeTitleShadowVisible: false,
      headerSearchBarOptions: {
        placeholder: 'Search notes',
        // Search + large title tuck into the nav bar on scroll; the small
        // title shows in the header (standard iOS large-title behavior).
        hideWhenScrolling: true,
        onChangeText: (e: { nativeEvent: { text: string } }) => setQuery(e.nativeEvent.text),
        onClose: () => setQuery(''),
      },
    });
  }, [navigation, title]);

  const data = useMemo<ListItem[]>(() => {
    const q = query.trim().toLowerCase();
    // Locked notes hide their content, so exclude them from text search.
    const filtered = q
      ? notes.filter(
          (n) => !n.isLocked && `${deriveTitle(n.content)}\n${n.content}`.toLowerCase().includes(q),
        )
      : notes;

    const pinned = filtered.filter((n) => n.isPinned);
    const others = filtered.filter((n) => !n.isPinned);
    const items: ListItem[] = [];

    if (pinned.length > 0) {
      items.push({ type: 'header', title: 'Pinned' });
      pinned.forEach((note) => items.push({ type: 'note', note }));
    }

    // Group the rest by day: Today, Yesterday, then the date.
    let lastLabel = '';
    for (const note of others) {
      const label = dateGroupLabel(note.updatedAt);
      if (label !== lastLabel) {
        items.push({ type: 'header', title: label });
        lastLabel = label;
      }
      items.push({ type: 'note', note });
    }
    return items;
  }, [notes, query]);

  const openNote = (note: Note) => router.push({ pathname: '/note/[id]', params: { id: note.id } });

  const handleCreate = async () => {
    hapticLight();
    const note = await createNote({ folderId: folderId === ALL_NOTES_FOLDER ? null : folderId });
    router.push({ pathname: '/note/[id]', params: { id: note.id } });
  };

  const [menuNote, setMenuNote] = useState<Note | null>(null);

  const handleLongPress = (note: Note) => {
    hapticSelection();
    setMenuNote(note);
  };

  const menuActions = (): SheetAction[] => {
    const note = menuNote;
    if (!note) return [];
    return [
      {
        label: note.isPinned ? 'Unpin' : 'Pin',
        icon: 'pin',
        onPress: () => {
          hapticLight();
          void setPinned(note.id, !note.isPinned);
        },
      },
      {
        label: note.isLocked ? 'Remove Lock' : 'Lock Note',
        icon: note.isLocked ? 'lock-open' : 'lock',
        onPress: () => {
          if (note.isLocked) {
            void authenticate('Remove lock from this note').then((ok) => {
              if (ok) void setLocked(note.id, false);
            });
          } else {
            void setLocked(note.id, true);
          }
        },
      },
      {
        label: 'Move to Folder…',
        icon: 'folder-input',
        onPress: () => router.push({ pathname: '/move/[id]', params: { id: note.id } }),
      },
      {
        label: 'Delete',
        icon: 'trash',
        destructive: true,
        onPress: () => {
          hapticWarning();
          void deleteNote(note.id);
        },
      },
    ];
  };

  return (
    <ThemedView style={styles.container}>
      <OfflineBanner />
      <FlatList
        data={data}
        keyExtractor={(item) => (item.type === 'header' ? `h-${item.title}` : item.note.id)}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentInsetAdjustmentBehavior="automatic"
        removeClippedSubviews={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 96 }}
        renderItem={({ item, index }) =>
          item.type === 'header' ? (
            <ThemedText style={styles.sectionHeader}>{item.title}</ThemedText>
          ) : (
            <NoteRow
              note={item.note}
              onPress={openNote}
              onLongPress={handleLongPress}
              topDivider={index > 0 && data[index - 1]?.type === 'note'}
              roundTop={index === 0 || data[index - 1]?.type === 'header'}
              roundBottom={index === data.length - 1 || data[index + 1]?.type === 'header'}
            />
          )
        }
        ListEmptyComponent={
          loading ? null : query.trim().length > 0 ? (
            <View style={styles.empty}>
              <ThemedText type="subtitle" style={styles.emptyText}>
                No Matches
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.emptyText}>
                No notes match “{query.trim()}”.
              </ThemedText>
            </View>
          ) : (
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

      {!isSmart && (
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
      )}

      <ActionSheet
        visible={menuNote !== null}
        title={
          menuNote?.isLocked ? 'Locked Note' : deriveTitle(menuNote?.content ?? '') || 'New Note'
        }
        actions={menuActions()}
        onClose={() => setMenuNote(null)}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  sectionHeader: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '700',
    paddingLeft: Spacing.three + Spacing.two,
    paddingRight: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.two,
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
