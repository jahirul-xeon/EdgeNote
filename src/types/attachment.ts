export type AttachmentType = 'image' | 'video' | 'audio' | 'file';

export type UploadStatus = 'pending' | 'uploading' | 'uploaded' | 'failed';

export type Attachment = {
  id: string;
  noteId: string;
  type: AttachmentType;
  /** Local file URI (persisted copy). Present until purged; primary source. */
  localUri: string | null;
  /** Firebase Storage download URL, once uploaded. */
  remoteUrl: string | null;
  storagePath: string | null;
  name: string | null;
  mimeType: string | null;
  size: number | null;
  width: number | null;
  height: number | null;
  uploadStatus: UploadStatus;
  createdAt: number;
};
