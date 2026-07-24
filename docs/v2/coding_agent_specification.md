# Feature Specification: Wildcard URL Support via Advanced Mode (Popup UI & Storage Schema)

## Overview

This specification document outlines the feature implementation for adding Wildcard (Match Pattern) URL Support to Jumpmark Dock.
The goal is to allow users (primarily developers) to bind a single set of links to dynamic URLs (e.g., GitHub repositories, PRs, and Actions workflows like `https://github.com/owner/repo*`) without breaking the core UX of the extension or cluttering the Option Dashboard's bidirectional visual structure.

---

## 1. Core Principles & Architecture

1. **Context Preservation (Popup-driven)**: Users must be able to customize the current page's URL directly within the Popup UI using the Advanced Mode settings.
2. **Strict Separation of Modality**:
   - **Bidirectional (Exact Match)**: `currentUrl === targetUrl` (Default mode).
   - **Unidirectional (Wildcard Match)**: Pattern evaluation via trailing `*` detection.
3. **Immutability of Bidirectional Logic**: To prevent complex structural branching and circular dependency evaluation, Wildcard configurations are strictly unidirectional. Both UI and background storage operations will enforce `bidirectional = false` for wildcard patterns.
4. **Shared Utility & Caching**:
   - `shared.js` will act as the single source of truth for URL normalization and matching logic.
   - `background.js` will maintain a memory cache of wildcard keys to optimize performance and prevent repeated O(N) operations on tab updates.
5. **Port Number Sensitivity**: 
   - `normalizeUrl` must use `urlObj.host` instead of `urlObj.hostname` to preserve port numbers (e.g. `localhost:3000` vs `localhost:8080`), ensuring local developer environments are accurately distinguished.

---

## 2. Technical Specification & Implementation Steps

### 2.1 Storage Schema Extension

Extend the existing Jumpmark item schema to support `isWildcard` and store the item under its wildcard-normalized `sourceUrl` key in Chrome Sync storage.

```typescript
interface Jumpmark {
  id: string;
  title: string;
  url: string;
  icon: string;
  sourceUrl: string;       // Normalized source pattern (e.g. "github.com/owner/repo*")
  created: string;         // ISO timestamp
  isWildcard?: boolean;    // Flag indicating a wildcard match pattern
}
```

### 2.2 Validation Rules (Input sanitization)
- **Rule 1 (Trailing asterisks only as wildcards)**: Only the trailing `*` is treated as a wildcard character.
- **Rule 2 (Mid-Asterisks as literals)**: Asterisks appearing in the middle of the URL path (e.g. `example.com/foo*bar/page`) are NOT treated as wildcards and do NOT cause validation errors. They are treated as literal characters and matched exactly.
- **Rule 3 (Minimum characters)**: A wildcard pattern must have at least 3 characters in the host name. Wildcard only (`*`) or protocol-only wildcards (e.g. `https://*`) are forbidden.
- **Rule 4 (No Queries/Hashes)**: Query parameters (`?`) and hashes (`#`) are ignored and stripped during normalization.

### 2.3 Routing & Match Logic (Popup / Background Script)

When matching the current active tab URL against stored items, match using a cascading fallback:
1. **Phase 1 (Exact Match)**: Query the storage directly using the exact string key of the current normalized URL (O(1)).
2. **Phase 2 (Wildcard Scan)**: Look up the cache list of registered wildcard patterns. Perform prefix-based matching with path-boundary logic.

```javascript
/**
 * Safely checks if the current URL fits the registered pattern.
 * @param {string} currentUrl - Normalized tab URL.
 * @param {string} pattern - Registered wildcard pattern (e.g. "github.com/owner/repo*")
 * @returns {boolean}
 */
function isUrlMatch(currentUrl, pattern) {
  if (!pattern) return false;
  if (!pattern.endsWith('*')) {
    return currentUrl === pattern;
  }
  
  const basePattern = pattern.slice(0, -1);
  // Matches exact base pattern OR starts with basePattern/ (ensuring path separation)
  // Any mid-asterisk within basePattern is evaluated as a normal literal character comparison.
  return currentUrl === basePattern || currentUrl.startsWith(basePattern + '/');
}
```

### 2.4 Supplemental Instructions for AI Coding Agent

1. **Strict Type Safety**: Ensure all newly introduced fields (`isWildcard`, `sourceUrl`) comply with the JSDoc descriptions. Validate parameter names across `shared.js`, `popup.js`, and `options.js` to prevent typos.
2. **Zero-Downtime Storage Consistency**: In JS standard `URL` objects, `urlObj.host` omits port details if it is a standard production URL (e.g. returns `github.com` instead of `github.com:443`). This guarantees 100% backward compatibility for all existing user keys in storage.
3. **Background Cache Synchronization**: When a change occurs in `chrome.storage`, `background.js` must completely reconstruct/rebuild the `wildcardKeysCache` from storage rather than attempting diff-based mutations. This guarantees the cache remains completely synced with no residual records.
4. **Defensive Validation**: Implement a dedicated validation helper (`validateSourceUrlPattern`) to enforce minimum lengths, ensuring users cannot accidentally register broad global wildcards (like `*` or `https://*`) that trigger on every tab.

---

## 3. UI/UX Implementation Details (Popup UI)

Maintain the visual layout of the "New Jumpmark" view (Title, URL, Icon, Bidirectional Checkbox) while adding an Advanced Mode accordion toggle below the checkbox.

```
+------------------------------------------+
|  [ ] Bidirectional Link                  |
|                                          |
|  > Advanced (Customize Target URL)       |  <--- Toggle Trigger
+------------------------------------------+
|  [Expanded Section]                      |
|  Target Base URL:                        |
|  [ https://github.com/owner/repo* ]      |  <--- Inputs custom pattern
|  * Wildcard makes this link unidirectional. |  <--- Subtext / Warning
+------------------------------------------+
```

### 3.1 Step-by-Step UI Flow & State Constraints

1. **Trigger Component**:
   - Append a low-visibility text link or subtle chevron toggle: `▶ 高度な設定（対象URLのカスタマイズ）`.
2. **Accordion Expansion (Advanced Mode = ON)**:
   - Slide open an input field labeled "対象とする現在のURL" (Target Current URL).
   - Default State / Placeholder: Pre-populate with the current literal active tab URL (`window.location.href`).
   - User Interaction: The user appends a trailing `*` to abstract the scope.
3. **State & Constraint Interlocking (Critical)**:
   - As soon as the custom field ends with a `*` character:
     - Force the "双方向リンク" (Bidirectional Link) checkbox to `false` (unchecked).
     - Force the checkbox state to `disabled` (non-interactable).
     - Display a warning notice: `※ワイルドカード指定時は単方向リンクとなります` (Wildcard configurations are strictly unidirectional).
4. **Validation Failure Handling**:
   - If user attempts to save a pattern violating the validation rules (e.g., using empty input or a protocol-only asterisk), the popup/modal form will catch the error and render a warning label without triggering the storage API.

---

## 4. Option Dashboard (Management UI) Adjustments

- **Type Column Badge**: Display a distinct badge color/text labeled `[ワイルドカード]` (class `.type-wildcard`), separating them visually from standard single/bidirectional pairs.
- **Editable Source URL**: The "sourceUrl" field in the edit modal becomes an editable input text field instead of static text.
- **Import/Export**: Ensure `isWildcard` property is preserved when exporting to JSON, CSV, and HTML, and respect it during duplication-skipping checks.