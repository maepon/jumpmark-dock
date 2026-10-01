# Jumpmark Dock - Chrome Extension

> English version of `docs/chrome-store-description.md`. When you change one, update the other to match.

## Overview

**Jumpmark Dock** is a Chrome extension focused on **creating bidirectional shortcuts between web pages**.

### Single, clear purpose
**Create bidirectional shortcut links between web pages so you can move quickly between related pages**

### Key features
- **Bidirectional shortcuts**: When you create a link from page A to page B, a link from page B back to page A is created automatically
- **Link management**: View, edit, and delete the shortcuts associated with each page
- **Badge count**: When the current page has related shortcuts, the extension icon shows how many
- **Simpler add flow (v2.1.0)**: No icon input needed when creating a shortcut; `🔖` is set automatically
- **Fill in from open tabs (v2.3.0)**: In the add form, pick one of your open tabs to fill in its title and URL automatically

## Why install it

### 🚀 Work more efficiently
- **Quick access to related pages**: Jump there in one click instead of searching every time
- **Faster research**: Move back and forth between references and related articles
- **Project management**: Tie together related documents, tools, and resources

### 🔄 The power of bidirectional links
- **See how information connects**: Tell at a glance which pages are linked to which
- **Organize your knowledge**: Connect scattered information into a coherent whole
- **Serendipity**: Discover unexpected connections

### ☁️ Convenience of cloud sync
- **Seamless switching between devices**: The same Jumpmark setup on your desktop, laptop, and tablet
- **Shared across your devices**: Synced across devices signed in to Chrome with the same Google account
- **Peace of mind**: Stored safely in Chrome's cloud storage

### 🎯 Example use cases

**Study and research**
- Paper ⇔ references ⇔ related work
- Online course ⇔ exercises ⇔ explanation sites

**Business**
- Project management tool ⇔ design documents ⇔ API documentation
- Customer information ⇔ related email ⇔ meeting materials

**Hobbies and lifestyle**
- Recipe site ⇔ online grocery store ⇔ nutrition information
- Travel plan ⇔ accommodation booking ⇔ sightseeing information

### 💡 How it differs from regular bookmarks

| Feature | Regular bookmarks | Jumpmark Dock |
|------|-------------------|---------------|
| Relationships | One-way only | **Bidirectional, created automatically** |
| Context | Managed in folders | **Related links shown per page** |
| Access | From the bookmarks bar | **Directly from the current page** |
| Sync | Chrome bookmark sync | **Chrome Storage Sync** |
| Visibility | List view | **Badge + popup** |

### 🛡️ Privacy and security
- **Minimal permissions**: Only what is needed (storage, tab information)
- **Processing in the browser**: Shortcuts are saved, displayed, and matched within the browser, and the extension never sends data to external servers on its own (except syncing through Google when Chrome Sync is enabled)
- **Extension-only storage**: Data is saved in Chrome's extension storage and cannot be read by other extensions or websites
- **Open source**: Published on GitHub for transparency

## Chrome Web Store description (single-purpose version)

**Store URL**: https://chromewebstore.google.com/detail/jumpmark-dock/ldodfncboddjjbggcholbmkmjbfjmblh

**Short description**
An extension for creating bidirectional shortcuts between web pages

**Detailed description**
Jumpmark Dock is an extension focused on creating bidirectional shortcuts between web pages.

**A single, clear function:**
It creates bidirectional shortcut links between web pages so you can move quickly between related pages.

🔗 **Bidirectional shortcuts**: Create a link from page A to B, and a link from page B to A is created automatically
📊 **Badge count**: When there are related pages, the extension icon shows how many
⚡ **Quick access**: The extension popup lists the shortcuts associated with the current page

**How to use:**
1. On the page you want to link from, click the extension icon
2. Click "+ Add Jumpmark" and enter the target URL and a title
   - New shortcuts get the `🔖` icon automatically (you can edit it later if you like)
   - Instead of typing the URL and title, you can also pick one from the list of open tabs ("Choose from open tabs")
3. A bidirectional shortcut is created automatically
4. Jump to the related page in one click

**Who it is for:**
- People who frequently go back and forth between related web pages
- People who read a main text while referring to reference material
- People who compare multiple related sites

A simple, easy-to-understand tool for creating shortcuts between web pages.

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
