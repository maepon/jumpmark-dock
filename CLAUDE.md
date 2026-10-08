# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Jumpmark Dock is a Chrome Extension (Manifest V3) that allows users to create bidirectional shortcuts between web pages. The extension uses vanilla JavaScript without frameworks and Chrome Storage Sync API for data persistence and synchronization across devices.

**Published on Chrome Web Store**: https://chromewebstore.google.com/detail/jumpmark-dock/ldodfncboddjjbggcholbmkmjbfjmblh

**README**: `README.md` (Japanese) and `README.en.md` (English) have the same content. When you change one, update the other to match. Some tests check statements in `README.md`.

## Development Commands

This is a Chrome extension project with no build process for the extension itself. Development is done directly with the source files:

```bash
# Load extension in Chrome: chrome://extensions/ → "Load unpacked" → select project directory

# Format check / auto-format (Prettier, covers *.js/*.css/*.html)
npm run format:check
npm run format

# Run the smoke tests (Node's built-in test runner, targets shared.js logic)
npm test
```

## Architecture

### Core Files Structure
- `manifest.json` - Extension configuration and permissions
- `background.js` - Service worker for tab monitoring and badge management
- `popup.html/js/css` - Extension popup interface
- `icons/` - Extension icons (16px, 48px, 128px)

### Key Technical Concepts

**URL Normalization**: All URLs are normalized (removing protocol, www, trailing slashes) for consistent storage and retrieval.

**Bidirectional Linking**: Uses URL-match based detection instead of flags. When creating a jumpmark A→B, an optional reverse jumpmark B→A can be created. Bidirectional relationships are detected dynamically by comparing `sourceUrl` and `url` fields.

**Storage Access**: All access to `chrome.storage` goes through the entry points in `shared.js` (`readJumpmarksStore` / `writeJumpmarksStore` / `onJumpmarksChanged`). Other files must not call `chrome.storage` directly.

**Storage Schema**: `readJumpmarksStore()` returns the following shape (and `writeJumpmarksStore()` accepts it):
```javascript
{
  "normalized-source-url": [
    {
      "id": "unique-id",
      "title": "Display name",
      "url": "target-url",
      "icon": "emoji",
      "sourceUrl": "normalized-source-url",
      "created": "ISO-timestamp"
    }
  ]
}
```

In `chrome.storage.sync` this is split by FNV-1a hash of the source URL into 64 buckets (`jm:<0-63>` head item `{d: {...}}`, plus `jm:<bucket>:<i>` continuation items when a bucket exceeds 8,192 bytes; the head then carries `n` and `r`). `jm:meta` (`{v: 2, legacyIds: [...]}`) records ids already imported from the legacy v2.3.0 single `jumpmarks` item, which is kept (never written or deleted) for old-version compatibility. Only changed buckets are written (one `set`, then at most one `remove`).

### Background Script Responsibilities
- Monitor tab changes (`chrome.tabs.onUpdated`, `chrome.tabs.onActivated`)
- Update badge counts showing number of jumpmarks for current page
- Listen for storage changes and update badges accordingly
- Handle Chrome Sync storage events for real-time synchronization

### Popup Script Responsibilities
- Display current page's jumpmarks
- Handle jumpmark creation with bidirectional linking
- Navigate to target URLs when jumpmarks are clicked
- Manage form states (main view ↔ add form)

## Development Workflow

1. **Testing**: Load unpacked extension in Chrome (`chrome://extensions/`)
2. **Debugging Popup**: Right-click extension icon → "Inspect popup"
3. **Debugging Background**: Extensions page → "Service Worker" link
4. **Storage Inspection**: Chrome DevTools → Application → Storage → Extensions

## Implementation Phases

- **Phase 1**: ✅ Basic popup UI, URL handling, jumpmark storage/display, bidirectional links, badge functionality
- **Phase 2**: ✅ **COMPLETED** - Options page with advanced management, bidirectional system refactor (URL-match based), editing/deletion bug fixes, UI improvements
- **Phase 3**: ✅ **COMPLETED** - Import/export functionality (JSON/CSV/HTML), drag & drop support, duplicate detection, data validation

Current status: v2.4.2 is published on the Chrome Web Store. See `docs/work-session-handoff.md` for unreleased changes and open work.

## Code Conventions

- camelCase for variables and functions
- async/await for asynchronous operations
- Japanese comments are acceptable
- Error handling with try-catch blocks
- Function names start with verbs (e.g., `saveJumpmark`, `displayJumpmarks`)

## Chrome Sync Features

- **Storage API**: Uses `chrome.storage.sync` for automatic synchronization
- **Cross-device sync**: Jumpmarks automatically sync across devices when Chrome Sync is enabled
- **Fallback behavior**: Functions as local storage when Chrome Sync is disabled
- **Limitations**: `chrome.storage.sync` quotas are 102,400 bytes total, 8,192 bytes per item, 512 items max. Data is split across up to 64 bucket items (plus continuation items), so ~100KB is usable in total (about 8KB per Jumpmark). The quota is checked before writing against the post-write state, including the legacy `jumpmarks` item and `jm:meta`

## AI-Assisted Development Flow (`ai-flow/`)

`ai-flow/` holds a separate, Claude-Code-headless automation pipeline (spec → plan → implement → review → PR) driven by GitHub Issues (`make spec ISSUE=n`, `make impl ISSUE=n` from inside `ai-flow/`). It is tooling for *this repo's own development process*, not part of the extension.

- **Source**: `ai-flow/` is [maepon/issue-to-pr-flow](https://github.com/maepon/issue-to-pr-flow) (public, MIT) brought in with `git subtree` (squashed). **Do not edit files under `ai-flow/` in this repository** — not even for urgent fixes. Make changes in issue-to-pr-flow through a PR, tag a release there, then bring the tag in here.
- **Updating**: on a branch from an up-to-date `master`:
  1. Fetch the tag, merge its commit, and check the content:
     ```sh
     tag=vX.Y.Z
     git fetch https://github.com/maepon/issue-to-pr-flow.git "refs/tags/$tag"
     c=$(git rev-parse 'FETCH_HEAD^{commit}')
     git subtree merge --prefix=ai-flow "$c" --squash -m "ai-flow を maepon/issue-to-pr-flow $tag に更新する"
     git diff --stat "$c" HEAD:ai-flow   # must print nothing
     ```
     **Do not use `git subtree pull <url> <tag>`**: it fetches and then reads `FETCH_HEAD` back separately, and if an IDE's automatic fetch runs in between, it brings in this repository's own content as `ai-flow/` without any error (issue-to-pr-flow v0.8.1 changed the steps for this reason)
  2. `ai-flow/scripts/resign-subtree-merge.sh` — **required**: `master` requires signed commits, and the "Squashed 'ai-flow/' …" commit that `git subtree` creates is unsigned (`git subtree` has no signing option). The script recreates the squash commit and the merge commit signed, with the same tree, parents, message, and author, and checks the tree is unchanged before moving `HEAD`. **Do not use `git rebase --rebase-merges --gpg-sign` instead**: it re-runs the merge, and after `git subtree add` it put the files at the repository root
  3. Push, open a PR, and merge it with **"Create a merge commit"** (not squash), so the subtree metadata (`git-subtree-dir` / `git-subtree-split`) stays findable for the next update

  Read the new tag's `CHANGELOG.md` before updating. `ai-flow/tmp/` and `ai-flow/.env` are ignored and survive an update.
- **Docs**: `ai-flow/docs/setup.md` for setup and day-to-day operation; `ai-flow/README.md` for an overview.
- **Project settings**: base branch, test/format commands, output language, extra permissions, and project text embedded into prompts (such as the risk catalog) live in the root `.ai-flow/` directory. This is the only part adapted to this project.
- **Tooling files**: everything under `ai-flow/`, plus the root `.ai-flow/` and `.gitignore`. They are maintained by humans through their own PRs (never mixed into issue work); the automated flow refuses to let agent-driven issue work modify them.

## Work Session Continuity

**⚠️ IMPORTANT**: For active development sessions, check `docs/work-session-handoff.md` for:
- Current work status and pending tasks
- Known issues and their fixes
- Detailed technical context for work continuation
- Step-by-step instructions for ongoing development

This ensures seamless continuation of work across sessions and provides complete context for any ongoing development.