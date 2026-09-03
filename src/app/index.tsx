import { useRouter } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassSurface } from '@/components/glass/glass-surface';
import { Icon } from '@/components/icon';
import { ListRow } from '@/components/list-row';
import { OfflineBanner } from '@/components/offline-banner';
import { SearchField } from '@/components/search-field';
import { SyncStatusLine } from '@/components/sync-status-line';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { deleteFolder } from '@/database/foldersRepository';
import { ALL_NOTES_FOLDER, createNote } from '@/database/notesRepository';
import { useFolders } from '@/hooks/use-folders';
import { useTheme } from '@/hooks/use-theme';
import type { FolderWithCount } from '@/types/folder';
import { hapticLight, hapticWarning } from '@/utils/haptics';

export default function FoldersHomeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { folders, allNotesCount, trashCount } = useFolders();

  const handleNewNote = async () => {
    hapticLight();
    const note = await createNote();
    router.push({ pathname: '/note/[id]', params: { id: note.id } });
  };

  const handleFolderLongPress = (folder: FolderWithCount) => {
    Alert.alert(folder.name, undefined, [
      {
        text: 'Rename',
        onPress: () => router.push({ pathname: '/folder-edit', params: { id: folder.id } }),
      },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          Alert.alert(`Delete "${folder.name}"?`, 'Notes in this folder will be moved to All Notes.', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete Folder',
              style: 'destructive',
              onPress: () => {
                hapticWarning();
                void deleteFolder(folder.id);
              },
            },
          ]),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <ThemedView style={styles.container}>
      <OfflineBanner />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + Spacing.two, paddingBottom: insets.bottom + 88 },
        ]}>
        <View style={styles.titleRow}>
          <ThemedText type="title">Folders</ThemedText>
          <Pressable
            onPress={() => router.push('/settings')}
            accessibilityRole="button"
            accessibilityLabel="Settings"
            hitSlop={10}
            style={({ pressed }) => [styles.gear, { opacity: pressed ? 0.5 : 1 }]}>
            <Icon name="settings" size={24} color={theme.accent} />
          </Pressable>
        </View>

        <SyncStatusLine />

        <View style={styles.searchWrap}>
          <SearchField onPress={() => router.push('/search')} />
        </View>

        <View style={styles.group}>
          <ListRow
            icon="all-notes"
            label="All Notes"
            count={allNotesCount}
            onPress={() => router.push({ pathname: '/folder/[id]', params: { id: ALL_NOTES_FOLDER } })}
          />
        </View>

        {folders.length > 0 && (
          <>
            <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionHeader}>
              MY FOLDERS
            </ThemedText>
            <View style={styles.group}>
              {folders.map((folder, index) => (
                <View key={folder.id}>
                  {index > 0 && <View style={[styles.divider, { backgroundColor: theme.separator }]} />}
                  <ListRow
                    icon="folder"
                    label={folder.name}
                    count={folder.noteCount}
                    onPress={() => router.push({ pathname: '/folder/[id]', params: { id: folder.id } })}
                    onLongPress={() => handleFolderLongPress(folder)}
                  />
                </View>
              ))}
            </View>
          </>
        )}

        <View style={styles.spacer} />
        <View style={styles.group}>
          <ListRow
            icon="trash"
            iconColor={theme.textSecondary}
            label="Recently Deleted"
            count={trashCount}
            onPress={() => router.push('/trash')}
          />
        </View>
      </ScrollView>

      <GlassSurface style={[styles.toolbar, { paddingBottom: insets.bottom + Spacing.two }]}>
        <Pressable
          onPress={() => router.push({ pathname: '/folder-edit' })}
          accessibilityRole="button"
          accessibilityLabel="New folder"
          hitSlop={8}
          style={({ pressed }) => [styles.toolbarBtn, { opacity: pressed ? 0.6 : 1 }]}>
          <Icon name="folder-plus" size={20} color={theme.accent} />
          <ThemedText type="default" style={{ color: theme.accent }}>
            New Folder
          </ThemedText>
        </Pressable>
        <Pressable
          onPress={handleNewNote}
          accessibilityRole="button"
          accessibilityLabel="New note"
          hitSlop={8}
          style={({ pressed }) => [styles.toolbarBtn, { opacity: pressed ? 0.6 : 1 }]}>
          <Icon name="compose" size={20} color={theme.accent} />
          <ThemedText style={[styles.compose, { color: theme.accent }]}>New Note</ThemedText>
        </Pressable>
      </GlassSurface>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flexGrow: 1 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.two,
  },
  gear: { padding: Spacing.one },
  searchWrap: { marginTop: Spacing.two, marginBottom: Spacing.four },
  sectionHeader: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.one,
    letterSpacing: 0.5,
  },
  group: { marginHorizontal: Spacing.three, borderRadius: 12, overflow: 'hidden' },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: Spacing.four + 26 + Spacing.three },
  spacer: { height: Spacing.four },
  toolbar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
  },
  toolbarBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, minHeight: 44 },
  compose: { fontWeight: '600' },
});
