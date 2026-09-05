/**
 * A smart folder's rule. Smart folders auto-populate from a query instead of
 * manual membership. Stored as JSON in `folders.smart_rule` (local-only).
 */
export type SmartRule =
  | { type: 'keyword'; value: string }
  | { type: 'has-attachment' }
  | { type: 'recent'; days: number }
  | { type: 'pinned' };

export type Folder = {
  id: string;
  userId: string;
  name: string;
  icon: string | null;
  color: string | null;
  createdAt: number;
  updatedAt: number;
  syncStatus: string;
  /** Non-null → this is a smart folder populated by the rule. */
  smartRule: SmartRule | null;
};

/** A folder plus its active-note count, for list display. */
export type FolderWithCount = Folder & { noteCount: number };
