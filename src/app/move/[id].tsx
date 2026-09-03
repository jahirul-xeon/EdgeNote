import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ListRow } from '@/components/list-row';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { getFolders } from '@/database/foldersRepository';
import { getNote, moveNote } from '@/database/notesRepository';
import { useTheme } from '@/hooks/use-theme';
import type { FolderWithCount } from '@/types/folder';

export default function MoveNoteScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [folders, setFolders] = useState<FolderWithCount[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([getFolders(), id ? getNote(id) : Promise.resolve(null)]).then(([f, note]) => {
      if (!active) return;
      setFolders(f);
      setCurrentFolderId(note?.folderId ?? null);
    });
    return () => {
      active = false;
    };
  }, [id]);

  const choose = async (folderId: string | null) => {
    if (id) await moveNote(id, folderId);
    router.back();
  };

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <ThemedText type="default" style={styles.headerTitle}>
          Move Note to…
        </ThemedText>
        <Pressable onPress={() => router.back()} hitSlop={8} accessibilityRole="button">
          <ThemedText type="default" style={{ color: theme.accent }}>
            Cancel
          </ThemedText>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.group, { borderColor: theme.separator }]}>
          <ListRow
            icon="all-notes"
            label="All Notes"
            selected={currentFolderId === null}
            onPress={() => choose(null)}
          />
        </View>

        {folders.length > 0 && (
          <View style={[styles.group, { borderColor: theme.separator, marginTop: Spacing.four }]}>
            {folders.map((folder, index) => (
              <View key={folder.id}>
                {index > 0 && <View style={[styles.divider, { backgroundColor: theme.separator }]} />}
                <ListRow
                  icon="folder"
                  label={folder.name}
                  selected={currentFolderId === folder.id}
                  onPress={() => choose(folder.id)}
                />
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.four,
  },
  headerTitle: { fontWeight: '600' },
  content: { paddingTop: Spacing.two },
  group: { marginHorizontal: Spacing.three, borderRadius: 12, overflow: 'hidden' },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: Spacing.four + 26 + Spacing.three },
});
