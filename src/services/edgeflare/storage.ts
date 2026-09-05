/**
 * Attachment file storage over edgeflare's S3 gateway — replaces Firebase
 * Storage. Exports the same surface the sync engine consumes: uploadAttachment,
 * deleteRemoteAttachment.
 *
 * URL scheme copied verbatim from edgeforce-ng
 * (src/app/shared/directives/s3-image.directive.ts, environment.ts):
 *   upload/delete : {s3ApiUrl}/buckets/{bucket}/objects/{key}   (bearer token)
 *   read          : {s3Endpoint}/{s3Tenant}:{bucket}/{key}      (anonymous)
 *
 * The proxy host ({s3ApiUrl} = {host}/s3/v1) is already tenant-scoped, so the
 * bucket name is plain there; the shared read host needs the `{tenant}:` prefix.
 */
import { File, UploadTask, UploadType } from 'expo-file-system';

import { getAccessToken } from '@/services/edgeflare/auth';
import { s3ApiUrl, s3Endpoint, s3PublicBucket, s3Tenant } from '@/services/edgeflare/config';
import type { Attachment } from '@/types/attachment';

/** Prefix within the `public` bucket for this app's files (edgeforce-ng uses
 *  one prefix per module, e.g. `storefront`). */
const KEY_PREFIX = 'notes';

/**
 * File extension for the object key, from the attachment's name or MIME type.
 * The edgeflare read gateway infers an anonymous object's Content-Type from its
 * key extension, so an extensionless key (e.g. `…/att_abc`) is served as a
 * generic download and never renders in <Image>. edgeforce-ng keys always carry
 * the original extension (`products/<ts>-Picture3.png`); we mirror that.
 */
function extFor(attachment: Attachment): string {
  const fromName = attachment.name?.split('.').pop();
  const fromMime = attachment.mimeType?.split('/')[1];
  const candidate = (fromName || fromMime || '').toLowerCase();
  return candidate && candidate.length <= 5 && /^[a-z0-9]+$/.test(candidate)
    ? `.${candidate}`
    : '';
}

/** Object key within the bucket. Owner-scoped for tidy listing + rules. */
function keyFor(uid: string, attachment: Attachment): string {
  return `${KEY_PREFIX}/${uid}/${attachment.noteId}/${attachment.id}${extFor(attachment)}`;
}

/** Authenticated proxy URL for writing/deleting an object. */
function objectUrl(key: string): string {
  return `${s3ApiUrl}/buckets/${s3PublicBucket}/objects/${key}`;
}

/**
 * Bucket-relative path stored on the attachment row, e.g.
 * `public/<uid>/<noteId>/<attId>`. Portable across endpoints/tenants — the full
 * read URL is rebuilt at display time by `resolvePublicUrl`.
 */
function storedPath(key: string): string {
  return `${s3PublicBucket}/${key}`;
}

/**
 * Expands a stored attachment path into a full anonymous read URL. A value that
 * is already a full URL (older rows) passes through unchanged; otherwise the
 * shared read host + `{tenant}:` prefix are prepended.
 */
export function resolvePublicUrl(pathOrUrl: string | null | undefined): string | undefined {
  if (!pathOrUrl) return undefined;
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return `${s3Endpoint}/${s3Tenant}:${pathOrUrl.replace(/^\/+/, '')}`;
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
  const url = objectUrl(key);

  // Stream the real file bytes from disk. A `fetch(localUri).blob()` PUT body
  // does NOT survive React Native's fetch — the blob serializes to a tiny
  // placeholder and S3 stores a ~14-byte non-image. UploadTask sends the file
  // as-is (BINARY_CONTENT) and also avoids the slow base64 blob round-trip.
  const task = new UploadTask(new File(attachment.localUri), url, {
    httpMethod: 'PUT',
    uploadType: UploadType.BINARY_CONTENT,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(attachment.mimeType ? { 'Content-Type': attachment.mimeType } : {}),
    },
    ...(attachment.mimeType ? { mimeType: attachment.mimeType } : {}),
  });
  const res = await task.uploadAsync();
  console.log(`[edgeflare] S3 PUT ${url} → ${res.status}`);
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`S3 upload failed (${res.status}): ${res.body}`);
  }

  // Store the bucket-relative path (not the full URL); display resolves it.
  return { remoteUrl: storedPath(key), storagePath: key };
}

export async function deleteRemoteAttachment(storagePath: string): Promise<void> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated');
  const res = await fetch(objectUrl(storagePath), {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  // Treat "already gone" as success.
  if (!res.ok && res.status !== 404) {
    throw new Error(`S3 delete failed (${res.status})`);
  }
}
