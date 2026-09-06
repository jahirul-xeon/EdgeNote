import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { Image } from 'expo-image';
import {
  useFocusEffect,
  useLocalSearchParams,
  useNavigation,
  useRouter,
} from 'expo-router';
import { openBrowserAsync, WebBrowserPresentationStyle } from 'expo-web-browser';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type NativeSyntheticEvent,
  type TextInputKeyPressEventData,
  type TextInputSelectionChangeEventData,
} from 'react-native';
import {
  KeyboardAwareScrollView,
  KeyboardStickyView,
} from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionSheet, type SheetAction } from '@/components/action-sheet';
import { GlassSurface } from '@/components/glass/glass-surface';
import { Icon } from '@/components/icon';
import { AudioPlayer } from '@/components/audio-player';
import { LinkPreviewCard } from '@/components/notes/link-preview';
import { ImageViewerModal } from '@/components/media-viewer';
import { Skeleton } from '@/components/skeleton';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts, Spacing } from '@/constants/theme';
import { subscribeToChanges } from '@/database/changeBus';
import { deleteAttachment, getAttachmentsByNote } from '@/database/attachmentsRepository';
import {
  deleteNote,
  permanentlyDeleteNote,
  setLocked,
  setPinned,
  updateNote,
} from '@/database/notesRepository';
import { authenticate } from '@/services/security/biometrics';
import { useNote } from '@/hooks/use-note';
import { useTheme } from '@/hooks/use-theme';
import {
  deleteLocalFile,
  openAttachmentExternally,
  pickDocument,
  pickImageFromLibrary,
  saveAttachmentToDevice,
  saveImportedAttachment,
  shareAttachment,
  takePhoto,
} from '@/services/attachments/attachmentService';
import { exportNote, type ExportFormat } from '@/services/notes/importExport';
import type { Attachment } from '@/types/attachment';
import type { BlockType, ContentBlock } from '@/types/blocks';
import { isTextBlock } from '@/types/blocks';
import { resolvePublicUrl } from '@/services/edgeflare/storage';
import { fetchLinkMetadata, isUrl, splitTrailingUrl } from '@/services/links/linkPreview';
import { blocksToPlainText, createBlock, createLinkBlock, parseBlocks } from '@/utils/blocks';
import { deriveTitle } from '@/utils/format';
import { hapticLight, hapticSelection, hapticSuccess, hapticWarning } from '@/utils/haptics';

const AUTOSAVE_DELAY = 400;
// Edits within this window fold into one undo step (so typing a word is one undo).
const HISTORY_COALESCE_DELAY = 500;
const HISTORY_LIMIT = 100;

/** Short type label for a file chip, e.g. "pdf". */
function extensionLabel(name?: string | null, mimeType?: string | null): string | null {
  const fromName = name?.split('.').pop()?.toLowerCase();
  if (fromName && fromName.length <= 5 && /^[a-z0-9]+$/.test(fromName)) return fromName;
  const fromMime = mimeType?.split('/').pop()?.toLowerCase();
  if (fromMime && fromMime.length <= 5 && /^[a-z0-9]+$/.test(fromMime)) return fromMime;
  return null;
}

type TextBlock = Extract<ContentBlock, { text: string }>;

/**
 * Picks the text block to place the caret in after an undo/redo: the first one
 * whose text differs between the two snapshots, else the last text block.
 */
function pickHistoryFocus(from: ContentBlock[], to: ContentBlock[]): TextBlock | null {
  const fromMap = new Map(from.map((b) => [b.id, b]));
  for (const b of to) {
    if (!isTextBlock(b)) continue;
    const prev = fromMap.get(b.id);
    if (!prev || !isTextBlock(prev) || prev.text !== b.text) return b;
  }
  for (let i = to.length - 1; i >= 0; i -= 1) {
    const b = to[i];
    if (isTextBlock(b)) return b;
  }
  return null;
}

/** Millisecond duration as m:ss. */
function formatDuration(ms: number): string {
  const s = Math.floor((ms || 0) / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Human-readable byte size, e.g. "1.4 MB". */
function formatBytes(size?: number | null): string | null {
  if (!size || size <= 0) return null;
  const units = ['B', 'KB', 'MB', 'GB'];
  let n = size;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n < 10 && i > 0 ? n.toFixed(1) : Math.round(n)} ${units[i]}`;
}

export default function NoteEditorScreen() {
  const theme = useTheme();
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { note, loading } = useNote(id);

  const [blocks, setBlocks] = useState<ContentBlock[]>([]);
  const [attachments, setAttachments] = useState<Record<string, Attachment>>({});
  const [viewerUri, setViewerUri] = useState<string | null>(null);
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set());
  const [mediaMenu, setMediaMenu] = useState<ContentBlock | null>(null);
  const [linkMenu, setLinkMenu] = useState<ContentBlock | null>(null);
  const [noteMenu, setNoteMenu] = useState(false);
  const [exportMenu, setExportMenu] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const unlockedRef = useRef(false);
  const lockedRef = useRef(false);
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(audioRecorder);
  const [recording, setRecording] = useState(false);
  const initialized = useRef(false);
  const blocksRef = useRef<ContentBlock[]>([]);
  const inputs = useRef<Record<string, TextInput | null>>({});
  const focusedId = useRef<string | null>(null);
  // Caret position within the focused input, so backspace can tell whether the
  // cursor sits at the very start of a line.
  const selectionRef = useRef<{ start: number; end: number }>({ start: 0, end: 0 });
  // Link blocks we've already tried to fetch metadata for (one attempt each).
  const linkFetched = useRef<Set<string>>(new Set());
  const pendingFocus = useRef<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pinnedRef = useRef(false);
  // True only after a real edit. Prevents merely opening a note from bumping
  // its updatedAt (and triggering a needless sync push).
  const dirtyRef = useRef(false);

  // Undo/redo history. Rapid edits (e.g. typing) coalesce into a single step
  // via a short debounce so undo doesn't rewind one keystroke at a time.
  const history = useRef<ContentBlock[][]>([]);
  const historyIndex = useRef(0);
  const historyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  blocksRef.current = blocks;

  // Seed blocks from the note once loaded — but never load a locked note's
  // content into memory until it has been unlocked this session.
  useEffect(() => {
    if (note && !initialized.current && (!note.isLocked || unlocked)) {
      initialized.current = true;
      const initial = parseBlocks(note.blocksJson, note.content);
      setBlocks(initial);
      history.current = [initial];
      historyIndex.current = 0;
      pinnedRef.current = note.isPinned;
      if (note.content.length === 0 && initial.length === 1) {
        pendingFocus.current = initial[0].id;
      }
    }
  }, [note, unlocked]);

  // Gate a locked note behind device auth; keep a ref mirror for persist().
  lockedRef.current = (note?.isLocked ?? false) && !unlocked;
  const tryUnlock = useCallback(async () => {
    const ok = await authenticate('Unlock this note');
    if (ok) {
      unlockedRef.current = true;
      setUnlocked(true);
    }
    return ok;
  }, []);
  useEffect(() => {
    if (note?.isLocked && !unlockedRef.current) {
      void tryUnlock();
    }
  }, [note?.id, note?.isLocked, tryUnlock]);

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
    // A locked note that hasn't been unlocked has no loaded content — never
    // write (or empty-delete) it.
    if (lockedRef.current) return;
    const current = blocksRef.current;
    const content = blocksToPlainText(current);
    const hasMedia = current.some(
      (b) => b.type === 'image' || b.type === 'file' || b.type === 'link',
    );
    if (content.trim().length === 0 && !hasMedia) {
      await permanentlyDeleteNote(id);
      return;
    }
    // Nothing was edited — don't rewrite the row (which would bump updatedAt).
    if (!dirtyRef.current) return;
    await updateNote(id, { blocks: current, content, title: deriveTitle(content) });
    dirtyRef.current = false;
  }, [id]);

  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      void persist();
    }, AUTOSAVE_DELAY);
  }, [persist]);

  // Snapshot the latest blocks as a new undo step, dropping any redo tail.
  const commitHistory = useCallback(() => {
    historyTimer.current = null;
    const snap = blocksRef.current;
    if (history.current[historyIndex.current] === snap) return;
    const kept = history.current.slice(0, historyIndex.current + 1);
    kept.push(snap);
    if (kept.length > HISTORY_LIMIT) kept.shift();
    history.current = kept;
    historyIndex.current = kept.length - 1;
    setCanUndo(historyIndex.current > 0);
    setCanRedo(false);
  }, []);

  const scheduleHistory = useCallback(() => {
    if (historyTimer.current) clearTimeout(historyTimer.current);
    historyTimer.current = setTimeout(commitHistory, HISTORY_COALESCE_DELAY);
  }, [commitHistory]);

  const mutate = useCallback(
    (next: ContentBlock[]) => {
      dirtyRef.current = true;
      setBlocks(next);
      blocksRef.current = next;
      scheduleSave();
      scheduleHistory();
    },
    [scheduleSave, scheduleHistory],
  );

  // Move through the undo/redo stack. Flushes any pending edit first so the
  // in-progress change becomes its own step before we step back from it.
  const applyHistory = useCallback(
    (direction: -1 | 1) => {
      if (historyTimer.current) {
        clearTimeout(historyTimer.current);
        commitHistory();
      }
      const target = historyIndex.current + direction;
      if (target < 0 || target >= history.current.length) return;
      const from = blocksRef.current;
      historyIndex.current = target;
      const snap = history.current[target];
      dirtyRef.current = true;
      setBlocks(snap);
      blocksRef.current = snap;
      scheduleSave();
      setCanUndo(target > 0);
      setCanRedo(target < history.current.length - 1);
      hapticSelection();
      // Move the caret to the block this step changed so typing continues there.
      const focusBlock = pickHistoryFocus(from, snap);
      if (focusBlock) {
        focusedId.current = focusBlock.id;
        const end = focusBlock.text.length;
        requestAnimationFrame(() => {
          const input = inputs.current[focusBlock.id];
          input?.focus();
          input?.setSelection?.(end, end);
        });
      }
    },
    [commitHistory, scheduleSave],
  );

  const undo = useCallback(() => applyHistory(-1), [applyHistory]);
  const redo = useCallback(() => applyHistory(1), [applyHistory]);

  // --- Block operations ----------------------------------------------------

  const setText = (blockId: string, text: string) => {
    const prev = blocksRef.current.find((b) => b.id === blockId);
    const prevLen = prev && isTextBlock(prev) ? prev.text.length : 0;
    mutate(
      blocksRef.current.map((b) => (b.id === blockId && isTextBlock(b) ? { ...b, text } : b)),
    );
    // Paste detection: a URL that arrives in a single big insertion (not typed
    // one key at a time) becomes a link-preview block.
    if (text.length - prevLen > 1) {
      const trimmed = text.trim();
      const split = splitTrailingUrl(trimmed);
      if (isUrl(trimmed)) {
        insertLinkForPaste(blockId, '', trimmed);
      } else if (split) {
        insertLinkForPaste(blockId, split.lead, split.url);
      }
    }
  };

  // Fetches preview metadata for a link block once and stores it on the block.
  // Uses a light write (no undo step) so the async fill doesn't clutter history.
  const fillLinkMeta = useCallback(
    (blockId: string, url: string) => {
      if (linkFetched.current.has(blockId)) return;
      linkFetched.current.add(blockId);
      void fetchLinkMetadata(url).then((meta) => {
        if (!meta || (!meta.title && !meta.description && !meta.image)) return;
        const next = blocksRef.current.map((b) =>
          b.id === blockId && b.type === 'link' ? { ...b, ...meta } : b,
        );
        dirtyRef.current = true;
        blocksRef.current = next;
        setBlocks(next);
        scheduleSave();
      });
    },
    [scheduleSave],
  );

  /**
   * Replaces/splits the paragraph that received a pasted URL: any leading text
   * stays in the paragraph, a link block follows, and a trailing text block is
   * ensured so the caret has somewhere to land below the preview.
   */
  const insertLinkForPaste = (blockId: string, lead: string, url: string) => {
    const current = blocksRef.current;
    const idx = current.findIndex((b) => b.id === blockId);
    if (idx < 0) return;
    const link = createLinkBlock(url);
    let next: ContentBlock[];
    let linkIndex: number;
    if (lead.length === 0) {
      next = [...current.slice(0, idx), link, ...current.slice(idx + 1)];
      linkIndex = idx;
    } else {
      const para = current[idx];
      const updated = isTextBlock(para) ? { ...para, text: lead } : para;
      next = [...current.slice(0, idx), updated, link, ...current.slice(idx + 1)];
      linkIndex = idx + 1;
    }
    const following = next[linkIndex + 1];
    let focusId: string;
    if (following && isTextBlock(following)) {
      focusId = following.id;
    } else {
      const trailing = createBlock('paragraph');
      next = [...next.slice(0, linkIndex + 1), trailing, ...next.slice(linkIndex + 1)];
      focusId = trailing.id;
    }
    mutate(next);
    pendingFocus.current = focusId;
    requestAnimationFrame(() => inputs.current[focusId]?.focus());
    fillLinkMeta(link.id, url);
  };

  // Backfill previews for link blocks without metadata (notes opened later or
  // imported links). fillLinkMeta only fetches once per block.
  useEffect(() => {
    for (const b of blocks) {
      if (b.type === 'link' && !b.title && !b.description && !b.image) {
        fillLinkMeta(b.id, b.url);
      }
    }
  }, [blocks, fillLinkMeta]);

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

  /**
   * Inserts a media (image/file) block and guarantees a text block after it so
   * the user can keep typing below the attachment. Reuses an existing text
   * block if one already follows; otherwise appends a fresh empty paragraph.
   */
  const insertMediaBlock = (block: ContentBlock) => {
    const current = blocksRef.current;
    const focusIndex = current.findIndex((b) => b.id === focusedId.current);
    const index = focusIndex >= 0 ? focusIndex + 1 : current.length;
    const following = current[index];
    let next: ContentBlock[];
    let focusId: string;
    if (following && isTextBlock(following)) {
      next = [...current.slice(0, index), block, ...current.slice(index)];
      focusId = following.id;
    } else {
      const trailing = createBlock('paragraph');
      next = [...current.slice(0, index), block, trailing, ...current.slice(index)];
      focusId = trailing.id;
    }
    pendingFocus.current = focusId;
    mutate(next);
    requestAnimationFrame(() => inputs.current[focusId]?.focus());
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
    if (!block || !isTextBlock(block)) return;
    // Only act when the caret is at the very start of the line (nothing to the
    // left to delete), so we don't hijack normal character deletion.
    const sel = selectionRef.current;
    if (sel.start !== 0 || sel.end !== 0) return;
    if (current.length === 1) return; // keep at least one block
    const prev = current[index - 1];
    if (!prev) return;
    // Caret at line start, a media/link block directly above → remove it; the
    // caret stays on the current line.
    if (prev.type === 'image' || prev.type === 'file' || prev.type === 'link') {
      if (prev.type === 'image' || prev.type === 'file') {
        const attachment = attachments[prev.attachmentId];
        if (attachment) {
          deleteLocalFile(attachment.localUri);
          void deleteAttachment(attachment.id);
        }
      }
      mutate(current.filter((b) => b.id !== prev.id));
      requestAnimationFrame(() => inputs.current[blockId]?.focus());
      return;
    }
    // Two text lines: collapse only when the current line is empty (keeps the
    // old behavior; avoids surprising text merges mid-line).
    if (isTextBlock(prev) && block.text.length === 0) {
      const caret = prev.text.length;
      mutate(current.filter((b) => b.id !== blockId));
      requestAnimationFrame(() => {
        const input = inputs.current[prev.id];
        input?.focus();
        input?.setSelection?.(caret, caret);
      });
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

  // --- Links ---------------------------------------------------------------

  const showLinkActions = (block: ContentBlock) => {
    if (block.type !== 'link') return;
    hapticSelection();
    setLinkMenu(block);
  };

  const linkMenuActions = (): SheetAction[] => {
    if (!linkMenu || linkMenu.type !== 'link') return [];
    const block = linkMenu;
    return [
      {
        label: 'Open Link',
        icon: 'link',
        onPress: () =>
          void openBrowserAsync(block.url, {
            presentationStyle: WebBrowserPresentationStyle.AUTOMATIC,
          }).catch(() => {}),
      },
      {
        label: 'Remove',
        icon: 'trash',
        destructive: true,
        onPress: () => mutate(blocksRef.current.filter((b) => b.id !== block.id)),
      },
    ];
  };

  // --- Attachments ---------------------------------------------------------

  // --- Attachment viewing --------------------------------------------------

  // Marks an attachment as "pulling" for the duration of an async op so the
  // block can show a loader/skeleton (e.g. while downloading the cloud copy).
  const withDownloading = async (attId: string, fn: () => Promise<void>) => {
    setDownloadingIds((prev) => new Set(prev).add(attId));
    try {
      await fn();
    } finally {
      setDownloadingIds((prev) => {
        const next = new Set(prev);
        next.delete(attId);
        return next;
      });
    }
  };

  const openMedia = (block: ContentBlock) => {
    if (block.type !== 'image' && block.type !== 'file') return;
    const att = attachments[block.attachmentId];
    if (!att) return;
    if (block.type === 'image') {
      const uri = att.localUri ?? resolvePublicUrl(att.remoteUrl);
      if (uri) setViewerUri(uri);
      return;
    }
    void openFile(att);
  };

  const openFile = async (att: Attachment) => {
    // Open the LOCAL file in a viewer app (ACTION_VIEW). Works offline; if the
    // device only has the cloud copy it is downloaded first.
    try {
      await withDownloading(att.id, () => openAttachmentExternally(att));
    } catch (e) {
      Alert.alert('Cannot open file', e instanceof Error ? e.message : String(e));
    }
  };

  // Long-press an attachment → open the Share / Download / Remove sheet.
  const showMediaActions = (block: ContentBlock) => {
    if (block.type !== 'image' && block.type !== 'file') return;
    if (!attachments[block.attachmentId]) return;
    hapticSelection();
    setMediaMenu(block);
  };

  const mediaMenuActions = (): SheetAction[] => {
    if (!mediaMenu || (mediaMenu.type !== 'image' && mediaMenu.type !== 'file')) return [];
    const block = mediaMenu;
    const att = attachments[block.attachmentId];
    if (!att) return [];
    return [
      {
        label: 'Share',
        icon: 'share',
        onPress: () =>
          void withDownloading(att.id, () => shareAttachment(att)).catch((e) =>
            Alert.alert('Cannot share', e instanceof Error ? e.message : String(e)),
          ),
      },
      {
        label: 'Download',
        icon: 'download',
        onPress: () =>
          void withDownloading(att.id, () => saveAttachmentToDevice(att))
            .then(() => hapticSuccess())
            .catch((e) =>
              Alert.alert('Download failed', e instanceof Error ? e.message : String(e)),
            ),
      },
      { label: 'Remove', icon: 'trash', destructive: true, onPress: () => removeMediaBlock(block) },
    ];
  };

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
      insertMediaBlock(createBlock(blockType, attachment.id));
    } catch (e) {
      console.log('[attach] addAttachment failed:', e);
      Alert.alert('Attachment failed', e instanceof Error ? e.message : String(e));
    }
  };

  // --- Audio notes ---------------------------------------------------------

  const startRecording = async () => {
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Microphone needed', 'Allow microphone access to record audio notes.');
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
      hapticLight();
      setRecording(true);
    } catch (e) {
      Alert.alert('Recording failed', e instanceof Error ? e.message : String(e));
    }
  };

  const stopRecording = async () => {
    setRecording(false);
    try {
      await audioRecorder.stop();
      const uri = audioRecorder.uri;
      if (!uri || !id) return;
      const stamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const attachment = await saveImportedAttachment(
        id,
        { uri, name: `Audio note ${stamp}`, mimeType: 'audio/m4a' },
        'audio',
      );
      insertMediaBlock(createBlock('file', attachment.id));
    } catch (e) {
      Alert.alert('Recording failed', e instanceof Error ? e.message : String(e));
    }
  };

  const cancelRecording = async () => {
    setRecording(false);
    try {
      await audioRecorder.stop();
    } catch {
      // ignore
    }
    if (audioRecorder.uri) deleteLocalFile(audioRecorder.uri);
  };

  // --- Lifecycle -----------------------------------------------------------

  useFocusEffect(
    useCallback(() => {
      return () => {
        if (saveTimer.current) {
          clearTimeout(saveTimer.current);
          saveTimer.current = null;
        }
        if (historyTimer.current) {
          clearTimeout(historyTimer.current);
          historyTimer.current = null;
        }
        void persist();
      };
    }, [persist]),
  );

  const handleActions = useCallback(() => {
    if (!id) return;
    hapticSelection();
    setNoteMenu(true);
  }, [id]);

  const noteMenuActions = (): SheetAction[] => {
    if (!id) return [];
    return [
      {
        label: pinnedRef.current ? 'Unpin' : 'Pin',
        icon: 'pin',
        onPress: () => {
          pinnedRef.current = !pinnedRef.current;
          hapticLight();
          void setPinned(id, pinnedRef.current);
        },
      },
      {
        label: 'Move to Folder…',
        icon: 'folder-input',
        onPress: () => {
          void persist();
          router.push({ pathname: '/move/[id]', params: { id } });
        },
      },
      {
        label: note?.isLocked ? 'Remove Lock' : 'Lock Note',
        icon: note?.isLocked ? 'lock-open' : 'lock',
        onPress: () => {
          if (note?.isLocked) {
            void authenticate('Remove lock from this note').then((ok) => {
              if (ok) void setLocked(id, false);
            });
          } else {
            hapticLight();
            void setLocked(id, true);
          }
        },
      },
      {
        label: 'Export…',
        icon: 'share',
        onPress: () => setExportMenu(true),
      },
      {
        label: 'Delete',
        icon: 'trash',
        destructive: true,
        onPress: () => {
          if (saveTimer.current) clearTimeout(saveTimer.current);
          initialized.current = false;
          hapticWarning();
          void deleteNote(id);
          router.back();
        },
      },
    ];
  };

  const doExport = async (format: ExportFormat) => {
    if (!note) return;
    try {
      await persist();
      await exportNote(note, blocksRef.current, Object.values(attachments), format);
    } catch (e) {
      Alert.alert('Export failed', e instanceof Error ? e.message : String(e));
    }
  };

  const exportMenuActions = (): SheetAction[] => [
    { label: 'Markdown (.md)', icon: 'note', onPress: () => void doExport('markdown') },
    { label: 'Plain text (.txt)', icon: 'note', onPress: () => void doExport('text') },
    { label: 'JSON backup (.json)', icon: 'download', onPress: () => void doExport('json') },
  ];

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={styles.headerActions}>
          <Pressable
            onPress={undo}
            disabled={!canUndo}
            accessibilityLabel="Undo"
            accessibilityState={{ disabled: !canUndo }}
            hitSlop={10}>
            <Icon name="undo" size={22} color={canUndo ? theme.accent : theme.textSecondary} />
          </Pressable>
          <Pressable
            onPress={redo}
            disabled={!canRedo}
            accessibilityLabel="Redo"
            accessibilityState={{ disabled: !canRedo }}
            hitSlop={10}>
            <Icon name="redo" size={22} color={canRedo ? theme.accent : theme.textSecondary} />
          </Pressable>
          <Pressable onPress={handleActions} accessibilityLabel="Note actions" hitSlop={10}>
            <Icon name="more" size={24} color={theme.accent} />
          </Pressable>
        </View>
      ),
    });
  }, [navigation, handleActions, theme.accent, theme.textSecondary, canUndo, canRedo, undo, redo]);

  // Keep the spinner up until blocks are seeded so the scroll view mounts with
  // its final content. Mounting empty and growing a frame later throws off
  // KeyboardAwareScrollView's first measurement (bottom line stays under the
  // keyboard until you re-enter the note).
  const willShowEditor = !!note && (!note.isLocked || unlocked);
  if (loading || (willShowEditor && !initialized.current)) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator color={theme.textSecondary} />
      </ThemedView>
    );
  }

  if (note?.isLocked && !unlocked) {
    return (
      <ThemedView style={styles.center}>
        <View style={styles.lockedWrap}>
          <Icon name="lock" size={40} color={theme.textSecondary} />
          <ThemedText type="subtitle">Locked Note</ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.lockedHint}>
            Authenticate to view this note.
          </ThemedText>
          <Pressable
            onPress={tryUnlock}
            style={({ pressed }) => [
              styles.unlockBtn,
              { backgroundColor: theme.accent, opacity: pressed ? 0.85 : 1 },
            ]}>
            <Icon name="lock-open" size={18} color={theme.accentContrast} />
            <ThemedText style={{ color: theme.accentContrast, fontWeight: '600' }}>Unlock</ThemedText>
          </Pressable>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView type="backgroundElement" style={styles.container}>
      <KeyboardAwareScrollView
        style={styles.flex}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        // Keep the caret this far above the keyboard (clears the sticky toolbar).
        bottomOffset={62}>
        {blocks.map((block) => (
          <BlockView
            key={block.id}
            block={block}
            attachment={
              block.type === 'image' || block.type === 'file'
                ? attachments[block.attachmentId]
                : undefined
            }
            downloading={
              (block.type === 'image' || block.type === 'file') &&
              downloadingIds.has(block.attachmentId)
            }
            theme={theme}
            registerRef={(ref) => {
              inputs.current[block.id] = ref;
            }}
            onFocus={() => {
              focusedId.current = block.id;
              // Default the caret to the start on focus; onSelectionChange
              // corrects it. Without this, focus moved programmatically (e.g.
              // after pasting a link) keeps the previous line's caret position,
              // so backspace wouldn't recognize "caret at line start".
              selectionRef.current = { start: 0, end: 0 };
            }}
            onSelectionChange={(e) => {
              selectionRef.current = e.nativeEvent.selection;
            }}
            onChangeText={(text) => setText(block.id, text)}
            onSubmit={() => handleReturn(block.id)}
            onKeyPress={(e) => handleBackspace(block.id, e)}
            onToggle={() => toggleCheck(block.id)}
            onLongPressMedia={() =>
              block.type === 'link' ? showLinkActions(block) : showMediaActions(block)
            }
            onOpenMedia={() => openMedia(block)}
          />
        ))}
      </KeyboardAwareScrollView>

      <KeyboardStickyView offset={{ closed: 0, opened: insets.bottom }}>
        {recording ? (
          <GlassSurface style={styles.toolbar}>
            <View style={styles.recordingBar}>
              <View style={[styles.recDot, { backgroundColor: theme.danger }]} />
              <ThemedText type="default" style={styles.recTime}>
                Recording · {formatDuration(recorderState.durationMillis)}
              </ThemedText>
              <Pressable onPress={cancelRecording} hitSlop={8} style={styles.recAction}>
                <ThemedText type="default" style={{ color: theme.textSecondary }}>
                  Cancel
                </ThemedText>
              </Pressable>
              <Pressable onPress={stopRecording} hitSlop={8} style={styles.recAction}>
                <ThemedText type="default" style={{ color: theme.accent, fontWeight: '600' }}>
                  Stop
                </ThemedText>
              </Pressable>
            </View>
          </GlassSurface>
        ) : (
          <GlassSurface style={styles.toolbar}>
            <ToolbarButton icon="checkbox" label="Checklist" onPress={() => addTextBlock('checklist')} theme={theme} />
            <ToolbarButton icon="heading" label="Heading" onPress={() => addTextBlock('heading')} theme={theme} />
            <ToolbarButton icon="bullet-list" label="List" onPress={() => addTextBlock('bullet')} theme={theme} />
            <ToolbarButton icon="image" label="Photo" onPress={() => addAttachment('library')} theme={theme} />
            <ToolbarButton icon="camera" label="Camera" onPress={() => addAttachment('camera')} theme={theme} />
            <ToolbarButton icon="attach" label="File" onPress={() => addAttachment('file')} theme={theme} />
            <ToolbarButton icon="mic" label="Audio" onPress={startRecording} theme={theme} />
          </GlassSurface>
        )}
        <View style={{ height: insets.bottom }} />
      </KeyboardStickyView>

      <ImageViewerModal
        visible={viewerUri !== null}
        uri={viewerUri}
        onClose={() => setViewerUri(null)}
      />

      <ActionSheet
        visible={mediaMenu !== null}
        title={
          mediaMenu && (mediaMenu.type === 'image' || mediaMenu.type === 'file')
            ? (attachments[mediaMenu.attachmentId]?.name ?? 'Attachment')
            : undefined
        }
        actions={mediaMenuActions()}
        onClose={() => setMediaMenu(null)}
      />

      <ActionSheet
        visible={linkMenu !== null}
        title={linkMenu && linkMenu.type === 'link' ? (linkMenu.title ?? linkMenu.url) : undefined}
        actions={linkMenuActions()}
        onClose={() => setLinkMenu(null)}
      />

      <ActionSheet
        visible={noteMenu}
        actions={noteMenuActions()}
        onClose={() => setNoteMenu(false)}
      />

      <ActionSheet
        visible={exportMenu}
        title="Export as"
        actions={exportMenuActions()}
        onClose={() => setExportMenu(false)}
      />
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
  downloading,
  theme,
  registerRef,
  onFocus,
  onSelectionChange,
  onChangeText,
  onSubmit,
  onKeyPress,
  onToggle,
  onLongPressMedia,
  onOpenMedia,
}: {
  block: ContentBlock;
  attachment?: Attachment;
  downloading: boolean;
  theme: ThemeColors;
  registerRef: (ref: TextInput | null) => void;
  onFocus: () => void;
  onSelectionChange: (e: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => void;
  onChangeText: (text: string) => void;
  onSubmit: () => void;
  onKeyPress: (e: NativeSyntheticEvent<TextInputKeyPressEventData>) => void;
  onToggle: () => void;
  onLongPressMedia: () => void;
  onOpenMedia: () => void;
}) {
  const [imgLoaded, setImgLoaded] = useState(false);

  if (block.type === 'image') {
    const localUri = attachment?.localUri ?? undefined;
    const uri = localUri ?? resolvePublicUrl(attachment?.remoteUrl) ?? undefined;
    const isRemote = !localUri && !!uri;
    const ratio = attachment?.width && attachment?.height ? attachment.width / attachment.height : 4 / 3;
    const showSkeleton = downloading || (isRemote && !imgLoaded);
    return (
      <Pressable onPress={onOpenMedia} onLongPress={onLongPressMedia} style={styles.mediaWrap}>
        {uri ? (
          <Image
            source={{ uri }}
            style={[styles.image, { aspectRatio: ratio }]}
            contentFit="cover"
            onLoadStart={() => isRemote && setImgLoaded(false)}
            onLoad={() => setImgLoaded(true)}
          />
        ) : (
          <View style={[styles.image, styles.imageFallback, { backgroundColor: theme.backgroundElement }]}>
            <Icon name="image" size={28} color={theme.textSecondary} />
          </View>
        )}
        {showSkeleton && (
          <Skeleton style={[styles.image, styles.mediaSkeleton, { aspectRatio: ratio }]} />
        )}
        {(attachment?.uploadStatus === 'uploading' || downloading) && (
          <View style={styles.badge}>
            <ActivityIndicator size="small" color="#fff" />
          </View>
        )}
        {attachment?.uploadStatus === 'failed' && !downloading && (
          <View style={[styles.badge, { backgroundColor: theme.danger }]}>
            <Icon name="error" size={14} color="#fff" />
          </View>
        )}
      </Pressable>
    );
  }

  if (block.type === 'file') {
    // Audio attachments render an inline player instead of a file chip.
    if (attachment?.type === 'audio') {
      const audioUri = attachment.localUri ?? resolvePublicUrl(attachment.remoteUrl);
      return (
        <Pressable onLongPress={onLongPressMedia}>
          <AudioPlayer uri={audioUri} name={attachment.name} />
        </Pressable>
      );
    }
    const uploading = attachment?.uploadStatus === 'uploading';
    const failed = attachment?.uploadStatus === 'failed';
    const ext = extensionLabel(attachment?.name, attachment?.mimeType);
    return (
      <Pressable
        onPress={onOpenMedia}
        onLongPress={onLongPressMedia}
        style={({ pressed }) => [
          styles.fileChip,
          { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.7 : 1 },
        ]}>
        <View style={[styles.fileIcon, { backgroundColor: theme.accent }]}>
          {uploading || downloading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Icon name={failed ? 'error' : 'note'} size={18} color="#fff" />
          )}
          {ext && !uploading && !downloading ? (
            <ThemedText type="small" style={styles.fileExtBadge}>
              {ext}
            </ThemedText>
          ) : null}
        </View>
        <View style={styles.fileMeta}>
          <ThemedText type="small" numberOfLines={1} style={styles.fileNameStrong}>
            {attachment?.name ?? 'Attachment'}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {downloading
              ? 'Downloading…'
              : failed
                ? 'Upload failed'
                : uploading
                  ? 'Uploading…'
                  : [ext?.toUpperCase(), formatBytes(attachment?.size)].filter(Boolean).join(' · ')}
          </ThemedText>
        </View>
      </Pressable>
    );
  }

  if (block.type === 'link') {
    return <LinkPreviewCard block={block} theme={theme} onLongPress={onLongPressMedia} />;
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
        onSelectionChange={onSelectionChange}
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
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.four },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  lockedWrap: { alignItems: 'center', gap: Spacing.two, padding: Spacing.six },
  lockedHint: { textAlign: 'center' },
  unlockBtn: {
    marginTop: Spacing.two,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    borderRadius: 999,
  },
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
  mediaSkeleton: { position: 'absolute', top: 0, left: 0, right: 0 },
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
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: 12,
    marginVertical: Spacing.two,
  },
  fileName: { flex: 1 },
  fileIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileExtBadge: {
    position: 'absolute',
    bottom: 2,
    color: '#fff',
    fontSize: 8,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  fileMeta: { flex: 1, gap: 2 },
  fileNameStrong: { fontWeight: '600' },
  recordingBar: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, flex: 1, paddingHorizontal: Spacing.two },
  recDot: { width: 12, height: 12, borderRadius: 6 },
  recTime: { flex: 1 },
  recAction: { paddingHorizontal: Spacing.two, paddingVertical: Spacing.one },
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two,
  },
  toolbarBtn: { padding: Spacing.three, minWidth: 44, alignItems: 'center' },
});
