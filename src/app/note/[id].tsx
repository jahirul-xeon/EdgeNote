import { Image } from 'expo-image';
import {
  useFocusEffect,
  useLocalSearchParams,
  useNavigation,
  useRouter,
} from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type NativeSyntheticEvent,
  type TextInputKeyPressEventData,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassSurface } from '@/components/glass/glass-surface';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts, Spacing } from '@/constants/theme';
import { subscribeToChanges } from '@/database/changeBus';
import { deleteAttachment, getAttachmentsByNote } from '@/database/attachmentsRepository';
import {
  deleteNote,
  permanentlyDeleteNote,
  setPinned,
  updateNote,
} from '@/database/notesRepository';
import { useNote } from '@/hooks/use-note';
import { useTheme } from '@/hooks/use-theme';
import {
  deleteLocalFile,
  pickDocument,
  pickImageFromLibrary,
  takePhoto,
} from '@/services/attachments/attachmentService';
import type { Attachment } from '@/types/attachment';
import type { BlockType, ContentBlock } from '@/types/blocks';
import { isTextBlock } from '@/types/blocks';
import { resolvePublicUrl } from '@/services/edgeflare/storage';
import { blocksToPlainText, createBlock, parseBlocks } from '@/utils/blocks';
import { deriveTitle } from '@/utils/format';
import { hapticLight, hapticSelection, hapticWarning } from '@/utils/haptics';

const AUTOSAVE_DELAY = 400;

export default function NoteEditorScreen() {
  const theme = useTheme();
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { note, loading } = useNote(id);

  const [blocks, setBlocks] = useState<ContentBlock[]>([]);
  const [attachments, setAttachments] = useState<Record<string, Attachment>>({});
  const initialized = useRef(false);
  const blocksRef = useRef<ContentBlock[]>([]);
  const inputs = useRef<Record<string, TextInput | null>>({});
  const focusedId = useRef<string | null>(null);
  const pendingFocus = useRef<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pinnedRef = useRef(false);

  blocksRef.current = blocks;

  // Seed blocks from the note once loaded; focus a fresh empty note.
  useEffect(() => {
    if (note && !initialized.current) {
      initialized.current = true;
      const initial = parseBlocks(note.blocksJson, note.content);
      setBlocks(initial);
      pinnedRef.current = note.isPinned;
      if (note.content.length === 0 && initial.length === 1) {
        pendingFocus.current = initial[0].id;
      }
    }
  }, [note]);

  // Keep attachment metadata fresh (upload status, remote URLs).
  useEffect(() => {
    if (!id) return;
    let active = true;
    const load = () => {
      getAttachmentsByNote(id).then((list) => {
        if (!active) return;
        const map: Record<string, Attachment> = {};
        for (const a of list) map[a.id] = a;
        setAttachments(map);
      });
    };
    load();
    const unsub = subscribeToChanges(load);
    return () => {
      active = false;
      unsub();
    };
  }, [id]);

  // Focus a newly inserted block after render.
  useEffect(() => {
    if (pendingFocus.current) {
      const target = pendingFocus.current;
      pendingFocus.current = null;
      requestAnimationFrame(() => inputs.current[target]?.focus());
    }
  }, [blocks]);

  const persist = useCallback(async () => {
    if (!id || !initialized.current) return;
    const current = blocksRef.current;
    const content = blocksToPlainText(current);
    const hasMedia = current.some((b) => b.type === 'image' || b.type === 'file');
    if (content.trim().length === 0 && !hasMedia) {
      await permanentlyDeleteNote(id);
      return;
    }
    await updateNote(id, { blocks: current, content, title: deriveTitle(content) });
  }, [id]);

  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      void persist();
    }, AUTOSAVE_DELAY);
  }, [persist]);

  const mutate = useCallback(
    (next: ContentBlock[]) => {
      setBlocks(next);
      blocksRef.current = next;
      scheduleSave();
    },
    [scheduleSave],
  );

  // --- Block operations ----------------------------------------------------

  const setText = (blockId: string, text: string) => {
    mutate(
      blocksRef.current.map((b) => (b.id === blockId && isTextBlock(b) ? { ...b, text } : b)),
    );
  };

  const toggleCheck = (blockId: string) => {
    hapticSelection();
    mutate(
      blocksRef.current.map((b) =>
        b.id === blockId && b.type === 'checklist' ? { ...b, checked: !b.checked } : b,
      ),
    );
  };

  const insertAfterFocused = (block: ContentBlock) => {
    const current = blocksRef.current;
    const focusIndex = current.findIndex((b) => b.id === focusedId.current);
    const index = focusIndex >= 0 ? focusIndex + 1 : current.length;
    const next = [...current.slice(0, index), block, ...current.slice(index)];
    if (isTextBlock(block)) pendingFocus.current = block.id;
    mutate(next);
  };

  /** Toolbar list/heading action: convert an empty focused paragraph, else insert. */
  const addTextBlock = (type: BlockType) => {
    const current = blocksRef.current;
    const focused = current.find((b) => b.id === focusedId.current);
    if (focused && focused.type === 'paragraph' && focused.text.length === 0) {
      mutate(
        current.map((b) =>
          b.id === focused.id
            ? type === 'checklist'
              ? { id: b.id, type, text: '', checked: false }
              : { id: b.id, type: type as 'heading' | 'bullet', text: '' }
            : b,
        ),
      );
      pendingFocus.current = focused.id;
      requestAnimationFrame(() => inputs.current[focused.id]?.focus());
    } else {
      insertAfterFocused(createBlock(type));
    }
  };

  const handleReturn = (blockId: string) => {
    const current = blocksRef.current;
    const block = current.find((b) => b.id === blockId);
    if (!block || !isTextBlock(block)) return;
    // Empty list item on return exits the list (becomes a paragraph).
    if ((block.type === 'checklist' || block.type === 'bullet') && block.text.length === 0) {
      mutate(current.map((b) => (b.id === blockId ? { id: b.id, type: 'paragraph', text: '' } : b)));
      return;
    }
    const newType: BlockType = block.type === 'heading' ? 'paragraph' : block.type;
    insertAfterFocused(createBlock(newType));
  };

  const handleBackspace = (
    blockId: string,
    event: NativeSyntheticEvent<TextInputKeyPressEventData>,
  ) => {
    if (event.nativeEvent.key !== 'Backspace') return;
    const current = blocksRef.current;
    const index = current.findIndex((b) => b.id === blockId);
    const block = current[index];
    if (!block || !isTextBlock(block) || block.text.length > 0) return;
    if (current.length === 1) return; // keep at least one block
    const prev = current[index - 1];
    const next = current.filter((b) => b.id !== blockId);
    mutate(next);
    if (prev && isTextBlock(prev)) {
      requestAnimationFrame(() => inputs.current[prev.id]?.focus());
    }
  };

  const removeMediaBlock = (block: ContentBlock) => {
    if (block.type !== 'image' && block.type !== 'file') return;
    const attachment = attachments[block.attachmentId];
    mutate(blocksRef.current.filter((b) => b.id !== block.id));
    if (attachment) {
      deleteLocalFile(attachment.localUri);
      void deleteAttachment(attachment.id);
    }
  };

  // --- Attachments ---------------------------------------------------------

  const addAttachment = async (kind: 'library' | 'camera' | 'file') => {
    if (!id) return;
    try {
      const attachment =
        kind === 'library'
          ? await pickImageFromLibrary(id)
          : kind === 'camera'
            ? await takePhoto(id)
            : await pickDocument(id);
      if (!attachment) return;
      const blockType: BlockType = attachment.type === 'image' ? 'image' : 'file';
      insertAfterFocused(createBlock(blockType, attachment.id));
    } catch (e) {
      console.log('[attach] addAttachment failed:', e);
      Alert.alert('Attachment failed', e instanceof Error ? e.message : String(e));
    }
  };

  // --- Lifecycle -----------------------------------------------------------

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
          hapticLight();
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
          if (saveTimer.current) clearTimeout(saveTimer.current);
          initialized.current = false;
          hapticWarning();
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
        <Pressable onPress={handleActions} accessibilityLabel="Note actions" hitSlop={12}>
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

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}>
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive">
          {blocks.map((block) => (
            <BlockView
              key={block.id}
              block={block}
              attachment={
                block.type === 'image' || block.type === 'file'
                  ? attachments[block.attachmentId]
                  : undefined
              }
              theme={theme}
              registerRef={(ref) => {
                inputs.current[block.id] = ref;
              }}
              onFocus={() => {
                focusedId.current = block.id;
              }}
              onChangeText={(text) => setText(block.id, text)}
              onSubmit={() => handleReturn(block.id)}
              onKeyPress={(e) => handleBackspace(block.id, e)}
              onToggle={() => toggleCheck(block.id)}
              onRemoveMedia={() => removeMediaBlock(block)}
            />
          ))}
        </ScrollView>

        <GlassSurface style={styles.toolbar}>
          <ToolbarButton icon="checkbox" label="Checklist" onPress={() => addTextBlock('checklist')} theme={theme} />
          <ToolbarButton icon="heading" label="Heading" onPress={() => addTextBlock('heading')} theme={theme} />
          <ToolbarButton icon="bullet-list" label="List" onPress={() => addTextBlock('bullet')} theme={theme} />
          <ToolbarButton icon="image" label="Photo" onPress={() => addAttachment('library')} theme={theme} />
          <ToolbarButton icon="camera" label="Camera" onPress={() => addAttachment('camera')} theme={theme} />
          <ToolbarButton icon="attach" label="File" onPress={() => addAttachment('file')} theme={theme} />
        </GlassSurface>
        <View style={{ height: insets.bottom }} />
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

// --- Sub-components ---------------------------------------------------------

type ThemeColors = ReturnType<typeof useTheme>;

function ToolbarButton({
  icon,
  label,
  onPress,
  theme,
}: {
  icon: Parameters<typeof Icon>[0]['name'];
  label: string;
  onPress: () => void;
  theme: ThemeColors;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.toolbarBtn, { opacity: pressed ? 0.5 : 1 }]}>
      <Icon name={icon} size={22} color={theme.text} />
    </Pressable>
  );
}

function BlockView({
  block,
  attachment,
  theme,
  registerRef,
  onFocus,
  onChangeText,
  onSubmit,
  onKeyPress,
  onToggle,
  onRemoveMedia,
}: {
  block: ContentBlock;
  attachment?: Attachment;
  theme: ThemeColors;
  registerRef: (ref: TextInput | null) => void;
  onFocus: () => void;
  onChangeText: (text: string) => void;
  onSubmit: () => void;
  onKeyPress: (e: NativeSyntheticEvent<TextInputKeyPressEventData>) => void;
  onToggle: () => void;
  onRemoveMedia: () => void;
}) {
  if (block.type === 'image') {
    const uri = attachment?.localUri ?? resolvePublicUrl(attachment?.remoteUrl) ?? undefined;
    const ratio = attachment?.width && attachment?.height ? attachment.width / attachment.height : 4 / 3;
    return (
      <Pressable onLongPress={onRemoveMedia} style={styles.mediaWrap}>
        {uri ? (
          <Image source={{ uri }} style={[styles.image, { aspectRatio: ratio }]} contentFit="cover" />
        ) : (
          <View style={[styles.image, styles.imageFallback, { backgroundColor: theme.backgroundElement }]}>
            <Icon name="image" size={28} color={theme.textSecondary} />
          </View>
        )}
        {attachment?.uploadStatus === 'uploading' && (
          <View style={styles.badge}>
            <ActivityIndicator size="small" color="#fff" />
          </View>
        )}
        {attachment?.uploadStatus === 'failed' && (
          <View style={[styles.badge, { backgroundColor: theme.danger }]}>
            <Icon name="error" size={14} color="#fff" />
          </View>
        )}
      </Pressable>
    );
  }

  if (block.type === 'file') {
    return (
      <Pressable
        onLongPress={onRemoveMedia}
        style={[styles.fileChip, { backgroundColor: theme.backgroundElement }]}>
        <Icon name="attach" size={18} color={theme.accent} />
        <ThemedText type="small" numberOfLines={1} style={styles.fileName}>
          {attachment?.name ?? 'Attachment'}
        </ThemedText>
      </Pressable>
    );
  }

  const isChecklist = block.type === 'checklist';
  const isBullet = block.type === 'bullet';
  const isHeading = block.type === 'heading';
  const multiline = block.type === 'paragraph';
  const checked = block.type === 'checklist' && block.checked;

  return (
    <View style={styles.blockRow}>
      {isChecklist && (
        <Pressable onPress={onToggle} hitSlop={8} style={styles.checkbox} accessibilityRole="checkbox">
          <Icon
            name={checked ? 'checkbox-checked' : 'checkbox'}
            size={20}
            color={checked ? theme.accent : theme.textSecondary}
          />
        </Pressable>
      )}
      {isBullet && <ThemedText style={[styles.bullet, { color: theme.text }]}>•</ThemedText>}
      <TextInput
        ref={registerRef}
        value={block.text}
        onChangeText={onChangeText}
        onFocus={onFocus}
        onKeyPress={onKeyPress}
        onSubmitEditing={multiline ? undefined : onSubmit}
        blurOnSubmit={false}
        multiline={multiline}
        placeholder={isHeading ? 'Heading' : ''}
        placeholderTextColor={theme.textSecondary}
        style={[
          styles.input,
          isHeading && styles.heading,
          { color: checked ? theme.textSecondary : theme.text },
          checked && styles.checkedText,
        ]}
        returnKeyType={multiline ? 'default' : 'next'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: Spacing.four, paddingBottom: Spacing.six, gap: Spacing.one },
  blockRow: { flexDirection: 'row', alignItems: 'flex-start' },
  checkbox: { paddingTop: 3, paddingRight: Spacing.two },
  bullet: { fontSize: 17, lineHeight: 26, paddingRight: Spacing.two },
  input: {
    flex: 1,
    fontFamily: Fonts?.sans,
    fontSize: 17,
    lineHeight: 25,
    padding: 0,
  },
  heading: { fontSize: 22, lineHeight: 30, fontWeight: '700' },
  checkedText: { textDecorationLine: 'line-through' },
  mediaWrap: { marginVertical: Spacing.two },
  image: { width: '100%', borderRadius: 12, maxHeight: 360 },
  imageFallback: { aspectRatio: 4 / 3, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    top: Spacing.two,
    right: Spacing.two,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: 10,
    marginVertical: Spacing.two,
  },
  fileName: { flex: 1 },
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two,
  },
  toolbarBtn: { padding: Spacing.three, minWidth: 44, alignItems: 'center' },
});
