# Security Policy

## Reporting a vulnerability

Please report vulnerabilities **privately**, not in a public Issue:
use [Report a vulnerability](https://github.com/maepon/jumpmark-dock/security/advisories/new) on the Security tab.

Examples of what counts:

- Script injection through Jumpmark titles, URLs, icons, or imported files (popup, options page, or exported HTML)
- A way to make the extension navigate to `javascript:` / `data:` URLs or other unsafe schemes
- Data from one site or profile leaking into another, or Jumpmarks being lost or corrupted through crafted input

This is a personal project maintained in spare time; expect a reply within a few days.

## Supported versions

Only the latest version published on the Chrome Web Store receives fixes.

## Note on `ai-flow/`

`ai-flow/` is [maepon/issue-to-pr-flow](https://github.com/maepon/issue-to-pr-flow), brought in with `git subtree`.
Report issues in it to that repository (see its SECURITY.md).
