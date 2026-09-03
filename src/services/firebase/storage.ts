/**
 * Firebase Storage access for attachments (§22, §30).
 * Files live at users/{uid}/notes/{noteId}/attachments/{attachmentId}.
 */
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';

import { getStorageInstance } from '@/services/firebase/firebaseConfig';
import type { Attachment } from '@/types/attachment';

function storagePathFor(uid: string, attachment: Attachment): string {
  return `users/${uid}/notes/${attachment.noteId}/attachments/${attachment.id}`;
}

/** Uploads an attachment's local file and returns its download URL + path. */
export async function uploadAttachment(
  uid: string,
  attachment: Attachment,
): Promise<{ remoteUrl: string; storagePath: string }> {
  if (!attachment.localUri) {
    throw new Error('Attachment has no local file to upload');
  }
  const path = storagePathFor(uid, attachment);
  const storageRef = ref(getStorageInstance(), path);

  // React Native: read the local file URI into a Blob for upload.
  const response = await fetch(attachment.localUri);
  const blob = await response.blob();

  await uploadBytes(storageRef, blob, {
    contentType: attachment.mimeType ?? undefined,
  });
  const remoteUrl = await getDownloadURL(storageRef);
  return { remoteUrl, storagePath: path };
}

export async function deleteRemoteAttachment(storagePath: string): Promise<void> {
  await deleteObject(ref(getStorageInstance(), storagePath));
}
