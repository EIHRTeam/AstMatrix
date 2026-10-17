# AstMatrix 0.1.1 — Figma Community submission

Plugin ID: `1693350407249302347` · Name: **AstMatrix** · Category: **Design tools**

## Build and submit

1. From the repository root, run `pnpm check`, `pnpm build:figma`, and `pnpm check:figma-bundle`.
2. In Figma Desktop, import `apps/figma-plugin/dist/manifest.json` through Development and run
   **AstMatrix** once to check insertion and links with the final build.
3. Open **Plugins → Manage plugins → Publish** for this plugin. Use the copy below, select
   the publishing profile, add the icon/cover and support link, then submit for Community review.

The complete bundle is `apps/figma-plugin/dist/`. Keep `LICENSE` and `licenses/` with distributed
copies. This preparation does not submit or publish the plugin.

## Listing copy

**Tagline:** Offline barcode and QR code generation with editable vectors.

**Description:**

Generate barcodes and 2D codes directly in Figma Design. Preview your result, then insert it
as editable vector layers with a frame that preserves the barcode's quiet zone.

- Supports formats including EAN, UPC, Code 128, QR Code and Data Matrix.
- Controls for dimensions, foreground/background colors and human-readable text outlines.
- Local generation with no account, backend service or plugin network requests.
- English and Simplified Chinese interface.

This version inserts new objects. Reading parameters from selected objects, in-place updates
and FigJam are not included. Validate scanning with your intended output size and workflow.

**Support:** https://github.com/EIHRTeam/AstMatrix/issues

**Release notes:** Initial Figma release with offline previews, native vector insertion,
outlined text and external project/license links. Detailed connection diagnostics are hidden
by default; concise connection errors remain available.

## Data disclosure

AstMatrix's plugin code does not send barcode contents or document data to a server and does
not include analytics. Encoding runs locally; the manifest sets network access to `none`.
Generation parameters, including the encoded value, are stored as plugin metadata on inserted
objects and travel with those objects when the Figma file is saved or shared. The language
preference is stored locally when browser storage is available. Clicking the project or license
link explicitly opens the corresponding external website in the browser. Figma's own services
and those external websites are governed by their respective privacy policies.

## Remaining manual items

- Choose the publishing profile and complete Figma's listing/security fields.
- Upload a plugin icon (Figma recommends 128 × 128) and a real-product cover image
  (recommended 1920 × 1080). The repository's `icon.png` is a 192 × 192 source; capture the
  cover manually from the final plugin. No marketing screenshot has been fabricated.
- The user confirmed insertion and GitHub/Apache links on 2026-10-18. Record the exact Figma,
  OS and architecture when completing the remaining host checks in README.md. Real-host export,
  independent decoding, undo/redo and other unreported checks remain unverified.

Publishing reference: https://help.figma.com/hc/en-us/articles/360042293394
