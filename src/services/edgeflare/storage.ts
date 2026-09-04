/**
 * Attachment file storage over edgeflare's S3 gateway — replaces Firebase
 * Storage. Exports the same surface the sync engine consumes: uploadAttachment,
 * deleteRemoteAttachment.
 *
 * Endpoint contract (edgeforce-ng environment.ts):
 *   upload : PUT {s3ApiUrl}/{bucket}/{key}     (bearer token)
 *   read   : {s3Endpoint}/{tenant}:{bucket}/{key}   (public)
 *
 * NOTE: the exact PUT path/verb for the S3 proxy is inferred from the Angular
 * config and NOT yet confirmed against a live upload. If uploads 404/403,
 * adjust `uploadUrl()` / `publicUrl()` to match your gateway, then re-test.
 * Attachment sync is independent of note/folder sync, so a wrong guess here
 * does not block the core cloud sync.
 */
import { getAccessToken } from '@/services/edgeflare/auth';
import { s3ApiUrl, s3Bucket, s3Endpoint, s3Tenant } from '@/services/edgeflare/config';
import type { Attachment } from '@/types/attachment';

/** Object key within the bucket. Owner-scoped for tidy listing + rules. */
function keyFor(uid: string, attachment: Attachment): string {
  return `${uid}/${attachment.noteId}/${attachment.id}`;
}

function uploadUrl(key: string): string {
  return `${s3ApiUrl}/${s3Bucket}/${key}`;
}

function publicUrl(key: string): string {
  return `${s3Endpoint}/${s3Tenant}:${s3Bucket}/${key}`;
}

/** Uploads an attachment's local file and returns its public URL + object key. */
export async function uploadAttachment(
  uid: string,
  attachment: Attachment,
): Promise<{ remoteUrl: string; storagePath: string }> {
  if (!attachment.localUri) {
    throw new Error('Attachment has no local file to upload');
  }
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated');

  const key = keyFor(uid, attachment);

  // React Native: read the local file URI into a Blob for the PUT body.
  const fileRes = await fetch(attachment.localUri);
  const blob = await fileRes.blob();

  const res = await fetch(uploadUrl(key), {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(attachment.mimeType ? { 'Content-Type': attachment.mimeType } : {}),
    },
    body: blob,
  });
  if (!res.ok) {
    throw new Error(`S3 upload failed (${res.status}): ${await res.text()}`);
  }

  return { remoteUrl: publicUrl(key), storagePath: key };
}

export async function deleteRemoteAttachment(storagePath: string): Promise<void> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated');
  const res = await fetch(uploadUrl(storagePath), {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  // Treat "already gone" as success.
  if (!res.ok && res.status !== 404) {
    throw new Error(`S3 delete failed (${res.status})`);
  }
}
