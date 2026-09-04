import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { createFolder, getFolder, renameFolder } from '@/database/foldersRepository';
import { useTheme } from '@/hooks/use-theme';

export default function FolderEditScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
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
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Insets keep the header clear of the status bar / notch on full-screen
            modals, and let content breathe in landscape. */}
        <View
          style={[
            styles.header,
            {
              paddingTop: Math.max(insets.top, Spacing.two),
              paddingLeft: Spacing.four + insets.left,
              paddingRight: Spacing.four + insets.right,
            },
          ]}>
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

        <View
          style={[
            styles.body,
            { paddingLeft: Spacing.three + insets.left, paddingRight: Spacing.three + insets.right },
          ]}>
          {/* maxWidth centers the field on tablets/large screens instead of
              stretching edge to edge. */}
          <View style={styles.field}>
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
        </View>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: Spacing.four,
  },
  title: { fontWeight: '600' },
  body: { paddingTop: Spacing.two, alignItems: 'center' },
  field: { width: '100%', maxWidth: 500 },
  input: {
    height: 44,
    borderRadius: 10,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
  },
});
