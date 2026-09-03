import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts, Spacing } from '@/constants/theme';
import {
  deleteNote,
  permanentlyDeleteNote,
  setPinned,
  updateNote,
} from '@/database/notesRepository';
import { useNote } from '@/hooks/use-note';
import { useTheme } from '@/hooks/use-theme';
import { deriveTitle } from '@/utils/format';

const AUTOSAVE_DELAY = 400;

export default function NoteEditorScreen() {
  const theme = useTheme();
  const router = useRouter();
  const navigation = useNavigation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { note, loading } = useNote(id);

  const [text, setText] = useState('');
  const initialized = useRef(false);
  const latest = useRef('');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<TextInput>(null);
  const pinnedRef = useRef(false);

  // Seed the editor from the loaded note exactly once.
  useEffect(() => {
    if (note && !initialized.current) {
      initialized.current = true;
      setText(note.content);
      latest.current = note.content;
      pinnedRef.current = note.isPinned;
      // Focus straight into an empty (freshly created) note.
      if (note.content.length === 0) {
        requestAnimationFrame(() => inputRef.current?.focus());
      }
    }
  }, [note]);

  const persist = useCallback(async () => {
    if (!id || !initialized.current) return;
    const content = latest.current;
    if (content.trim().length === 0) {
      // Apple-style: a note left empty is discarded.
      await permanentlyDeleteNote(id);
      return;
    }
    await updateNote(id, { content, title: deriveTitle(content) });
  }, [id]);

  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      void persist();
    }, AUTOSAVE_DELAY);
  }, [persist]);

  const onChangeText = (value: string) => {
    setText(value);
    latest.current = value;
    scheduleSave();
  };

  // Flush on blur / navigating away (covers back gesture and screen unmount).
  useFocusEffect(
    useCallback(() => {
      return () => {
        if (saveTimer.current) {
          clearTimeout(saveTimer.current);
          saveTimer.current = null;
        }
        void persist();
      };
    }, [persist]),
  );

  const handleActions = useCallback(() => {
    if (!id) return;
    Alert.alert('Note', undefined, [
      {
        text: pinnedRef.current ? 'Unpin' : 'Pin',
        onPress: () => {
          pinnedRef.current = !pinnedRef.current;
          void setPinned(id, pinnedRef.current);
        },
      },
      {
        text: 'Move to Folder…',
        onPress: () => {
          void persist();
          router.push({ pathname: '/move/[id]', params: { id } });
        },
      },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          // Skip the empty-note flush; just move to trash and leave.
          if (saveTimer.current) clearTimeout(saveTimer.current);
          initialized.current = false;
          void deleteNote(id);
          router.back();
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [id, router, persist]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          onPress={handleActions}
          accessibilityRole="button"
          accessibilityLabel="Note actions"
          hitSlop={12}>
          <Icon name="more" size={24} color={theme.accent} />
        </Pressable>
      ),
    });
  }, [navigation, handleActions, theme.accent]);

  if (loading) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator color={theme.textSecondary} />
      </ThemedView>
    );
  }

  if (!note && initialized.current === false) {
    return (
      <ThemedView style={styles.center}>
        <ThemedText type="small" themeColor="textSecondary">
          This note could not be found.
        </ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <TextInput
          ref={inputRef}
          value={text}
          onChangeText={onChangeText}
          multiline
          placeholder="Start writing…"
          placeholderTextColor={theme.textSecondary}
          style={[styles.input, { color: theme.text }]}
          textAlignVertical="top"
          scrollEnabled
          autoCorrect
          keyboardAppearance={theme.background === '#000000' ? 'dark' : 'light'}
        />
      </KeyboardAvoidingView>
      <View />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    fontFamily: Fonts?.sans,
    fontSize: 17,
    lineHeight: 24,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
  },
});
