# Jumpmark Dock - Chrome Extension

> English version of `docs/chrome-store-description.md`. When you change one, update the other to match.
>
> The Chrome Web Store description field does not render Markdown. Paste the plain-text `docs/chrome-store-listing.en.txt` / `docs/chrome-store-listing.ja.txt` into the store instead. This document summarizes the thinking behind the listing and the text for the "Single purpose" and "Permission justification" fields in the Developer Dashboard.

## Overview

**Jumpmark Dock** is a Chrome extension for **scoped bookmarks**.

Regular bookmarks show the same list no matter which page you're on. A bookmark made with Jumpmark Dock (a Jumpmark) is tied to the page it was created on (its scope) and shows up only when you open that page. It gives you the "whenever I'm on this page, I want to go to that page" kind of shortcut without filling up your bookmarks bar.

Background on the idea (in Japanese): [ブックマークにスコープを ― Scoped Bookmark という考え方](https://maepon.blog/about-scoped-bookmark/)

### Single purpose
Show bookmarks (Jumpmarks) tied to a page or URL pattern only when that page is open, so you can move quickly to related pages.

### Key features
- **Per-page Jumpmarks**: Create a Jumpmark on the page you're viewing; it appears in the popup only when you open that page
- **Bidirectional links**: When creating A→B, you can also create the return Jumpmark B→A (on by default)
- **Wildcards**: Add `*` to the end of the source URL to widen the scope to every page under that path
- **Badge count**: When the current page has Jumpmarks, the extension icon shows how many
- **Switch to an existing tab**: If the target page is already open, it switches to that tab
- **Fill in from open tabs**: In the add form, pick one of your open tabs to fill in its title and URL
- **Management page**: Search, filter, edit, and bulk-delete all Jumpmarks; back up and restore with JSON
- **Chrome Sync**, **Japanese and English UI**, **dark mode**

## How it differs from regular bookmarks

| | Regular bookmarks | Jumpmark Dock |
|------|-------------------|---------------|
| Where they appear | The same list on every page | **Only on the page they were created on (their scope)** |
| How you organize them | Sort into folders and go looking | **Tie them to a page; they show up when you're there** |
| Scope | ― | **A single page, or every page under a path (wildcard)** |
| Return links | Create them separately yourself | **Can be created together** |
| How you notice them | Open the bookmarks bar or menu | **The extension icon's badge shows the count** |

## Use cases

- Keep links to reference documents or blog drafts for each ChatGPT thread
- Tie related articles or GitHub issues to a Notion page
- From any page under a GitHub repository (`github.com/owner/repo*`), jump to its documentation or deployed site
- Move back and forth between paired pages such as staging and production, or an admin page and the public page
- Go back and forth between a main text and its material, such as a paper and its references, or a course and its exercises

## Privacy and security
- **Minimal permissions**: Only what is needed (storage, tab information)
- **Processing in the browser**: Jumpmarks are saved, displayed, and matched within the browser, and the extension never sends data to external servers on its own (except syncing through Google when Chrome Sync is enabled)
- **Extension-only storage**: Data is saved in Chrome's extension storage and cannot be read by other extensions or websites
- **Open source**: Published on GitHub

## Chrome Web Store listing

**Store URL**: https://chromewebstore.google.com/detail/jumpmark-dock/ldodfncboddjjbggcholbmkmjbfjmblh

**Short description** (`extDescription` in `_locales/en/messages.json`)
Scoped bookmarks for Chrome: links tied to a page or URL pattern that show up only when you're there.

**Detailed description**
Paste the full text of `docs/chrome-store-listing.en.txt` (its first line is the same as the short description).

## Why the permissions are needed

This extension requires only the following minimal permissions:

### 🗄️ storage permission
**Reason**: To save and sync the shortcuts you create
**Used for**:
- Saving shortcut links between pages in Chrome's extension storage (`chrome.storage.sync`)
- Sharing shortcut data across multiple devices through Chrome Sync
- Data is saved in Chrome's extension storage and cannot be read by other extensions or websites

### 📄 tabs permission
**Reason**: In addition to getting information about the current page, tab information is used for the badge count, switching to an existing tab, and filling in the add form from the tab list
**Used for**:
- When you open the popup, getting the URL and title of the active tab in the current window to display and create shortcuts
- For the badge count, matching the URLs of all open tabs against saved shortcuts within the browser (on install, on browser startup, when data changes, and when each tab navigates or is switched to)
- When opening a shortcut, referring to the URLs of open tabs so that an existing tab with the same URL can be switched to
- Only when you open the "list of open tabs" in the add form, reading the titles and URLs of the tabs open at that moment to display them (they are not read while the list is closed)

**Limits**:
- URLs and titles of tabs that are referred to are not saved unless you register them as a shortcut
- The extension never sends URLs or titles of tabs to external servers on its own (except Chrome Sync of shortcuts you have registered)
- Browsing is not recorded or tracked (tab changes are detected to update the badge, but nothing is recorded or sent)

### 🌐 host_permissions (all URLs)
**Reason**: So that shortcuts can be used on any website
**Used for**:
- Creating shortcuts between any websites
- Letting you set shortcuts freely, without being limited to specific sites
- Used only for creating shortcuts; page data is not collected or sent

**Privacy protection**:
- Shortcuts are saved, displayed, and matched within the browser
- The extension never communicates with external servers on its own (except syncing through Google when Chrome Sync is enabled)
- User data is not collected or tracked
