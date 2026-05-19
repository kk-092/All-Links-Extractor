# All Links Extractor

All Links Extractor is a Chrome extension for extracting, auditing, organizing, saving, and exporting links from web pages, selected text, embedded page assets, and open browser tabs.

It is built for SEO audits, research, QA checks, developers, marketers, and anyone who needs a clean link audit workspace instead of manually collecting URLs.

## Features

- Extract links from the current page
- Extract links from selected text
- Extract links from all open HTTP/HTTPS tabs
- Automatically save every extraction to local history
- Optional auto-capture for newly loaded tabs
- Detect internal, external, subdomain, media, download, email, phone, social, tracking, affiliate, hidden, canonical, hreflang, iframe, image, video, audio, and document links
- Group links by domain
- Search, filter, and sort audit results
- Show duplicate counts and cleanable URLs
- Clean common tracking parameters
- Highlight extracted links on the source page
- Fetch page title and meta description previews
- Run link health checks for HTTP/HTTPS links
- Export links and reports in TXT, CSV, Excel-compatible CSV, Markdown, HTML, JSON, domain list, and clipboard formats
- Save, reopen, rename, export, and manage previous extraction sessions
- Light mode, dark mode, accent colors, compact rows, grouped results, and helpful tooltips
- Multi-language interface support

## Use Cases

- SEO link audits
- Internal linking checks
- Broken link review
- Competitor research
- Website QA
- Content research
- URL collection
- Open-tab link extraction
- Marketing and outreach workflows
- Developer and tester workflows

## Privacy

All extracted links, history, settings, themes, previews, and audit data are stored locally in the user's browser using Chrome extension storage.

The extension does not sell, rent, trade, or share user data with third parties. It does not use user data for advertising, tracking, profiling, or analytics.

Privacy Policy:

https://kk-092.github.io/All-Links-Extractor/privacy-policy/

Repository policy file:

https://github.com/kk-092/All-Links-Extractor/blob/main/PRIVACY_POLICY.md

## Permissions

The extension uses Chrome permissions only for its core functionality:

- `scripting`: extract and highlight links on scanned pages
- `activeTab`: access the current tab after user action
- `tabs`: support tab identification, all-tabs extraction, extension pages, and optional auto-capture
- `storage`: save settings, links, history, previews, reports, and preferences locally
- `downloads`: export link files and reports
- `contextMenus`: provide right-click extraction actions
- Host permissions: extract and audit links from websites the user chooses to scan

## Remote Code

This extension does not use remote code. All JavaScript, CSS, HTML, icons, and localization files are packaged inside the extension.

## Local Development

1. Clone the repository.
2. Open Chrome or Edge.
3. Go to `chrome://extensions` or `edge://extensions`.
4. Enable Developer mode.
5. Click `Load unpacked`.
6. Select the extension root folder.

## Packaging

When creating a Chrome Web Store package, include only the extension source files:

- `manifest.json`
- root HTML files
- `background.js`
- `content.js`
- `css/`
- `js/`
- `icons/`
- `_locales/`

Do not include local build output, screenshots, videos, Git files, or store asset folders in the upload ZIP.

## Version

Current extension version: `1.1`

## Support

For issues, ideas, or privacy requests, use GitHub Issues:

https://github.com/kk-092/All-Links-Extractor/issues
