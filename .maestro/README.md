# E2E tests (Maestro)

End-to-end flows for the critical paths (§61, §62).

## Prerequisites

1. Install Maestro: https://maestro.mobile.dev
2. Build and install a dev build on a simulator/emulator or device
   (`npx expo run:ios` / `npx expo run:android`).
3. Set an app identifier in `app.json` (`ios.bundleIdentifier` /
   `android.package`) — the flows read it via the `APP_ID` env var.

## Run

```bash
maestro test --env APP_ID=com.yourorg.edgenote .maestro/create-note.yaml
maestro test --env APP_ID=com.yourorg.edgenote .maestro/search-and-delete.yaml
```

## Flows

- `create-note.yaml` — create a note, leave the editor, confirm it persists.
- `search-and-delete.yaml` — search, open a result, delete it.

Flows tap controls by their accessibility labels (e.g. "New note",
"Search notes", "Note actions"), which the app sets on every interactive
control, so they double as an accessibility check.
