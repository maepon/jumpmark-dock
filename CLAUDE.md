# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Jumpmark Dock is a Chrome Extension (Manifest V3) that allows users to create bidirectional shortcuts between web pages. The extension uses vanilla JavaScript without frameworks and Chrome Storage Sync API for data persistence and synchronization across devices.

**Published on Chrome Web Store**: https://chromewebstore.google.com/detail/jumpmark-dock/ldodfncboddjjbggcholbmkmjbfjmblh

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

**Storage Schema**:
```javascript
{
  "jumpmarks": {
    "normalized-url": [
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
}
```

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

Current status: Phase 3 completed. Full-featured import/export system implemented. Ready for Chrome Web Store submission (v1.1.0).

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
- **Limitations**: `chrome.storage.sync` quotas are 102,400 bytes total, 8,192 bytes per item, 512 items max. All data is stored under the single `jumpmarks` key, so the effective limit is ~8KB total

## AI-Assisted Development Flow (`ai-flow/`)

`ai-flow/` holds a separate, Claude-Code-headless automation pipeline (spec → plan → implement → review → PR) driven by GitHub Issues (`make spec ISSUE=n`, `make impl ISSUE=n` from inside `ai-flow/`). It is tooling for *this repo's own development process*, not part of the extension. See `ai-flow/docs/ai-workflow-setup.md` for setup and day-to-day operation, and `ai-flow/docs/porting-guide.md` if adapting this flow for another repo.

Files under `ai-flow/Makefile`, `ai-flow/scripts/`, `ai-flow/prompts/`, `ai-flow/.claude/`, `ai-flow/docs/` are "tooling" files maintained by humans directly on the default branch — the automated flow refuses to let agent-driven issue work modify them.

## Work Session Continuity

**⚠️ IMPORTANT**: For active development sessions, check `docs/work-session-handoff.md` for:
- Current work status and pending tasks
- Known issues and their fixes
- Detailed technical context for work continuation
- Step-by-step instructions for ongoing development

This ensures seamless continuation of work across sessions and provides complete context for any ongoing development.