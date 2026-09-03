export type Folder = {
  id: string;
  userId: string;
  name: string;
  icon: string | null;
  color: string | null;
  createdAt: number;
  updatedAt: number;
  syncStatus: string;
};

/** A folder plus its active-note count, for list display. */
export type FolderWithCount = Folder & { noteCount: number };
