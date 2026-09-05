/**
 * Note import / export (§40).
 *
 * Export: turns a note into a shareable file — Markdown, plain text, or a JSON
 * backup that can be re-imported with structure intact — and hands it to the OS
 * share sheet.
 *
 * Import: accepts files of ANY type from the document picker and turns each into
 * a note:
 *   - our JSON export      → recreates the note(s) and cloud-backed attachments
 *   - text / markdown      → a note whose body is the parsed text
 *   - images               → a note with the image attached
 *   - anything else        → a note with the file attached (pdf, docx, zip, …)
 */
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import { EncodingType, writeAsStringAsync } from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

import { htmlToText } from '@/utils/htmlText';
import { rtfToText } from '@/utils/rtf';

import { upsertAttachment } from '@/database/attachmentsRepository';
import { createNote, permanentlyDeleteNote, updateNote } from '@/database/notesRepository';
import { saveImportedAttachment } from '@/services/attachments/attachmentService';
import { resolvePublicUrl } from '@/services/edgeflare/storage';
import type { Attachment } from '@/types/attachment';
import type { ContentBlock } from '@/types/blocks';
import type { Note } from '@/types/note';
import { blocksToPlainText, createBlock, markdownToBlocks } from '@/utils/blocks';
import { deriveTitle } from '@/utils/format';
import { createId } from '@/utils/id';

export type ExportFormat = 'markdown' | 'text' | 'json';

const EXPORT_APP = 'edge-note';
const EXPORT_VERSION = 1;

// ── helpers ──────────────────────────────────────────────────────────

function safeFileName(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9-_ ]/g, '').trim().replace(/\s+/g, '-');
  return cleaned.length > 0 ? cleaned.slice(0, 60) : 'note';
}

function extOf(name?: string | null, mimeType?: string | null): string {
  const fromName = name?.split('.').pop()?.toLowerCase();
  if (fromName && fromName.length <= 5 && /^[a-z0-9]+$/.test(fromName)) return fromName;
  const fromMime = mimeType?.split('/').pop()?.toLowerCase();
  if (fromMime && fromMime.length <= 5 && /^[a-z0-9]+$/.test(fromMime)) return fromMime;
  return '';
}

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'bmp']);
const TEXT_EXTS = new Set(['txt', 'md', 'markdown', 'markdn', 'mdown', 'text', 'csv', 'log']);

function isImage(name?: string | null, mimeType?: string | null): boolean {
  return (mimeType?.startsWith('image/') ?? false) || IMAGE_EXTS.has(extOf(name, mimeType));
}

function isTextLike(name?: string | null, mimeType?: string | null): boolean {
  return (mimeType?.startsWith('text/') ?? false) || TEXT_EXTS.has(extOf(name, mimeType));
}

async function readText(uri: string): Promise<string> {
  try {
    return await new File(uri).text();
  } catch {
    const res = await fetch(uri);
    return res.text();
  }
}

/**
 * Reads a file as a latin1/binary string. RTF isn't UTF-8, so `File.text()`
 * throws on encoding detection; the raw bytes work because RTF's structure is
 * ASCII and non-ASCII characters arrive as `\'hh` escapes that rtfToText decodes.
 */
async function readBinaryString(uri: string): Promise<string> {
  const bytes = await new File(uri).bytes();
  let out = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    out += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return out;
}

// ── export ───────────────────────────────────────────────────────────

function blocksToMarkdown(blocks: ContentBlock[], byId: Record<string, Attachment>): string {
  const lines = blocks.map((block) => {
    switch (block.type) {
      case 'heading':
        return `# ${block.text}`;
      case 'bullet':
        return `- ${block.text}`;
      case 'checklist':
        return `- [${block.checked ? 'x' : ' '}] ${block.text}`;
      case 'image': {
        const a = byId[block.attachmentId];
        return `![${a?.name ?? 'image'}](${(a && resolvePublicUrl(a.remoteUrl)) ?? a?.name ?? ''})`;
      }
      case 'file': {
        const a = byId[block.attachmentId];
        return `[${a?.name ?? 'file'}](${(a && resolvePublicUrl(a.remoteUrl)) ?? a?.name ?? ''})`;
      }
      default:
        return block.text;
    }
  });
  return lines.join('\n\n');
}

function noteToExportJson(note: Note, blocks: ContentBlock[], attachments: Attachment[]) {
  return {
    app: EXPORT_APP,
    version: EXPORT_VERSION,
    exportedAt: Date.now(),
    notes: [
      {
        title: note.title,
        content: note.content,
        blocks,
        createdAt: note.createdAt,
        updatedAt: note.updatedAt,
        attachments: attachments.map((a) => ({
          id: a.id,
          type: a.type,
          name: a.name,
          mimeType: a.mimeType,
          remoteUrl: a.remoteUrl,
          storagePath: a.storagePath,
          width: a.width,
          height: a.height,
          size: a.size,
        })),
      },
    ],
  };
}

async function writeAndShare(
  baseName: string,
  ext: string,
  mimeType: string,
  content: string,
): Promise<void> {
  const dir = new Directory(Paths.cache, 'exports');
  if (!dir.exists) dir.create();
  const file = new File(dir, `${safeFileName(baseName)}.${ext}`);
  if (file.exists) file.delete();
  file.create();
  file.write(content);

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device.');
  }
  await Sharing.shareAsync(file.uri, {
    mimeType,
    UTI: mimeType,
    dialogTitle: `${baseName}.${ext}`,
  });
}

/** Exports a single note to the chosen format and opens the share sheet. */
export async function exportNote(
  note: Note,
  blocks: ContentBlock[],
  attachments: Attachment[],
  format: ExportFormat,
): Promise<void> {
  const byId: Record<string, Attachment> = {};
  for (const a of attachments) byId[a.id] = a;
  const title = note.title.trim() || deriveTitle(note.content) || 'Note';

  if (format === 'json') {
    const content = JSON.stringify(noteToExportJson(note, blocks, attachments), null, 2);
    await writeAndShare(title, 'json', 'application/json', content);
    return;
  }
  if (format === 'text') {
    const content = [title, blocksToPlainText(blocks)].filter((s) => s.length > 0).join('\n\n');
    await writeAndShare(title, 'txt', 'text/plain', content);
    return;
  }
  // markdown
  const body = blocksToMarkdown(blocks, byId);
  const content = [`# ${title}`, body].filter((s) => s.trim().length > 0).join('\n\n');
  await writeAndShare(title, 'md', 'text/markdown', content);
}

// ── import ───────────────────────────────────────────────────────────

export type ImportOutcome = { count: number; firstNoteId: string | null; skipped: string[] };

type ExportedAttachment = {
  id: string;
  type?: Attachment['type'];
  name?: string | null;
  mimeType?: string | null;
  remoteUrl?: string | null;
  storagePath?: string | null;
  width?: number | null;
  height?: number | null;
  size?: number | null;
};

type ExportedNote = {
  title?: string;
  content?: string;
  blocks?: ContentBlock[];
  attachments?: ExportedAttachment[];
};

/** Rebuilds notes from our own JSON export. Attachments are recreated as
 *  cloud-backed rows (new ids) that download on demand. */
async function importFromExport(
  data: { notes?: ExportedNote[] },
  folderId: string | null,
): Promise<string[]> {
  const ids: string[] = [];
  for (const n of data.notes ?? []) {
    const title = n.title ?? '';
    const created = await createNote({ title, folderId });

    // Recreate cloud-backed attachments with fresh ids; remap block references.
    const idMap = new Map<string, string>();
    for (const att of n.attachments ?? []) {
      if (!att.remoteUrl) continue;
      const newId = createId('att');
      idMap.set(att.id, newId);
      await upsertAttachment({
        id: newId,
        noteId: created.id,
        type: att.type ?? 'file',
        localUri: null,
        remoteUrl: att.remoteUrl,
        storagePath: att.storagePath ?? null,
        name: att.name ?? null,
        mimeType: att.mimeType ?? null,
        size: att.size ?? null,
        width: att.width ?? null,
        height: att.height ?? null,
        uploadStatus: 'uploaded',
        createdAt: Date.now(),
      });
    }

    const blocks: ContentBlock[] = (n.blocks ?? []).map((b) => {
      if ((b.type === 'image' || b.type === 'file') && idMap.has(b.attachmentId)) {
        return { ...b, attachmentId: idMap.get(b.attachmentId) as string };
      }
      return b;
    });
    const usable = blocks.length > 0 ? blocks : [createBlock('paragraph')];
    const content = n.content ?? blocksToPlainText(usable);
    await updateNote(created.id, { blocks: usable, content, title: title || deriveTitle(content) });
    ids.push(created.id);
  }
  return ids;
}

/**
 * Imports an Apple Notes `.rtfd` bundle: it's a directory containing a `.rtf`
 * (the rich text) plus any embedded images. We convert the RTF to text and
 * attach the images.
 */
async function importRtfdBundle(
  asset: DocumentPicker.DocumentPickerAsset,
  folderId: string | null,
): Promise<string[]> {
  const baseTitle = (asset.name ?? 'Note').replace(/\.[^.]+$/, '');
  const files = new Directory(asset.uri).list().filter((e): e is File => e instanceof File);

  const rtfFile = files.find((f) => f.name.toLowerCase().endsWith('.rtf'));
  const imageFiles = files.filter((f) => isImage(f.name, null));
  const rawText = rtfFile ? rtfToText(await readBinaryString(rtfFile.uri)) : '';
  const textBlocks = rawText.trim().length > 0 ? markdownToBlocks(rawText) : [];

  if (textBlocks.length === 0 && imageFiles.length === 0) {
    throw new Error('This .rtfd bundle has no readable content.');
  }

  const note = await createNote({ title: baseTitle, folderId });

  const imageBlocks: ContentBlock[] = [];
  for (const f of imageFiles) {
    try {
      const att = await saveImportedAttachment(note.id, { uri: f.uri, name: f.name }, 'image');
      imageBlocks.push(createBlock('image', att.id));
    } catch (e) {
      console.warn('[import] rtfd image failed', f.name, e);
    }
  }

  const blocks = [...textBlocks, ...imageBlocks];
  const usable = blocks.length > 0 ? blocks : [createBlock('paragraph')];
  const content = blocksToPlainText(usable);
  await updateNote(note.id, { blocks: usable, content, title: baseTitle || deriveTitle(content) });
  return [note.id];
}

/** Writes a base64 blob to a temp file and returns its uri (for ENEX resources). */
async function writeBase64Temp(base64: string, name: string, mimeType: string): Promise<string> {
  const dir = new Directory(Paths.cache, 'enex-import');
  if (!dir.exists) dir.create();
  const ext = extOf(name, mimeType) || 'bin';
  const file = new File(dir, `${createId('res')}.${ext}`);
  if (file.exists) file.delete();
  await writeAsStringAsync(file.uri, base64, { encoding: EncodingType.Base64 });
  return file.uri;
}

function firstMatch(source: string, re: RegExp): string {
  return (source.match(re)?.[1] ?? '').trim();
}

/**
 * Imports an Evernote `.enex` export. It's XML holding one or more `<note>`
 * elements, each with a `<title>`, ENML `<content>` (XHTML), and base64
 * `<resource>` attachments. Produces one note per `<note>`.
 */
async function importEnex(
  asset: DocumentPicker.DocumentPickerAsset,
  folderId: string | null,
): Promise<string[]> {
  const xml = await readText(asset.uri);
  const noteBlocks = xml.match(/<note>[\s\S]*?<\/note>/gi) ?? [];
  const ids: string[] = [];

  for (const noteXml of noteBlocks) {
    const title = htmlToText(firstMatch(noteXml, /<title>([\s\S]*?)<\/title>/i));
    const enml = firstMatch(noteXml, /<content>([\s\S]*?)<\/content>/i)
      .replace(/<!\[CDATA\[/g, '')
      .replace(/\]\]>/g, '');
    const textBlocks = markdownToBlocks(htmlToText(enml));

    const note = await createNote({ title, folderId });

    const mediaBlocks: ContentBlock[] = [];
    const resources = noteXml.match(/<resource>[\s\S]*?<\/resource>/gi) ?? [];
    for (const res of resources) {
      const base64 = firstMatch(res, /<data[^>]*>([\s\S]*?)<\/data>/i).replace(/\s+/g, '');
      if (!base64) continue;
      const mime = firstMatch(res, /<mime>([\s\S]*?)<\/mime>/i) || 'application/octet-stream';
      const fname = firstMatch(res, /<file-name>([\s\S]*?)<\/file-name>/i) || `attachment`;
      try {
        const uri = await writeBase64Temp(base64, fname, mime);
        const type = mime.startsWith('image/') ? 'image' : 'file';
        const att = await saveImportedAttachment(note.id, { uri, name: fname, mimeType: mime }, type);
        mediaBlocks.push(createBlock(type, att.id));
      } catch (e) {
        console.warn('[import] enex resource failed', e);
      }
    }

    const blocks = [...textBlocks, ...mediaBlocks];
    const usable = blocks.length > 0 ? blocks : [createBlock('paragraph')];
    const content = blocksToPlainText(usable);
    await updateNote(note.id, { blocks: usable, content, title: title || deriveTitle(content) });
    ids.push(note.id);
  }
  return ids;
}

/** Imports one picked file, returning the created note id(s). */
async function importAsset(
  asset: DocumentPicker.DocumentPickerAsset,
  folderId: string | null,
): Promise<string[]> {
  const name = asset.name ?? 'Imported';
  const baseTitle = name.replace(/\.[^.]+$/, '');
  const ext = extOf(asset.name, asset.mimeType);

  // 1) Our JSON export.
  if (ext === 'json') {
    try {
      const parsed = JSON.parse(await readText(asset.uri));
      if (parsed && parsed.app === EXPORT_APP && Array.isArray(parsed.notes)) {
        return importFromExport(parsed, folderId);
      }
    } catch {
      // Not our schema / not valid JSON — fall through to text import.
    }
  }

  // 2) Evernote export — may contain several notes.
  if (ext === 'enex') {
    return importEnex(asset, folderId);
  }

  // 3) Apple Notes rich text: `.rtfd` bundle or a standalone `.rtf`.
  if (ext === 'rtfd') {
    return importRtfdBundle(asset, folderId);
  }
  if (ext === 'rtf') {
    const blocks = markdownToBlocks(rtfToText(await readBinaryString(asset.uri)));
    const content = blocksToPlainText(blocks);
    const note = await createNote({ title: baseTitle, folderId });
    await updateNote(note.id, { blocks, content, title: baseTitle || deriveTitle(content) });
    return [note.id];
  }

  // 4) HTML → convert tags to text/blocks (handled before generic text so we
  // don't import raw markup).
  if (ext === 'html' || ext === 'htm') {
    const blocks = markdownToBlocks(htmlToText(await readText(asset.uri)));
    const content = blocksToPlainText(blocks);
    const note = await createNote({ title: baseTitle, folderId });
    await updateNote(note.id, { blocks, content, title: baseTitle || deriveTitle(content) });
    return [note.id];
  }

  // 5) Text / Markdown → a note whose body is the parsed text.
  if (isTextLike(asset.name, asset.mimeType)) {
    const text = await readText(asset.uri);
    const blocks = markdownToBlocks(text);
    const content = blocksToPlainText(blocks);
    const note = await createNote({ title: baseTitle, folderId });
    await updateNote(note.id, { blocks, content, title: baseTitle || deriveTitle(content) });
    return [note.id];
  }

  // 3) Image or 4) any other file → a note with the file attached. Create the
  // note only if the attachment persists, so a failure (e.g. an .rtfd bundle)
  // doesn't leave an empty orphan note behind.
  const type = isImage(asset.name, asset.mimeType) ? 'image' : 'file';
  const note = await createNote({ title: baseTitle, folderId });
  try {
    const attachment = await saveImportedAttachment(
      note.id,
      { uri: asset.uri, name: asset.name, mimeType: asset.mimeType, size: asset.size ?? null },
      type,
    );
    const blocks: ContentBlock[] = [createBlock(type, attachment.id), createBlock('paragraph')];
    await updateNote(note.id, { blocks, content: '', title: baseTitle });
    return [note.id];
  } catch (e) {
    await permanentlyDeleteNote(note.id);
    throw e;
  }
}

/** Opens the picker (any file type, multi-select) and imports each file. */
export async function importNotes(folderId: string | null = null): Promise<ImportOutcome> {
  const result = await DocumentPicker.getDocumentAsync({
    multiple: true,
    copyToCacheDirectory: true,
    type: '*/*',
  });
  if (result.canceled || result.assets.length === 0) {
    return { count: 0, firstNoteId: null, skipped: [] };
  }

  let firstNoteId: string | null = null;
  let count = 0;
  const skipped: string[] = [];
  for (const asset of result.assets) {
    try {
      const ids = await importAsset(asset, folderId);
      if (ids.length > 0) {
        firstNoteId = firstNoteId ?? ids[0];
        count += ids.length;
      }
    } catch (e) {
      console.warn('[import] failed for', asset.name, e);
      skipped.push(asset.name ?? 'a file');
    }
  }
  return { count, firstNoteId, skipped };
}
