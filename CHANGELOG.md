# Changelog

All notable changes to X-TEC Digital Reporting are documented here.

---

## [1.1.5] — Upcoming

---

## [1.1.4 beta] — March 2026

### Added

- Performance instrumentation (`perf.ts`) — opt-in timing for IPC, DB reads/writes, and PDF generation
- Content Security Policy (CSP) meta tag in renderer for improved security
- Text highlighting with 5 color options (Yellow, Green, Blue, Pink, Orange) on all text fields
- Inline comments on selected text with create, edit, resolve, reply, and delete support
- Comments Rail sidebar showing all comments, aligned to their source text
- "Find" button on comment cards that scrolls to and highlights the referenced text
- Filter tabs (All / Open / Done) in the Comments Rail
- Comment author badges using Windows username
- Relative timestamps on comments (e.g., "5m ago")
- Resolve all comments button
- Auto-save — reports are automatically saved to the local database as you work
- "Unsaved Changes" confirmation modal when navigating away from a report with unsaved work
- Same modal triggered by the window close (X) button in Electron
- Drag-to-reorder photos using grip handles (replaces up/down arrow buttons)
- Photo thumbnail previews on recent projects on the landing page
- Preset wallpapers — choose a background photo for the landing page from the Settings menu
- Zoom controls (Zoom In, Zoom Out, Reset) on DFR report views
- SaskPower DFR required fields highlight red on failed save attempt
- What's New modal shown once after each update with release highlights
- Update modal with Download Now / Download Later / Install Now flow

### Changed

- Report components (PhotoLog, DfrStandard, DfrSaskpower, CombinedLog) are now lazy-loaded, reducing startup time
- Removed Guided Tour feature
- Removed DevTools (F12) shortcut for production builds

### Fixed

- UpdateModal auto-close timer being silently cancelled by a re-render (stale closure; fixed with `useRef`)
- Squirrel installer loading GIF not closing after the app launches
- PDF preview not rendering after CSP was introduced (`frame-src blob:` added)
- Landing page recent projects dropdown clipping behind other elements
- Wider content area in DfrStandard and DfrSaskpower (removed restrictive breakpoint constraints)
- Missing `fieldId` prop on BulletPointEditor usages in DfrStandard and DfrSaskpower
- Various bug fixes and performance improvements

### Security

- Upgraded jsPDF to v4.x
- Forced DOMPurify ≥ 3.3.2 via `overrides` to resolve transitive vulnerability

### Removed

- Unused npm dependencies: `antd`, `image-clipper`, `exifr`, `@tensorflow/tfjs`, `@tensorflow-models/coco-ssd`
- Unused source files: `GuidedTour.tsx`, `subjectDetection.ts`, `GlassSurface.tsx`, `xterraLogo.tsx`,
  `pdfPhotoUtils.ts`, `pdfcanvaspreview.tsx`, `ProjectPreviewTooltip.tsx`, `PageCommentsPanel.tsx`,
  `HighlightableBulletPointEditor.tsx`, `HighlightableTextarea.tsx`, `Assetimage.tsx`, `useComments.ts`

---

## [1.1.0] — 2025

- Standard DFR report creation and PDF export
- SaskPower DFR report creation and PDF export
- Photo Log with image upload, auto-crop, and PDF export
- Combined Log for merging photos from multiple projects
- Recent Projects with IndexedDB storage
- Project save/load (`.dfr`, `.spdfr`, `.plog`, `.clog` file formats)
- Dark mode support
- Spell check with configurable languages
- Electron desktop app with auto-updater
- Special character palette
- Photo download as ZIP
