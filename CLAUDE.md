# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Jumpmark Dock is a Chrome Extension (Manifest V3) that allows users to create bidirectional shortcuts between web pages. The extension uses vanilla JavaScript without frameworks and Chrome Storage API for data persistence.

**Published on Chrome Web Store**: https://chromewebstore.google.com/detail/jumpmark-dock/ldodfncboddjjbggcholbmkmjbfjmblh

## Development Commands

This is a Chrome extension project with no build process. Development is done directly with the source files:

```bash
# No build/lint/test commands - Chrome extension loads files directly
# Load extension in Chrome: chrome://extensions/ → "Load unpacked" → select project directory
```

## Architecture

### Core Files Structure
- `manifest.json` - Extension configuration and permissions
- `background.js` - Service worker for tab monitoring and badge management
- `popup.html/js/css` - Extension popup interface
- `icons/` - Extension icons (16px, 48px, 128px)

### Key Technical Concepts

**URL Normalization**: All URLs are normalized (removing protocol, www, trailing slashes) for consistent storage and retrieval.

**Bidirectional Linking**: When creating a jumpmark A→B, the system automatically creates B→A. The `bidirectional` flag distinguishes original (true) from auto-generated (false) links.

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
        "bidirectional": true/false,
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
- **Phase 2**: ✅ Editing/deletion functionality, smart tab management (exact URL matching)
- **Phase 3**: ⬜ Auto-favicon, error handling improvements, import/export, search functionality

Current status: Phase 2 complete (v0.1.0). Core functionality fully implemented with editing capabilities.

## Code Conventions

- camelCase for variables and functions
- async/await for asynchronous operations
- Japanese comments are acceptable
- Error handling with try-catch blocks
- Function names start with verbs (e.g., `saveJumpmark`, `displayJumpmarks`)