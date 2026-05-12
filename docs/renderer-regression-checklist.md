# Renderer Flow Map And Regression Checklist

## Baseline Flow Map

### Bootstrap
- `App` loads saved mailbox configs through `window.electronAPI`.
- App resolves mailbox maps, persists normalized mailbox list, restores last mailbox/folder from `localStorage`.
- App refreshes folder counts and loads the initial folder.

### Inbox Flow
- Sidebar selection updates selected mailbox/folder and persists those values to `localStorage`.
- App loads folder emails, threads emails, and restores last selected UID per mailbox/folder.
- Selecting an email fetches full content and persists selected UID.
- Infinite scroll requests older emails with `beforeUid`.
- A 60 second poll silently refreshes the open folder while preserving selection.

### Settings Flow
- Settings view reuses `LoginForm` for adding a mailbox.
- Mailbox removal clears persisted folder UID keys and selected mailbox/folder keys when needed.
- Settings can route back to inbox using current or fallback mailbox/folder selection.

### Email Content Flow
- If HTML is available and plaintext thread is simple, message is rendered in iframe with prepared HTML.
- Otherwise, plaintext thread segments are rendered with role inference and CID image support.
- Composer dock mounts TipTap editor and keeps focus behavior.

## Manual Regression Checklist

## Auth And Mailboxes
- [ ] Add mailbox with valid credentials and confirm inbox loads.
- [ ] Add a second mailbox and confirm sidebar shows both.
- [ ] Remove a non-selected mailbox and confirm inbox stays stable.
- [ ] Remove selected mailbox and confirm fallback mailbox selection behavior.
- [ ] Logout clears mailbox list and returns to login form.

## Folder Navigation And Counts
- [ ] Open each folder (`INBOX`, `drafts`, `sent`, `junk`, `bin`, `archive`) for one mailbox.
- [ ] Confirm unread counters still render for counted folders.
- [ ] Open `all inboxes` and confirm aggregated list renders.

## Email List And Selection
- [ ] Click thread rows and nested emails, verify active selection highlight.
- [ ] Scroll to bottom to trigger load-more and verify no duplicate rows.
- [ ] Refresh app and confirm selected mailbox/folder restores.
- [ ] Reopen a folder and confirm last selected UID restores when available.

## Email Rendering
- [ ] Open an HTML-heavy email and confirm iframe content renders with images.
- [ ] Open plaintext thread email and confirm segment ordering and sender labels.
- [ ] Confirm CID inline markers resolve to images when attachments are present.
- [ ] Confirm sent-injected messages retain `found in sent` tag behavior.

## UI Behaviors
- [ ] Drag inbox/content column resizer and confirm width persists after reload.
- [ ] Press `Shift+M` and confirm theme toggles and persists.
- [ ] Open settings with `Escape` handling and return path to inbox.

