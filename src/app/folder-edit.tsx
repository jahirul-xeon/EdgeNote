import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { createFolder, getFolder, renameFolder } from '@/database/foldersRepository';
import { useTheme } from '@/hooks/use-theme';

export default function FolderEditScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isRename = Boolean(id);
  const [name, setName] = useState('');
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    let active = true;
    if (id) {
      getFolder(id).then((folder) => {
        if (active && folder) setName(folder.name);
      });
    }
    return () => {
      active = false;
    };
  }, [id]);

  const canSave = name.trim().length > 0;

  const handleSave = async () => {
    if (!canSave) return;
    if (isRename && id) {
      await renameFolder(id, name);
    } else {
      await createFolder(name);
    }
    router.back();
  };

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8} accessibilityRole="button">
          <ThemedText type="default" style={{ color: theme.accent }}>
            Cancel
          </ThemedText>
        </Pressable>
        <ThemedText type="default" style={styles.title}>
          {isRename ? 'Rename Folder' : 'New Folder'}
        </ThemedText>
        <Pressable onPress={handleSave} hitSlop={8} disabled={!canSave} accessibilityRole="button">
          <ThemedText
            type="default"
            style={{ color: canSave ? theme.accent : theme.textSecondary, fontWeight: '600' }}>
            {isRename ? 'Save' : 'Done'}
          </ThemedText>
        </Pressable>
      </View>

      <View style={styles.body}>
        <TextInput
          ref={inputRef}
          value={name}
          onChangeText={setName}
          placeholder="Folder Name"
          placeholderTextColor={theme.textSecondary}
          style={[styles.input, { backgroundColor: theme.backgroundElement, color: theme.text }]}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={handleSave}
          maxLength={60}
        />
      </View>
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
  title: { fontWeight: '600' },
  body: { paddingHorizontal: Spacing.three, paddingTop: Spacing.two },
  input: {
    height: 44,
    borderRadius: 10,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
  },
});
