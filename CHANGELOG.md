# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2026-07-24

### Added

#### 🃏 Wildcard URL Support
- **Wildcard source URLs** by appending `*` to the end of a source URL
- **Directory and subdomain matching** for pages under the same path prefix
- **Wildcard-aware badge counting** with service worker cache rebuild support

#### 🔗 Protocol Preservation Improvements
- **Safer protocol fallback** for localhost, IPv4, IPv6, and ported `.local` hosts
- **Robust URL parsing** for reverse links when source URLs omit protocol information

### Changed

#### 🏗️ Refactoring
- **Shared URL parsing** centralized in `parseUrlPattern()` inside `shared.js`
- **Popup wildcard state handling** separated into state transition logic and UI rendering
- **Options page edit flow** simplified by consolidating bidirectional checkbox handling

### Fixed

#### 🐛 Bug Fixes
- **Middle asterisk handling** now preserves patterns such as `foo*bar*`
- **Wildcard edit behavior** no longer reintroduces checked state during normal typing
- **IPv6 and local host detection** now handles loopback, ULA, link-local, and ported `.local` cases more safely

## [1.1.0] - 2025-07-11

### Added

#### 🆕 Import/Export System
- **Complete import/export functionality** with support for JSON, CSV, and HTML formats
- **Drag & drop file import** - simply drop JSON files into the import area
- **Smart duplicate detection** with configurable merge options during import
- **Data validation** with comprehensive error handling for malformed files
- **Export range selection** - export all jumpmarks, selected items, or filtered results
- **Import preview** showing statistics before execution (total, new, duplicates)

#### 🎨 Advanced Management UI
- **Options page** with comprehensive jumpmark management interface
- **Search and filtering** with real-time results across titles and URLs
- **Bulk operations** - select multiple jumpmarks for deletion or export
- **Sorting options** by creation date, title, or URL
- **Storage usage display** with visual progress bar (Chrome Sync 102KB limit)
- **Dark mode support** automatically following system preferences

#### 🔧 Technical Improvements
- **Enhanced URL normalization** with automatic protocol detection and addition
- **Improved error handling** throughout the application with user-friendly messages
- **Better table interaction** - only URL column is clickable to prevent accidental navigation
- **Real-time status feedback** during import/export operations
- **Bidirectional link system refactor** using URL-match detection instead of flags

### Changed

#### 💡 User Experience
- **Table row clicking behavior** - restricted to URL column only to prevent accidental navigation
- **URL display styling** - clear visual indication of clickable links with blue color and underline
- **Import/export UI** - professional grid-based statistics display with visual hierarchy
- **Status indicators** - improved feedback during long-running operations

#### 🏗️ Architecture
- **Data structure modernization** - replaced `bidirectional` flags with `sourceUrl`-based relationship detection
- **Modular code organization** - extracted common utilities to `shared.js`
- **Enhanced CSS architecture** - comprehensive dark mode support across all components

### Fixed

#### 🐛 Bug Fixes
- **Import duplicate detection logic** - corrected to prevent false positives with bidirectional links
- **URL normalization errors** - robust handling of protocol-less URLs (e.g., "google.com")
- **Table interaction issues** - eliminated unintended page navigation when clicking near buttons
- **Storage listener conflicts** - resolved duplicate UI updates during edit/delete operations
- **Cross-platform compatibility** - improved handling of various URL formats and edge cases

#### 🔒 Data Integrity
- **Import validation** - comprehensive checking of file format and data structure
- **Error recovery** - graceful handling of corrupted or incomplete data
- **Backward compatibility** - seamless migration from older data formats

### Technical

#### 📦 Build & Deployment
- **GitHub Actions workflows** updated to include all new files (options.html, options.js, options.css, shared.js)
- **Automated packaging** for Chrome Web Store submission with validation
- **Release automation** with comprehensive artifact generation

#### 🔧 Code Quality
- **Error boundary implementation** - prevents application crashes from malformed data
- **Input sanitization** - enhanced security for user-provided data
- **Performance optimization** - efficient handling of large jumpmark collections

---

## [1.0.1] - 2025-07-08

### Added
- **Options page foundation** with basic jumpmark management interface
- **Advanced editing capabilities** with bidirectional link support
- **Bulk deletion functionality** with confirmation dialogs

### Changed
- **Bidirectional link creation** improved logic and user interface
- **URL normalization** enhanced to handle more edge cases

### Fixed
- **Edit modal bugs** preventing proper saving of changes
- **Deletion confirmation** UI hierarchy and button styling
- **Storage synchronization** issues across multiple devices

---

## [1.0.0] - 2025-06-30

### Added
- **Initial release** of Jumpmark Dock Chrome Extension
- **Basic jumpmark creation** with title, URL, and icon support
- **Bidirectional linking** - automatic reverse link creation
- **Chrome Sync integration** for cross-device synchronization
- **Badge notifications** showing jumpmark count for current page
- **Smart tab management** - focus existing tabs or create new ones
- **Popup interface** with intuitive jumpmark list and navigation

### Technical
- **Manifest V3 compliance** for modern Chrome extension standards
- **Chrome Storage Sync API** integration with 102KB limit handling
- **Background service worker** for tab monitoring and badge updates
- **Responsive design** with professional UI/UX

---

## Archive

For older versions and detailed development history, see the [Git commit history](https://github.com/maepon/jumpmark-dock/commits/master).

---

**Legend:**
- 🆕 New features
- 🎨 UI/UX improvements  
- 🔧 Technical improvements
- 💡 User experience enhancements
- 🐛 Bug fixes
- 🔒 Security/reliability
- 📦 Build/deployment
- 🏗️ Architecture changes
