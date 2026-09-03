# iOS Notes–Inspired React Native Expo App — Full Implementation Plan

> **Goal:** Build a polished notes app inspired by the structure, interactions, and simplicity of Apple's Notes app, while using original branding/assets and avoiding copying proprietary Apple implementation or artwork.
>
> **Stack:** React Native + Expo + TypeScript + React Native Navigation + Firebase/Cloud Firestore + local persistence + Expo Liquid Glass capabilities.

---

## 1. Product Vision

Build an offline-first notes application with:

- Fast note creation and editing
- Notes list with search
- Folders
- Pinned notes
- Trash / recently deleted
- Rich text formatting
- Checklists
- Images/attachments
- Tags
- Note locking as a future feature
- Automatic local persistence
- Automatic cloud synchronization
- Conflict-safe sync behavior
- iOS-style animations and visual hierarchy
- Liquid Glass UI on supported iOS versions
- Android fallback UI that keeps the same product language

The core principle is:

> **The local database is the source of immediate truth; Firebase is the synchronization layer.**

The user should never have to wait for the network to create or edit a note.

---

# 2. Recommended Architecture

```text
                    ┌──────────────────────┐
                    │      React Native    │
                    │        Expo App      │
                    └──────────┬───────────┘
                               │
                    ┌──────────▼───────────┐
                    │    UI / Screens      │
                    │ Navigation + Glass   │
                    └──────────┬───────────┘
                               │
                    ┌──────────▼───────────┐
                    │     App Services     │
                    │ Notes / Folders /    │
                    │ Search / Sync        │
                    └──────────┬───────────┘
                               │
             ┌─────────────────┴─────────────────┐
             │                                   │
    ┌────────▼────────┐                ┌────────▼────────┐
    │ Local Database  │                │ Firebase        │
    │ Offline Store   │◄── Sync ─────►│ Firestore       │
    └─────────────────┘                └─────────────────┘
```

### Important architecture decision

Do **not** build the application so that every screen directly reads/writes Firestore.

Instead:

```text
Screen
  ↓
Hook
  ↓
Repository / Service
  ↓
Local Store
  ↓
Sync Engine
  ↓
Firestore
```

This keeps the application testable and makes offline behavior much easier to control.

---

# 3. Technology Stack

## Core

- React Native
- Expo
- TypeScript
- React Native Navigation (`react-native-navigation`)
- React hooks
- Context only where appropriate

React Native Navigation is a native navigation solution for iOS and Android. It requires native integration, so plan for development builds rather than treating the project as an Expo Go-only application.

## Backend

- Firebase Authentication
- Cloud Firestore
- Firebase Storage
- Firebase Cloud Functions if server-side processing is required

## Local persistence

Recommended architecture:

### Primary local store

Use **SQLite** through Expo's SQLite support for structured offline data.

Why:

- Notes can grow large
- Search needs structured querying
- Folders/tags/notes are relational concepts
- Thousands of notes should remain manageable
- Explicit sync metadata is easier to manage

Use AsyncStorage only for small preferences such as:

```text
theme
sort order
last selected folder
editor preferences
onboarding completed
```

Do not use AsyncStorage as the main note database.

---

# 4. Firebase Architecture

Use:

```text
Firebase Authentication
        │
        ▼
Cloud Firestore
        │
        ├── users
        ├── users/{uid}/notes
        ├── users/{uid}/folders
        ├── users/{uid}/tags
        └── users/{uid}/settings
```

For attachments:

```text
Firebase Storage

/users/{uid}/notes/{noteId}/attachments/{attachmentId}
```

---

# 5. Firestore Data Model

## User

```ts
type UserProfile = {
  id: string;
  email?: string;
  displayName?: string;
  photoURL?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};
```

---

## Note

```ts
type Note = {
  id: string;

  userId: string;

  title: string;

  content: string;

  contentFormat: 'plain' | 'rich' | 'markdown';

  folderId: string | null;

  tags: string[];

  isPinned: boolean;

  isLocked: boolean;

  isDeleted: boolean;

  createdAt: Timestamp;

  updatedAt: Timestamp;

  deletedAt: Timestamp | null;

  syncVersion: number;

  deviceId: string;

  attachments: NoteAttachment[];
};
```

---

## Attachment

```ts
type NoteAttachment = {
  id: string;

  type: 'image' | 'video' | 'audio' | 'file';

  localUri?: string;

  remoteUrl?: string;

  storagePath?: string;

  width?: number;

  height?: number;

  duration?: number;

  createdAt: Timestamp;
};
```

---

## Folder

```ts
type Folder = {
  id: string;

  userId: string;

  name: string;

  icon?: string;

  color?: string;

  createdAt: Timestamp;

  updatedAt: Timestamp;
};
```

---

## Tag

```ts
type Tag = {
  id: string;

  userId: string;

  name: string;

  createdAt: Timestamp;
};
```

---

# 6. Local Database Schema

Use SQLite.

### notes

```sql
CREATE TABLE notes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  content_format TEXT NOT NULL DEFAULT 'plain',
  folder_id TEXT,
  tags_json TEXT NOT NULL DEFAULT '[]',
  is_pinned INTEGER NOT NULL DEFAULT 0,
  is_locked INTEGER NOT NULL DEFAULT 0,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  sync_status TEXT NOT NULL DEFAULT 'synced',
  sync_version INTEGER NOT NULL DEFAULT 0,
  device_id TEXT NOT NULL
);
```

### sync_queue

```sql
CREATE TABLE sync_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  entity_type TEXT NOT NULL,

  entity_id TEXT NOT NULL,

  operation TEXT NOT NULL,

  payload_json TEXT NOT NULL,

  created_at INTEGER NOT NULL,

  retry_count INTEGER NOT NULL DEFAULT 0,

  last_error TEXT
);
```

### folders

```sql
CREATE TABLE folders (
  id TEXT PRIMARY KEY,

  user_id TEXT NOT NULL,

  name TEXT NOT NULL,

  icon TEXT,

  color TEXT,

  created_at INTEGER NOT NULL,

  updated_at INTEGER NOT NULL,

  sync_status TEXT NOT NULL DEFAULT 'synced'
);
```

---

# 7. Offline-First Strategy

Every user action should work without internet.

Example:

```text
User taps "New Note"
       ↓
Create note locally
       ↓
Render immediately
       ↓
Add operation to sync_queue
       ↓
If online → upload
If offline → wait
       ↓
Network restored
       ↓
Sync engine processes queue
```

For editing:

```text
Edit text
   ↓
Update local SQLite
   ↓
Update UI immediately
   ↓
Mark note as pending_sync
   ↓
Queue Firestore update
```

This creates the feeling of a native notes application.

---

# 8. Firestore Offline Persistence

Cloud Firestore itself supports offline persistence and synchronizes locally changed data when connectivity returns.

However, for this project, still maintain an explicit local SQLite layer because it gives you:

- predictable local queries
- explicit sync state
- a durable sync queue
- control over search/indexing
- easier conflict handling
- easier debugging

Firestore can therefore act as the remote synchronization backend rather than being the only local storage mechanism.

---

# 9. Sync Engine

Create:

```text
src/services/sync/
```

Files:

```text
syncEngine.ts
syncQueue.ts
syncNotes.ts
syncFolders.ts
conflictResolver.ts
networkMonitor.ts
```

---

## Sync lifecycle

```text
APP START
   ↓
Initialize local DB
   ↓
Load local data
   ↓
Initialize Firebase
   ↓
Check authentication
   ↓
Check network
   ↓
Process pending queue
   ↓
Pull remote changes
   ↓
Resolve conflicts
   ↓
Mark synchronized
```

---

# 10. Network Monitoring

Use:

```text
@react-native-community/netinfo
```

When network changes:

```ts
if (isOnline) {
  syncEngine.start();
}
```

Do not run multiple sync jobs simultaneously.

Use a lock:

```ts
let syncRunning = false;

async function sync() {
  if (syncRunning) return;

  syncRunning = true;

  try {
    await pushLocalChanges();
    await pullRemoteChanges();
  } finally {
    syncRunning = false;
  }
}
```

---

# 11. Sync Status

Every note should have one of:

```ts
type SyncStatus =
  | 'synced'
  | 'pending'
  | 'syncing'
  | 'failed';
```

UI:

```text
Saved
Saving...
Offline
Syncing...
Couldn't sync
```

Avoid showing technical errors to normal users.

---

# 12. Conflict Resolution

For MVP:

```text
Last-write-wins
```

But use timestamps generated carefully.

Recommended fields:

```text
updatedAt
deviceId
syncVersion
```

Conflict comparison:

```text
newer updatedAt wins
```

If timestamps are equal:

```text
higher syncVersion wins
```

For future collaborative editing, replace this with an operation-based system or CRDT.

Do not attempt real-time collaborative editing in V1.

---

# 13. App Navigation

Use React Native Navigation.

Navigation structure:

```text
Root
│
├── Auth
│   ├── Welcome
│   ├── SignIn
│   └── SignUp
│
└── Main
    │
    ├── NotesHome
    │
    ├── FolderList
    │
    ├── Search
    │
    └── Settings
```

Modal screens:

```text
NoteEditor
FolderEditor
TagManager
ShareSheet
AttachmentPicker
DeleteConfirmation
NoteActions
```

---

# 14. Main App Layout

The home screen should feel similar to a modern iOS notes application without directly copying Apple's proprietary UI.

```text
┌───────────────────────────────────┐
│ Notes                         ⋯   │
│                                   │
│ 🔍 Search                         │
│                                   │
│ Pinned                            │
│ ┌──────────────┐ ┌──────────────┐ │
│ │ Project      │ │ Shopping     │ │
│ │ ideas...     │ │ milk...      │ │
│ └──────────────┘ └──────────────┘ │
│                                   │
│ Notes                             │
│                                   │
│ Meeting notes                     │
│ Today • 10:32 AM                  │
│                                   │
│ React Native ideas                │
│ Yesterday • 9:10 PM               │
│                                   │
│                         ＋         │
└───────────────────────────────────┘
```

---

# 15. Screens

## 15.1 Home

Features:

- Search
- Pinned section
- Recent notes
- Folders
- Trash
- New note button
- Multi-select mode

---

## 15.2 Note Editor

Layout:

```text
← Back                         ⋯

Title

Start writing...

──────────────────────────────

Formatting toolbar
```

Features:

- Auto-save
- Undo / redo
- Bold
- Italic
- Underline
- Strikethrough
- Heading
- Bullet list
- Numbered list
- Checklist
- Quote
- Link
- Image
- Camera
- Attachment

---

# 16. Editor Architecture

Do not store formatted UI markup directly in SQLite.

Store a structured representation.

MVP:

```ts
type NoteContent = {
  blocks: ContentBlock[];
};
```

Example:

```ts
type ContentBlock =
  | {
      type: 'paragraph';
      text: string;
    }
  | {
      type: 'heading';
      level: 1 | 2 | 3;
      text: string;
    }
  | {
      type: 'bullet';
      text: string;
    }
  | {
      type: 'checklist';
      text: string;
      checked: boolean;
    }
  | {
      type: 'image';
      attachmentId: string;
    };
```

For V1, a simpler Markdown-like internal format is also acceptable if you want to move faster.

---

# 17. Search

Search should work offline.

SQLite indexes:

```text
title
content
updated_at
folder_id
is_pinned
is_deleted
```

Search flow:

```text
User types
    ↓
Debounce 150–250ms
    ↓
SQLite query
    ↓
Render results
```

Search should not depend on Firebase.

---

# 18. Folders

Default folders:

```text
All Notes
Pinned
Recently Deleted
```

User-created:

```text
Work
Personal
Projects
Ideas
Travel
```

Actions:

- Create
- Rename
- Delete
- Move note
- Show note count

---

# 19. Tags

Support:

```text
#work
#idea
#meeting
#todo
```

Tag search:

```text
Search → Tags
```

Future:

```text
Tag suggestions
Tag cloud
Smart tag filtering
```

---

# 20. Pinned Notes

Pinning is local-first:

```text
tap pin
 ↓
SQLite update
 ↓
UI updates
 ↓
sync_queue
 ↓
Firestore
```

Pinned notes should appear at the top.

---

# 21. Trash

Deleting a note should initially be a soft delete.

```ts
isDeleted = true
deletedAt = now
```

Trash screen:

```text
Recently Deleted

Note A
Deleted 2 days ago

Note B
Deleted 10 minutes ago
```

Actions:

- Restore
- Delete permanently

Optional future feature:

```text
Automatically permanently delete after 30 days
```

---

# 22. Attachments

Use:

```text
expo-image-picker
expo-camera
expo-document-picker
expo-file-system
```

Upload process:

```text
Select image
    ↓
Save local file
    ↓
Create attachment record
    ↓
Display immediately
    ↓
Upload to Firebase Storage
    ↓
Save remote URL
    ↓
Sync note metadata
```

Important:

Never block the note editor while an attachment uploads.

---

# 23. Liquid Glass UI

Use Expo's current Liquid Glass capabilities where supported.

Recommended packages/APIs:

```text
expo-glass-effect
@expo/ui
```

Expo provides native Liquid Glass support for iOS 26 through `expo-glass-effect`, while Expo UI exposes SwiftUI primitives and Liquid Glass modifiers.

Use Liquid Glass selectively.

Good places:

- Floating new-note button
- Toolbar
- Bottom action bar
- Context menus
- Floating controls
- Sheets
- Navigation-related UI where native behavior is appropriate

Do **not** put glass on every card.

Too much glass makes the UI visually noisy and hurts readability.

---

# 24. Glass Design System

Create:

```text
src/components/glass/
```

Components:

```text
GlassView
GlassButton
GlassToolbar
GlassCard
GlassSheet
GlassIconButton
```

Example architecture:

```tsx
<GlassView>
  <Pressable>
    <Icon />
  </Pressable>
</GlassView>
```

For supported iOS versions:

```text
Liquid Glass
```

Fallback:

```text
regular translucent surface
```

Android:

```text
Material-inspired translucent surface
```

The application must never become unusable when Liquid Glass is unavailable.

---

# 25. Design Tokens

Create:

```text
src/theme/
  colors.ts
  spacing.ts
  typography.ts
  radii.ts
  shadows.ts
  animations.ts
```

Example:

```ts
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};
```

Typography:

```text
Large Title
Title
Headline
Body
Callout
Subheadline
Footnote
Caption
```

Keep the typography hierarchy simple and native-feeling.

---

# 26. Animations

Use:

```text
react-native-reanimated
```

Animations:

### New note

```text
FAB
 ↓
scale + opacity
 ↓
editor appears
```

### Delete

```text
note
 ↓
translate + fade
 ↓
remove
```

### Search

```text
search bar
 ↓
expand
 ↓
focus
```

### Folder opening

```text
small transition
 ↓
folder list
```

Avoid excessive animation.

---

# 27. Project Structure

```text
ios-notes-clone/
│
├── app/
│
├── src/
│   │
│   ├── components/
│   │   ├── common/
│   │   ├── notes/
│   │   ├── folders/
│   │   ├── search/
│   │   └── glass/
│   │
│   ├── screens/
│   │   ├── auth/
│   │   ├── home/
│   │   ├── notes/
│   │   ├── folders/
│   │   ├── search/
│   │   └── settings/
│   │
│   ├── navigation/
│   │   ├── index.ts
│   │   ├── rootNavigation.ts
│   │   └── routes.ts
│   │
│   ├── database/
│   │   ├── database.ts
│   │   ├── migrations/
│   │   ├── notesRepository.ts
│   │   ├── foldersRepository.ts
│   │   └── syncRepository.ts
│   │
│   ├── services/
│   │   ├── firebase/
│   │   ├── sync/
│   │   ├── attachments/
│   │   ├── search/
│   │   └── network/
│   │
│   ├── hooks/
│   │   ├── useNotes.ts
│   │   ├── useNote.ts
│   │   ├── useSearch.ts
│   │   ├── useNetworkStatus.ts
│   │   └── useSyncStatus.ts
│   │
│   ├── store/
│   │
│   ├── types/
│   │   ├── note.ts
│   │   ├── folder.ts
│   │   ├── attachment.ts
│   │   └── sync.ts
│   │
│   ├── theme/
│   │
│   ├── utils/
│   │
│   └── config/
│
├── assets/
│
├── firebase/
│   ├── firestore.rules
│   ├── storage.rules
│   └── functions/
│
├── app.json
├── eas.json
├── package.json
└── tsconfig.json
```

---

# 28. State Management

Do not put everything into one global state.

Recommended:

### Server/remote state

Handled by repositories + sync service.

### Local UI state

React state.

### Shared app state

Use Zustand if needed.

Examples:

```text
selectedFolder
searchQuery
editorMode
syncStatus
currentUser
```

### Persistent preferences

AsyncStorage.

---

# 29. Authentication

V1:

```text
Email/password
Google
Apple
```

Optional later:

```text
Anonymous account
Magic link
```

Flow:

```text
App launch
 ↓
Firebase auth listener
 ↓
Authenticated?
 ├── yes → Main
 └── no  → Auth
```

---

# 30. Firestore Security Rules

Every document must belong to the authenticated user.

Concept:

```text
request.auth.uid == userId
```

Never trust `userId` coming from the client without security rules.

Also secure Firebase Storage paths:

```text
/users/{uid}/...
```

Only the authenticated owner can read/write their files.

---

# 31. Sync Algorithm

## Push

```text
1. Read pending sync_queue items.
2. Group related operations where possible.
3. Upload attachments first.
4. Write note/folder changes.
5. Mark queue item completed.
6. Update local sync_status.
```

## Pull

```text
1. Query remote changes after lastSyncAt.
2. Compare local record.
3. Resolve conflicts.
4. Write remote winner locally.
5. Update lastSyncAt.
```

Store:

```text
lastSyncAt
```

per authenticated user/device.

---

# 32. Sync Queue Example

When creating a note:

```json
{
  "entityType": "note",
  "entityId": "note_123",
  "operation": "create",
  "payload": {
    "title": "My Note",
    "content": "Hello"
  }
}
```

When updating:

```json
{
  "entityType": "note",
  "entityId": "note_123",
  "operation": "update",
  "payload": {
    "title": "Updated title"
  }
}
```

When deleting:

```json
{
  "entityType": "note",
  "entityId": "note_123",
  "operation": "delete",
  "payload": {}
}
```

---

# 33. Error Handling

Never lose a user's note because Firebase failed.

Bad:

```text
save note
 ↓
Firebase fails
 ↓
throw error
 ↓
user loses work
```

Correct:

```text
save locally
 ↓
queue sync
 ↓
Firebase fails
 ↓
keep note locally
 ↓
retry later
```

Retry strategy:

```text
1st failure → 2 seconds
2nd → 5 seconds
3rd → 15 seconds
4th → 30 seconds
5th → 1 minute
```

Then wait for:

```text
network restoration
app foreground
manual retry
```

---

# 34. App Lifecycle

When app enters foreground:

```text
AppState active
    ↓
check network
    ↓
sync
```

When app goes background:

```text
flush critical local changes
```

Do not assume a long-running background sync will always complete on mobile.

---

# 35. Performance Strategy

Use:

```text
FlashList
```

for large note lists.

Optimize:

- Note list rows
- Images
- Search
- Editor updates
- SQLite queries

Do not rerender the entire notes list for every keystroke.

Editor should update its own local state and debounce persistence.

Example:

```text
Typing
 ↓
local editor state
 ↓
250–500ms debounce
 ↓
SQLite update
 ↓
sync queue
```

---

# 36. Autosave

Target:

```text
User types
 ↓
debounce 400ms
 ↓
save locally
```

Also save on:

```text
keyboard dismiss
screen blur
navigation away
app background
```

---

# 37. Note Sorting

Default:

```text
Pinned first
then updatedAt descending
```

Options:

```text
Last edited
Created date
Title A-Z
Title Z-A
```

Persist the selected sorting preference locally.

---

# 38. Home Screen Sections

Recommended:

```text
Header

Search

Pinned

Recent Notes

Folders

Recently Deleted
```

For large collections, don't render every section simultaneously.

Use lazy lists.

---

# 39. Context Menu

Long press a note:

```text
Pin
Unpin
Move
Share
Duplicate
Lock
Delete
```

For folders:

```text
Rename
Delete
Share
```

---

# 40. Sharing

Use:

```text
expo-sharing
```

Support:

```text
Share as text
Share as PDF
Share note content
```

Future:

```text
Share editable note
```

---

# 41. Settings

Screen:

```text
Settings

Account
────────────

Appearance
  Theme
  Use system appearance

Editor
  Default font
  Checklist behavior

Sync
  Last synced
  Sync now

Storage
  Storage used
  Clear local cache

About
  Version
  Privacy
  Terms
```

---

# 42. Theme

Support:

```text
System
Light
Dark
```

Dark mode should not simply invert colors.

Define a dedicated dark palette.

---

# 43. Accessibility

Required:

- Dynamic font sizing
- VoiceOver labels
- TalkBack labels
- Minimum touch target ~44pt
- High contrast
- Reduce motion support
- Reduce transparency fallback
- Keyboard navigation where applicable

Liquid Glass should never be the only visual distinction for important controls.

---

# 44. iOS 26 Strategy

Use Liquid Glass progressively.

Recommended:

```text
iOS 26+
    ↓
native Liquid Glass

older iOS
    ↓
regular translucent UI

Android
    ↓
Android-compatible glass/translucent UI
```

Do not make the whole app depend on iOS-only components.

Create platform-aware wrappers.

---

# 45. Expo Configuration

Target a modern Expo SDK compatible with the currently installed React Native version.

Example packages to evaluate:

```bash
npx expo install expo-sqlite
npx expo install expo-file-system
npx expo install expo-image-picker
npx expo install expo-camera
npx expo install expo-document-picker
npx expo install expo-sharing
npx expo install expo-glass-effect
npx expo install @expo/ui
npx expo install expo-constants
npx expo install expo-device
```

Navigation:

```bash
yarn add react-native-navigation
```

Firebase:

```bash
yarn add firebase
```

Additional:

```bash
yarn add @react-native-community/netinfo
yarn add zustand
yarn add react-native-reanimated
```

For native React Native Navigation integration, follow its current installation instructions and use an Expo development build/EAS workflow.

---

# 46. Environment Variables

Create:

```text
.env
```

Example:

```env
EXPO_PUBLIC_FIREBASE_API_KEY=
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=
EXPO_PUBLIC_FIREBASE_PROJECT_ID=
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
EXPO_PUBLIC_FIREBASE_APP_ID=
```

Important:

Firebase client configuration values are not secret credentials.

Security must come from:

```text
Firebase Authentication
Firestore Rules
Storage Rules
```

Never put:

```text
service account JSON
private keys
Admin SDK credentials
```

inside the Expo application.

---

# 47. Firebase Initialization

Create:

```text
src/services/firebase/firebaseConfig.ts
src/services/firebase/firebaseAuth.ts
src/services/firebase/firestore.ts
src/services/firebase/storage.ts
```

Keep Firebase access behind service functions.

Example architecture:

```ts
createRemoteNote(note)
updateRemoteNote(note)
deleteRemoteNote(note)
getRemoteNotes()
```

Screens should not directly call:

```ts
setDoc()
deleteDoc()
```

---

# 48. Repository Pattern

Create:

```text
notesRepository.ts
```

API:

```ts
getNotes()
getNote(id)
createNote(input)
updateNote(id, patch)
deleteNote(id)
restoreNote(id)
searchNotes(query)
pinNote(id)
moveNote(id, folderId)
```

The repository decides:

```text
local database
+
sync queue
```

The UI does not need to know how storage works.

---

# 49. Development Phases

## Phase 1 — Project Setup

Tasks:

- Create Expo project
- Configure TypeScript
- Configure React Native Navigation
- Configure development build
- Configure Reanimated
- Configure Firebase
- Create environment config
- Create base theme
- Create folder structure

Deliverable:

```text
App launches successfully
```

---

# 50. Phase 2 — Local Database

Implement:

- SQLite
- migrations
- notes table
- folders table
- sync queue
- repositories

Test:

```text
Create note
Edit note
Delete note
Restart app
Data remains
```

---

# 51. Phase 3 — Notes UI

Implement:

- Home screen
- Note list
- Note row
- Empty state
- New note
- Note editor
- Autosave

Deliverable:

```text
Fully functional offline notes app
```

---

# 52. Phase 4 — Search

Implement:

- Search UI
- Debounced search
- SQLite search
- Highlight matching text
- Empty state

Deliverable:

```text
Fast offline search
```

---

# 53. Phase 5 — Folders

Implement:

- Folder list
- Create folder
- Rename
- Delete
- Move note
- Folder filtering

---

# 54. Phase 6 — Firebase Auth

Implement:

- Login
- Register
- Logout
- Auth state
- User document

---

# 55. Phase 7 — Firebase Sync

Implement:

- Network monitor
- Sync queue
- Push changes
- Pull changes
- Retry
- Conflict resolution
- Sync status UI

Test:

```text
Online → create
Offline → edit
Offline → restart
Online → sync
Second device → receives changes
```

---

# 56. Phase 8 — Attachments

Implement:

- Image picker
- Camera
- File picker
- Local attachment storage
- Firebase Storage
- Upload queue
- Thumbnail generation

---

# 57. Phase 9 — Liquid Glass

Implement:

- Glass button
- Glass toolbar
- Glass sheet
- Glass FAB
- Glass context menu

Then test:

```text
iOS 26
older iOS
Android
```

---

# 58. Phase 10 — Advanced Editor

Implement:

- Bold
- Italic
- Underline
- Lists
- Checklist
- Headings
- Links
- Images
- Quotes
- Undo/redo

---

# 59. Phase 11 — Polish

Implement:

- Animations
- Haptics
- Dark mode
- Accessibility
- Empty states
- Loading states
- Error states
- Skeletons
- Swipe actions

---

# 60. Phase 12 — Testing

Test matrix:

| Scenario | Expected |
|---|---|
| Create online | Saves locally + syncs |
| Create offline | Saves locally |
| Edit offline | Saves locally |
| Restart offline | Data remains |
| Reconnect | Sync starts |
| Firebase failure | Note remains locally |
| Two devices | Changes synchronize |
| Delete offline | Delete syncs later |
| Restore offline | Restore syncs later |
| Upload image offline | Queued |
| Upload image online | Uploaded |
| App background | Local changes preserved |
| App force close | Local changes preserved |

---

# 61. Testing Tools

Unit:

```text
Jest
```

Component:

```text
React Native Testing Library
```

E2E:

```text
Maestro
```

Focus E2E tests on:

```text
create note
edit note
search
delete
restore
offline
online sync
authentication
```

---

# 62. Critical Offline Test

This must pass before release:

```text
1. Start online.
2. Create "Test Note".
3. Confirm sync.
4. Disable network.
5. Edit note 10 times.
6. Kill app.
7. Relaunch offline.
8. Confirm latest text exists.
9. Enable network.
10. Confirm Firebase receives latest version.
11. Open another device.
12. Confirm latest version appears.
```

---

# 63. Security Checklist

- Firebase Auth required
- Firestore rules tested
- Storage rules tested
- User isolation tested
- No service-account keys in app
- No admin SDK in client
- Validate attachment size
- Validate attachment MIME type
- Sanitize rich content
- Avoid arbitrary HTML execution
- Secure deleted data behavior

---

# 64. Performance Targets

Target:

```text
App launch → usable < 2 seconds on a normal device
Create note → visually immediate
Typing → no noticeable lag
Search → < 150ms for normal local datasets
Opening note → < 100ms after local data exists
```

These are engineering targets, not guarantees.

---

# 65. MVP Feature List

### Must have

- [x] Create note
- [x] Edit note
- [x] Delete note
- [x] Restore note
- [x] Pin note
- [x] Search
- [x] Folders
- [x] Offline persistence
- [x] Firebase authentication
- [x] Firebase sync
- [x] Conflict handling
- [x] Dark mode
- [x] Liquid Glass UI
- [x] Autosave

### V1

- [ ] Rich text
- [ ] Checklists
- [ ] Images
- [ ] Attachments
- [ ] Tags
- [ ] Sharing
- [ ] Swipe actions
- [ ] Haptics

### V2

- [ ] Note locking
- [ ] Face ID / Touch ID
- [ ] OCR
- [ ] Handwriting
- [ ] Audio notes
- [ ] Smart folders
- [ ] AI summaries
- [ ] Collaboration

---

# 66. Implementation Order

Do not build everything simultaneously.

Use this exact order:

```text
1. Expo project
2. React Native Navigation
3. Theme
4. SQLite
5. Note repository
6. Home screen
7. Editor
8. Autosave
9. Search
10. Folders
11. Firebase Auth
12. Firebase Firestore
13. Sync engine
14. Network monitor
15. Conflict resolution
16. Firebase Storage
17. Attachments
18. Rich editor
19. Liquid Glass
20. Animations
21. Accessibility
22. Testing
23. EAS production build
```

---

# 67. Git Branch Strategy

```text
main
│
├── develop
│
├── feature/navigation
├── feature/local-database
├── feature/notes
├── feature/search
├── feature/folders
├── feature/firebase-auth
├── feature/firebase-sync
├── feature/attachments
├── feature/editor
├── feature/liquid-glass
└── feature/polish
```

Commit style:

```text
feat: add local notes repository
feat: add firebase sync queue
fix: preserve edits while offline
feat: add liquid glass toolbar
refactor: move firestore access into repository
test: add offline sync coverage
```

---

# 68. Definition of Done

A feature is complete only when:

```text
UI works
+
Local persistence works
+
Offline works
+
Online works
+
Sync works
+
Error handling works
+
Loading state works
+
Empty state works
+
Accessibility works
+
Tests exist
```

---

# 69. First Development Sprint

Start with this exact scope:

### Sprint 1

```text
[ ] Create Expo project
[ ] Configure TypeScript
[ ] Configure React Native Navigation
[ ] Create theme
[ ] Configure SQLite
[ ] Create notes table
[ ] Create notes repository
[ ] Build Home screen
[ ] Build NoteEditor
[ ] Implement create note
[ ] Implement update note
[ ] Implement delete note
[ ] Implement autosave
[ ] Test app restart persistence
```

### Sprint 1 success condition

You should be able to:

```text
Open app
 ↓
Create note
 ↓
Write text
 ↓
Leave editor
 ↓
Close app
 ↓
Open app
 ↓
Note still exists
```

No Firebase yet.

---

# 70. Sprint 2

```text
[ ] Search
[ ] Folders
[ ] Pinning
[ ] Trash
[ ] Network status
[ ] Sync queue
```

Success:

```text
Entire application works offline.
```

---

# 71. Sprint 3

```text
[ ] Firebase Auth
[ ] Firestore
[ ] Push sync
[ ] Pull sync
[ ] Conflict resolution
[ ] Retry
[ ] Sync status
```

Success:

```text
Offline → online synchronization works reliably.
```

---

# 72. Sprint 4

```text
[ ] Firebase Storage
[ ] Images
[ ] Attachments
[ ] Rich editor
[ ] Checklists
```

---

# 73. Sprint 5

```text
[ ] Liquid Glass
[ ] Animations
[ ] Haptics
[ ] Dark mode
[ ] Accessibility
[ ] Performance
[ ] E2E testing
```

---

# 74. Final Product Architecture

At the end, the application should look like:

```text
                    NOTES APP
                        │
        ┌───────────────┼────────────────┐
        │               │                │
      UI Layer      Local Layer      Remote Layer
        │               │                │
 React Native       SQLite          Firebase
        │               │                │
 Navigation        Repository       Firestore
        │               │                │
 Glass UI          Sync Queue       Storage
        │               │                │
 Animations        Network          Auth
        │               │                │
        └───────────────┼────────────────┘
                        │
                   Sync Engine
                        │
              Offline-first behavior
```

---

# 75. Golden Rule

The most important implementation rule for this project:

> **Never make the user wait for Firebase.**

The application should behave like:

```text
Tap
 ↓
Instant local update
 ↓
UI updates
 ↓
Background synchronization
```

not:

```text
Tap
 ↓
Firebase request
 ↓
Loading
 ↓
Maybe success
 ↓
UI updates
```

That distinction is what will make the app feel like a real native notes application.

---

# 76. Reference Documentation

Use the official documentation as the implementation source of truth:

- Expo Liquid Glass / `expo-glass-effect`
- Expo UI / SwiftUI integration
- Firebase Firestore offline persistence
- React Native Navigation

APIs around Expo's Liquid Glass features are evolving, so pin versions compatible with your selected Expo SDK and verify the current API before implementation.

---

# 77. Immediate Next Step

Start by implementing **Sprint 1 only**.

The first deliverable should contain:

```text
Expo app
+
React Native Navigation
+
SQLite
+
Notes Repository
+
Home Screen
+
Note Editor
+
Autosave
+
Offline persistence
```

Do not start Firebase synchronization until the local-first note system is stable.

