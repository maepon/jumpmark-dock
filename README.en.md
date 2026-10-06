# Jumpmark Dock

[日本語](README.md) | English

Jumpmark Dock is a Chrome extension for **scoped bookmarks**.

Regular bookmarks show the same list no matter which page you're on. A bookmark made with Jumpmark Dock (a Jumpmark) is tied to the page it was created on (its scope) and shows up only when you open that page. It gives you the "whenever I'm on this page, I want to go to that page" kind of shortcut without filling up your bookmarks bar.

- [Chrome Web Store](https://chromewebstore.google.com/detail/jumpmark-dock/ldodfncboddjjbggcholbmkmjbfjmblh)
- Background on the idea (in Japanese): [ブックマークにスコープを ― Scoped Bookmark という考え方](https://maepon.blog/about-scoped-bookmark/)

## Features

- **Per-page Jumpmarks**: Create a Jumpmark on the page you're viewing; it appears in the popup only when you open that page
- **Bidirectional links**: When creating A→B, you can also create the return Jumpmark B→A (on by default). The return Jumpmark is titled `← <title of the source page>`
- **Wildcards**: Add `*` to the end of the source URL to show a Jumpmark on every page under that path
- **Badge count**: When the current page has Jumpmarks, the extension icon shows how many
- **Switch to an existing tab**: If a tab for the target page is already open, it switches to that tab; otherwise it opens a new one
- **Fill in from open tabs**: In the add form, pick one of your open tabs to fill in its title and URL
- **Management page (options page)**: Search, sort, and filter (one-way / bidirectional / wildcard) all Jumpmarks, edit them, and delete them in bulk
- **Import / export**: Back up and restore with JSON; export to CSV and HTML
- **Sync with Chrome Sync**: Jumpmarks sync across Chrome browsers signed in to the same Google account
- **Japanese and English UI**: Follows Chrome's display language. Dark mode is supported

See [CHANGELOG.md](CHANGELOG.md) for changes in each version.

## Installation

Install it from the [Chrome Web Store](https://chromewebstore.google.com/detail/jumpmark-dock/ldodfncboddjjbggcholbmkmjbfjmblh).

To try the development version, load it as an unpacked extension:

1. Clone this repository
   ```bash
   git clone https://github.com/maepon/jumpmark-dock.git
   ```
2. Open `chrome://extensions/` in Chrome and turn on "Developer mode" in the top right
3. Click "Load unpacked" and select the cloned `jumpmark-dock` directory

## Usage

### Add a Jumpmark

1. On the page where you want the Jumpmark, click the extension icon
2. Click "+ Add Jumpmark"
3. Enter the title and URL of the target page
   - Open "Choose from open tabs" and pick a tab to fill in its title and URL (the tab list is loaded only when you open it)
   - New Jumpmarks get the `🔖` icon. You can change it by editing the Jumpmark
4. To be able to come back from the target page, leave "Bidirectional link" on
5. Click "Save"

### Show a Jumpmark on multiple pages with a wildcard

Add `*` to the end of the source URL, and the same Jumpmark shows up on any page under that path.

1. In the add form, open "Advanced settings (customize the source URL)"
2. In "Source URL to match", enter a URL ending in `*` (for example, `github.com/owner/repo*`)
3. Enter the title and URL, then click "Save"

| Source URL | Shown on | Not shown on |
|---|---|---|
| `github.com/owner/repo*` | `github.com/owner/repo`, `github.com/owner/repo/issues/1` | `github.com/owner/repo-other` |
| `example.com/docs*` | `example.com/docs`, `www.example.com/docs/guide/intro` | `example.com/blog`, `docs.example.com` |

- Matching works on path segments (separated by `/`). `*` works only at the end; a `*` in the middle is treated as a literal character
- Subdomains don't match (with or without `www.` is treated as the same)
- Jumpmarks with a wildcard are one-way (no return Jumpmark is created)

### Use a Jumpmark

Click the extension icon, then click a Jumpmark in the list. If a tab for the target page is already open, it switches to that tab; otherwise it opens a new one.

When deciding whether a tab is the same page, differences in a trailing `/`, letter case, and the default port (`:443` / `:80`) are ignored. The part after `#` is compared only when the Jumpmark's URL has a `#`. Differences in the query, scheme, or `www.` are treated as different pages.

### Edit and delete

- In the popup, hover over a Jumpmark to show its "Edit" and "Delete" buttons
- On the options page (right-click the extension icon → "Options"), you can edit and delete all Jumpmarks from a list. When a Jumpmark has a matching return Jumpmark, you can choose to delete both

### Import / export

Use the "Import/Export" tab on the options page.

- **Export**: Choose the range (all Jumpmarks / selected Jumpmarks / current filter results), then click a format button to download the file
- **Import**: Drag and drop a JSON file or use "Choose a file", check the settings (whether to merge with existing data and whether to skip duplicates) and the preview, then click "Run import"

| Format | Use | Import |
|---|---|---|
| JSON | Backup with all fields (recommended) | Yes |
| CSV | View in a spreadsheet app | No |
| HTML | View in a browser (URLs other than `http`/`https` are shown as text, not links) | No |

## Sync and storage

Data is stored in `chrome.storage.sync`. With Chrome sync turned on, it syncs across Chrome browsers signed in to the same Google account (how quickly changes arrive depends on Chrome sync). With sync turned off, it still works within that browser.

`chrome.storage.sync` has limits of 102,400 bytes in total, 8,192 bytes per item, and 512 items. Jumpmark Dock splits its data by a hash of the source URL into up to 64 items (plus continuation items for anything that doesn't fit), so about 100KB is usable in total (up to about 8KB per Jumpmark).

- The options page shows how much of the limit is in use
- The add form shows a warning when you're close to the limit
- Saves that would exceed the limit (adding, editing, importing) are not performed, and the reason is shown
- Data in the format of v2.3.0 and earlier (the `jumpmarks` item) is kept for compatibility with older versions. It counts toward usage

## Development

The extension itself has no build step. Edit the source files directly and reload the extension in `chrome://extensions/` to check your changes.

```bash
npm ci                 # Install development dependencies (Prettier)
npm test               # Run tests (Node's built-in test runner)
npm run format:check   # Check formatting (npm run format to format)
```

GitHub Actions runs `npm test` and `npm run format:check` on pull requests.

### File structure

```
jumpmark-dock/
├── manifest.json        # Extension configuration
├── background.js        # Service worker (tab monitoring and badge updates)
├── popup.html/js/css    # Popup
├── options.html/js/css  # Options page (management, import/export)
├── shared.js            # Shared logic: URL normalization and matching, storage access, etc.
├── i18n.js              # Applies translated messages to static DOM
├── _locales/            # chrome.i18n messages (ja / en)
├── icons/               # Icons
├── test/                # Tests
├── docs/                # Design notes, store listings, work-session handoff notes
├── ai-flow/             # AI-assisted development tooling (pulled in from another repository with git subtree)
├── .ai-flow/            # This repository's settings for ai-flow
└── .github/workflows/   # CI and packaging
```

All access to `chrome.storage` goes through `readJumpmarksStore` / `writeJumpmarksStore` / `onJumpmarksChanged` in `shared.js`. See [CLAUDE.md](CLAUDE.md) for development guidelines and [docs/work-session-handoff.md](docs/work-session-handoff.md) (in Japanese) for ongoing work.

### Data structure

`readJumpmarksStore()` returns an array of Jumpmarks for each normalized source URL.

```javascript
{
  "example.com/page1": [
    {
      "id": "jm-unique-id-123",
      "title": "Related page",
      "url": "https://example.com/page2",
      "icon": "📝",
      "sourceUrl": "example.com/page1",
      "created": "2025-06-30T10:00:00Z"
    }
  ]
}
```

- URL normalization removes the protocol, `www.`, a trailing `/`, the query, and the part after `#`
- Bidirectional relationships aren't stored as a flag; they're detected by whether `sourceUrl` and `url` match each other
- Wildcard Jumpmarks have `isWildcard: true`

In `chrome.storage.sync`, this is split by an FNV-1a hash of the source URL into the following items:

- `jm:<n>` (n is 0–63): the head item of a bucket. Its value is `{ "d": { sourceUrl: [Jumpmark, ...] } }`
- `jm:<n>:<i>` (i = 1, 2, …): continuation items for anything that doesn't fit in one 8,192-byte item. The head item then also has `n` (number of items) and `r` (a hash of the contents)
- `jm:meta`: `{ "v": 2, "legacyIds": [...] }`. The ids of Jumpmarks already imported from the legacy format
- `jumpmarks`: the format of v2.3.0 and earlier (all data in one item). Kept for compatibility; never rewritten or deleted

### Debugging

- **Popup**: Right-click the extension icon → "Inspect popup"
- **Service worker**: Click "Service worker" for Jumpmark Dock on `chrome://extensions/`
- **Storage**: DevTools → Application → Storage → Extension storage

## Contributing

Issues and pull requests are welcome. Before sending a pull request, make sure `npm test` and `npm run format:check` pass.

Please report vulnerabilities as described in [SECURITY.md](SECURITY.md), not in a public issue.

## License

MIT License. See [LICENSE](LICENSE) for details.

## Author

Masayuki Maekawa ([@maepon](https://github.com/maepon))
