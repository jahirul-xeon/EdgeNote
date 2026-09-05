/**
 * Attachment capture + local persistence (§22).
 *
 * Picker results live in a cache directory that the OS may clear.
 * Therefore every attachment is copied into the app's persistent
 * document directory BEFORE the attachment is recorded in the DB.
 *
 * The note editor never waits for the network.
 * Upload happens later through the sync engine.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as DocumentPicker from "expo-document-picker";
import { Directory, File, Paths } from "expo-file-system";
import {
  EncodingType,
  StorageAccessFramework,
  getContentUriAsync,
  readAsStringAsync,
  writeAsStringAsync,
} from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import * as IntentLauncher from "expo-intent-launcher";
import * as Sharing from "expo-sharing";
import { Alert, Platform } from "react-native";

import { insertAttachment } from "@/database/attachmentsRepository";
import { resolvePublicUrl } from "@/services/edgeflare/storage";
import type { Attachment, AttachmentType } from "@/types/attachment";
import { createId } from "@/utils/id";

const DIR_NAME = "attachments";

/**
 * Maximum extension length we accept.
 *
 * Examples:
 * pdf
 * jpg
 * jpeg
 * png
 * docx
 * xlsx
 */
const MAX_EXTENSION_LENGTH = 10;

/* =========================================================
   Directory
   ========================================================= */

function attachmentsDir(): Directory {
  const dir = new Directory(Paths.document, DIR_NAME);

  try {
    if (!dir.exists) {
      dir.create();
    }
  } catch (error) {
    console.error("[attach] Failed to create attachments directory", error);
    throw new Error("Unable to create attachment storage directory.");
  }

  return dir;
}

/* =========================================================
   Extension
   ========================================================= */

/**
 * Gets an extension from MIME type.
 *
 * MIME type is preferred over URI because Android DocumentPicker
 * may return provider URIs that do not contain a useful extension.
 */
function extensionFromMimeType(mimeType?: string | null): string | null {
  if (!mimeType) {
    return null;
  }

  const mimeMap: Record<string, string> = {
    "application/pdf": "pdf",

    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      "docx",

    "application/vnd.ms-excel": "xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",

    "application/vnd.ms-powerpoint": "ppt",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation":
      "pptx",

    "application/zip": "zip",
    "application/json": "json",

    "text/plain": "txt",
    "text/csv": "csv",

    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/heic": "heic",
    "image/heif": "heif",

    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "audio/wav": "wav",

    "video/mp4": "mp4",
    "video/quicktime": "mov",
  };

  return mimeMap[mimeType.toLowerCase()] ?? null;
}

/**
 * Gets extension from filename.
 */
function extensionFromName(name?: string | null): string | null {
  if (!name) {
    return null;
  }

  const cleanName = name.split(/[?#]/)[0];

  const lastDot = cleanName.lastIndexOf(".");

  if (lastDot === -1) {
    return null;
  }

  const extension = cleanName
    .slice(lastDot + 1)
    .trim()
    .toLowerCase();

  if (
    !extension ||
    extension.length > MAX_EXTENSION_LENGTH ||
    !/^[a-z0-9]+$/.test(extension)
  ) {
    return null;
  }

  return extension;
}

/**
 * Gets extension from URI.
 */
function extensionFromUri(uri: string): string | null {
  if (!uri) {
    return null;
  }

  try {
    const cleanUri = uri.split(/[?#]/)[0];

    const filename = cleanUri.split("/").pop();

    if (!filename) {
      return null;
    }

    return extensionFromName(filename);
  } catch {
    return null;
  }
}

/**
 * Determines the best extension.
 *
 * Priority:
 *
 * 1. MIME type
 * 2. filename
 * 3. URI
 * 4. bin
 */
function extensionFor(
  uri: string,
  name?: string | null,
  mimeType?: string | null,
): string {
  const mimeExtension = extensionFromMimeType(mimeType);

  if (mimeExtension) {
    return mimeExtension;
  }

  const nameExtension = extensionFromName(name);

  if (nameExtension) {
    return nameExtension;
  }

  const uriExtension = extensionFromUri(uri);

  if (uriExtension) {
    return uriExtension;
  }

  return "bin";
}

/* =========================================================
   Persistent copy
   ========================================================= */

/**
 * Copies a picker source file into the application's
 * persistent document directory.
 *
 * IMPORTANT:
 *
 * We intentionally DO NOT use:
 *
 * fetch(sourceUri)
 * arrayBuffer()
 * Uint8Array(...)
 *
 * because a large PDF can consume a lot of JS memory and
 * potentially crash the application.
 */
async function persistCopy(
  sourceUri: string,
  id: string,
  extension: string,
): Promise<string> {
  if (!sourceUri) {
    throw new Error("Attachment source URI is empty.");
  }

  const directory = attachmentsDir();

  const destination = new File(directory, `${id}.${extension}`);

  console.log("[attach] Persisting file");
  console.log("[attach] Source:", sourceUri);
  console.log("[attach] Destination:", destination.uri);
  console.log("[attach] Extension:", extension);

  try {
    /**
     * Remove an old file with the same ID.
     */
    if (destination.exists) {
      destination.delete();
    }

    /**
     * Create source File object.
     */
    const source = new File(sourceUri);

    /**
     * Native file copy.
     *
     * This avoids loading the entire PDF into JavaScript memory.
     */
    await source.copy(destination);

    /**
     * Verify that the destination exists.
     */
    if (!destination.exists) {
      throw new Error(
        "Attachment copy completed but destination file does not exist.",
      );
    }

    /**
     * Verify that the file isn't empty.
     */
    if (destination.size <= 0) {
      throw new Error("Attachment copy produced an empty file.");
    }

    console.log(`[attach] Successfully persisted ${destination.size} bytes`);

    return destination.uri;
  } catch (error) {
    console.error("[attach] Failed to persist attachment:", error);

    /**
     * Clean up a partially-created destination file.
     */
    try {
      if (destination.exists) {
        destination.delete();
      }
    } catch {
      // Best effort cleanup.
    }

    throw new Error(
      `Unable to save attachment: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

/* =========================================================
   Open / share
   ========================================================= */

/**
 * Returns a usable local file URI for an attachment.
 *
 * If the device already has the persisted local copy, that is used. Otherwise
 * (e.g. the row was pulled from the cloud on another device and only has a
 * remote URL) the file is downloaded into the attachments directory first.
 */
export async function ensureLocalUri(attachment: Attachment): Promise<string> {
  if (attachment.localUri) {
    try {
      const existing = new File(attachment.localUri);
      if (existing.exists && existing.size > 0) {
        return attachment.localUri;
      }
    } catch {
      // Fall through to download.
    }
  }

  const url = resolvePublicUrl(attachment.remoteUrl);
  if (!url) {
    throw new Error("This attachment isn't available offline yet.");
  }

  const extension = extensionFor(url, attachment.name, attachment.mimeType);
  const destination = new File(attachmentsDir(), `${attachment.id}.${extension}`);
  if (destination.exists) {
    destination.delete();
  }

  console.log(`[attach] Downloading remote attachment → ${destination.uri}`);
  await File.downloadFileAsync(url, destination);

  if (!destination.exists || destination.size <= 0) {
    throw new Error("Downloaded attachment is empty.");
  }
  return destination.uri;
}

/** Opens the OS share sheet for a local file (used as an Android fallback and
 *  as the iOS path — iOS's sheet includes a Quick Look preview). */
async function shareLocalFile(localUri: string, attachment: Attachment): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("Sharing isn't supported on this device.");
  }
  await Sharing.shareAsync(localUri, {
    mimeType: attachment.mimeType ?? undefined,
    dialogTitle: attachment.name ?? undefined,
    UTI: attachment.mimeType ?? undefined,
  });
}

/**
 * Shares an attachment via the OS share sheet (send to another app). Uses the
 * local file, downloading the cloud copy first when needed.
 */
export async function shareAttachment(attachment: Attachment): Promise<void> {
  const localUri = await ensureLocalUri(attachment);
  await shareLocalFile(localUri, attachment);
}

/** Remembers the user's chosen download folder so we prompt only once. */
const SAF_DIR_KEY = "attach:saf-download-dir";

/**
 * Saves an attachment into the device's shared storage (a real "Download").
 *
 * Android: writes the file into a user-picked folder (e.g. Downloads) via the
 * Storage Access Framework — the folder is chosen once and remembered. iOS has
 * no SAF, so it falls back to the share sheet's "Save to Files".
 */
export async function saveAttachmentToDevice(attachment: Attachment): Promise<void> {
  const localUri = await ensureLocalUri(attachment);
  const extension = extensionFor(localUri, attachment.name, attachment.mimeType);
  const fileName = attachment.name ?? `${attachment.id}.${extension}`;
  const mimeType = attachment.mimeType ?? "application/octet-stream";

  if (Platform.OS !== "android") {
    // iOS: the share sheet offers "Save to Files".
    await shareLocalFile(localUri, attachment);
    return;
  }

  const createInDir = async (dirUri: string): Promise<string> =>
    StorageAccessFramework.createFileAsync(dirUri, fileName, mimeType);

  let dirUri = await AsyncStorage.getItem(SAF_DIR_KEY);
  let destUri: string;
  try {
    if (!dirUri) throw new Error("no-saved-dir");
    destUri = await createInDir(dirUri);
  } catch {
    // No remembered folder, or the grant expired — ask the user to pick one.
    const perm = await StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (!perm.granted) {
      throw new Error("Storage permission was denied.");
    }
    dirUri = perm.directoryUri;
    await AsyncStorage.setItem(SAF_DIR_KEY, dirUri);
    destUri = await createInDir(dirUri);
  }

  const base64 = await readAsStringAsync(localUri, { encoding: EncodingType.Base64 });
  await writeAsStringAsync(destUri, base64, { encoding: EncodingType.Base64 });
  console.log(`[attach] Saved to device: ${fileName}`);
}

/**
 * Opens an attachment for VIEWING, using the local file (downloading it first
 * when the device only has the cloud copy). Works offline.
 *
 * Android uses ACTION_VIEW so the file opens in a real viewer (PDF reader,
 * gallery, …) — NOT a share/upload sheet. A FileProvider `content://` URI plus
 * a read-permission grant are required; a raw `file://` URI throws
 * FileUriExposedException. If no app can view the type, we fall back to the
 * share sheet. iOS uses the share sheet, whose preview acts as Quick Look.
 */
export async function openAttachmentExternally(attachment: Attachment): Promise<void> {
  const localUri = await ensureLocalUri(attachment);

  if (Platform.OS === "android") {
    try {
      const contentUri = await getContentUriAsync(localUri);
      await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
        data: contentUri,
        flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
        type: attachment.mimeType ?? undefined,
      });
      return;
    } catch (error) {
      // No viewer app for this type (ActivityNotFoundException) — offer share.
      console.log("[attach] ACTION_VIEW failed, falling back to share:", String(error));
      await shareLocalFile(localUri, attachment);
      return;
    }
  }

  await shareLocalFile(localUri, attachment);
}

/* =========================================================
   Delete local file
   ========================================================= */

/**
 * Removes an attachment's local file.
 *
 * Best effort.
 *
 * The DB row can still be deleted even if the physical file
 * has already disappeared.
 */
export function deleteLocalFile(localUri: string | null): void {
  if (!localUri) {
    return;
  }

  try {
    const file = new File(localUri);

    if (file.exists) {
      file.delete();

      console.log(`[attach] Deleted local file: ${localUri}`);
    }
  } catch (error) {
    console.warn("[attach] Failed to delete local file:", error);
  }
}

/* =========================================================
   Build Attachment
   ========================================================= */

type AttachmentAsset = {
  uri: string;
  name?: string | null;
  mimeType?: string | null;
  size?: number | null;
  width?: number | null;
  height?: number | null;
};

async function buildAttachment(
  noteId: string,
  type: AttachmentType,
  asset: AttachmentAsset,
): Promise<Attachment> {
  if (!asset.uri) {
    throw new Error("Attachment URI is missing.");
  }

  console.log("[attach] Building attachment:", {
    noteId,
    type,
    uri: asset.uri,
    name: asset.name,
    mimeType: asset.mimeType,
    size: asset.size,
    width: asset.width,
    height: asset.height,
  });

  const id = createId("att");

  const extension = extensionFor(asset.uri, asset.name, asset.mimeType);

  console.log(`[attach] Generated attachment ID: ${id}`);

  console.log(`[attach] Detected extension: ${extension}`);

  /**
   * IMPORTANT:
   *
   * Persist the physical file FIRST.
   */
  const localUri = await persistCopy(asset.uri, id, extension);

  /**
   * Only create the DB row after the physical file
   * has successfully been persisted.
   */
  const attachment: Attachment = {
    id,
    noteId,
    type,

    localUri,

    remoteUrl: null,
    storagePath: null,

    name: asset.name ?? `${type}.${extension}`,

    mimeType: asset.mimeType ?? null,

    size: asset.size ?? null,

    width: asset.width ?? null,

    height: asset.height ?? null,

    uploadStatus: "pending",

    createdAt: Date.now(),
  };

  try {
    await insertAttachment(attachment);

    console.log(`[attach] Attachment inserted into DB: ${id}`);

    return attachment;
  } catch (error) {
    /**
     * DB insertion failed.
     *
     * Remove the already-created physical file so we don't
     * leave orphan files in the document directory.
     */
    console.error("[attach] Failed to insert attachment into DB:", error);

    deleteLocalFile(localUri);

    throw error;
  }
}

/* =========================================================
   Image Library
   ========================================================= */

export async function pickImageFromLibrary(
  noteId: string,
): Promise<Attachment | null> {
  try {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert(
        "Permission needed",
        "Allow photo access to add images to notes.",
      );

      return null;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,

      /**
       * Only select one image.
       */
      allowsMultipleSelection: false,
    });

    if (result.canceled || !result.assets || result.assets.length === 0) {
      return null;
    }

    const asset = result.assets[0];

    console.log("[attach] Image selected:", {
      uri: asset.uri,
      fileName: asset.fileName,
      mimeType: asset.mimeType,
      fileSize: asset.fileSize,
      width: asset.width,
      height: asset.height,
    });

    return await buildAttachment(noteId, "image", {
      uri: asset.uri,
      name: asset.fileName,
      mimeType: asset.mimeType,
      size: asset.fileSize,
      width: asset.width,
      height: asset.height,
    });
  } catch (error) {
    console.error("[attach] Image library failed:", error);

    Alert.alert(
      "Attachment failed",
      "Unable to add this image. Please try again.",
    );

    return null;
  }
}

/* =========================================================
   Camera
   ========================================================= */

export async function takePhoto(noteId: string): Promise<Attachment | null> {
  try {
    const permission = await ImagePicker.requestCameraPermissionsAsync();

    if (!permission.granted) {
      Alert.alert("Permission needed", "Allow camera access to take photos.");

      return null;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.8,
    });

    if (result.canceled || !result.assets || result.assets.length === 0) {
      return null;
    }

    const asset = result.assets[0];

    console.log("[attach] Camera image:", {
      uri: asset.uri,
      fileName: asset.fileName,
      mimeType: asset.mimeType,
      fileSize: asset.fileSize,
      width: asset.width,
      height: asset.height,
    });

    return await buildAttachment(noteId, "image", {
      uri: asset.uri,
      name: asset.fileName,
      mimeType: asset.mimeType,
      size: asset.fileSize,
      width: asset.width,
      height: asset.height,
    });
  } catch (error) {
    console.error("[attach] Camera failed:", error);

    Alert.alert(
      "Attachment failed",
      "Unable to take or save the photo. Please try again.",
    );

    return null;
  }
}

/* =========================================================
   Document Picker
   ========================================================= */

export async function pickDocument(noteId: string): Promise<Attachment | null> {
  try {
    console.log("[attach] Opening document picker");

    const result = await DocumentPicker.getDocumentAsync({
      /**
       * Allow PDF, DOCX, XLSX, etc.
       */
      type: "*/*",

      /**
       * Ask Expo to copy the selected document into
       * the app cache before returning the URI.
       *
       * We STILL copy it again into Paths.document
       * because cache storage is not persistent.
       */
      copyToCacheDirectory: true,

      /**
       * We only want one file.
       */
      multiple: false,
    });

    console.log("[attach] Document picker result:", {
      canceled: result.canceled,
      assetCount: result.assets?.length ?? 0,
    });

    if (result.canceled || !result.assets || result.assets.length === 0) {
      return null;
    }

    const asset = result.assets[0];

    console.log("[attach] Document selected:", {
      uri: asset.uri,
      name: asset.name,
      mimeType: asset.mimeType,
      size: asset.size,
    });

    /**
     * Make sure we have a valid URI.
     */
    if (!asset.uri) {
      throw new Error("Document picker returned an empty URI.");
    }

    /**
     * Persist the document before inserting it into DB.
     */
    return await buildAttachment(noteId, "file", {
      uri: asset.uri,
      name: asset.name,
      mimeType: asset.mimeType,
      size: asset.size,
    });
  } catch (error) {
    console.error("[attach] Document picker failed:", error);

    Alert.alert(
      "Attachment failed",
      error instanceof Error
        ? error.message
        : "Unable to attach this document. Please try again.",
    );

    return null;
  }
}
