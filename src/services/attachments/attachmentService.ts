/**
 * Attachment capture + local persistence (§22).
 *
 * Picker results live in a cache directory that the OS may clear, so every
 * attachment is copied into the app's document directory before we record it.
 * The note editor never waits on the network — upload happens later via the
 * sync engine.
 */
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';

import { insertAttachment } from '@/database/attachmentsRepository';
import type { Attachment, AttachmentType } from '@/types/attachment';
import { createId } from '@/utils/id';

const DIR_NAME = 'attachments';

function attachmentsDir(): Directory {
  const dir = new Directory(Paths.document, DIR_NAME);
  if (!dir.exists) dir.create();
  return dir;
}

function extensionFor(uri: string, name?: string | null, mimeType?: string | null): string {
  const fromName = name?.split('.').pop();
  const fromUri = uri.split('?')[0].split('.').pop();
  const candidate = (fromName || fromUri || '').toLowerCase();
  if (candidate && candidate.length <= 5 && /^[a-z0-9]+$/.test(candidate)) return candidate;
  if (mimeType?.startsWith('image/')) return mimeType.split('/')[1] ?? 'jpg';
  return 'bin';
}

/** Copies a source file into the persistent attachments directory. */
async function persistCopy(sourceUri: string, id: string, ext: string): Promise<string> {
  const dest = new File(attachmentsDir(), `${id}.${ext}`);
  const source = new File(sourceUri);
  // copy is synchronous in the new API; guard for either shape.
  await Promise.resolve(source.copy(dest));
  return dest.uri;
}

/** Removes an attachment's local file, if present. Best-effort. */
export function deleteLocalFile(localUri: string | null): void {
  if (!localUri) return;
  try {
    const file = new File(localUri);
    if (file.exists) file.delete();
  } catch {
    // Ignore — the row is going away regardless.
  }
}

async function buildAttachment(
  noteId: string,
  type: AttachmentType,
  asset: {
    uri: string;
    name?: string | null;
    mimeType?: string | null;
    size?: number | null;
    width?: number | null;
    height?: number | null;
  },
): Promise<Attachment> {
  const id = createId('att');
  const ext = extensionFor(asset.uri, asset.name, asset.mimeType);
  const localUri = await persistCopy(asset.uri, id, ext);
  const attachment: Attachment = {
    id,
    noteId,
    type,
    localUri,
    remoteUrl: null,
    storagePath: null,
    name: asset.name ?? `${type}.${ext}`,
    mimeType: asset.mimeType ?? null,
    size: asset.size ?? null,
    width: asset.width ?? null,
    height: asset.height ?? null,
    uploadStatus: 'pending',
    createdAt: Date.now(),
  };
  await insertAttachment(attachment);
  return attachment;
}

export async function pickImageFromLibrary(noteId: string): Promise<Attachment | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    Alert.alert('Permission needed', 'Allow photo access to add images to notes.');
    return null;
  }
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
  if (result.canceled || result.assets.length === 0) return null;
  const asset = result.assets[0];
  return buildAttachment(noteId, 'image', {
    uri: asset.uri,
    name: asset.fileName,
    mimeType: asset.mimeType,
    size: asset.fileSize,
    width: asset.width,
    height: asset.height,
  });
}

export async function takePhoto(noteId: string): Promise<Attachment | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) {
    Alert.alert('Permission needed', 'Allow camera access to take photos.');
    return null;
  }
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
  if (result.canceled || result.assets.length === 0) return null;
  const asset = result.assets[0];
  return buildAttachment(noteId, 'image', {
    uri: asset.uri,
    name: asset.fileName,
    mimeType: asset.mimeType,
    size: asset.fileSize,
    width: asset.width,
    height: asset.height,
  });
}

export async function pickDocument(noteId: string): Promise<Attachment | null> {
  const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
  if (result.canceled || result.assets.length === 0) return null;
  const asset = result.assets[0];
  return buildAttachment(noteId, 'file', {
    uri: asset.uri,
    name: asset.name,
    mimeType: asset.mimeType,
    size: asset.size,
  });
}
