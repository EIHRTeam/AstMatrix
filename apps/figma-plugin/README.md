# Figma Design plugin

AstMatrix reuses its existing React panel, offline encoders and millimetre VectorScene.
Insertion creates native editable rectangles, ellipses and paths inside a fixed-size Frame.
Human-readable text is outlined. The frame includes the full quiet zone and stores generation
metadata, but this version does not read selected parameters or update existing objects.
FigJam is not supported. Community publishing instructions are in [RELEASE.md](RELEASE.md).

## Build and load

Use Node.js 24 and pnpm 12.11.2 from the workspace root:

```sh
pnpm install --frozen-lockfile
pnpm build:figma --dry-run
pnpm build:figma
pnpm check:figma-bundle
```

The generated directory is `apps/figma-plugin/dist/`. The source manifest contains the fixed,
Figma-assigned plugin ID `1693350407249302347`; no environment variable is needed.

Select **Plugins → Development → Import plugin from manifest** and choose the generated
`apps/figma-plugin/dist/manifest.json`. Run **AstMatrix** from Development.
Use a disposable Design file for acceptance. Rebuild and rerun the plugin after source changes.
The build preserves the source manifest's ID. Generated manifests and bundles are ignored by Git.

`pnpm build:web --profile=figma-ui` produces the separate UI build. This is an intermediate
artifact, not the importable plugin. `--compiler=off` produces a separate comparison UI build.
The host build always enables React Compiler and produces the final inline `ui.html`.

## Behavior and boundaries

- The panel opens at 520 × 720 and scrolls vertically. Existing Chinese/English language
  controls remain available; automatic language follows the iframe browser locale.
- Insert places a new top-level Frame at the current viewport center, then selects it.
  Existing selections and Auto Layout containers do not become insertion parents.
- Each completed insertion has its own undo boundary. Changing page or changing input before
  commit cancels pending work. Failed creation removes nodes created by that request and reports
  whether cleanup succeeded. A lost connection is not treated as a confirmed mutation failure.
- Millimetres map to nominal Figma canvas units using `96 / 25.4`, without integer snapping.
  Export scale and physical output must be checked in the real host.
- Encoding, fonts, scripts, styles and icons are bundled locally. The manifest denies plugin
  network access. Explicit GitHub/license links open through Figma's external-link API.
- Main-thread TypeScript uses official Figma types without DOM types; the UI uses DOM types
  without Figma globals. The sandbox bundle uses an ES2020 syntax target; the iframe has a
  conservative Chrome 99 compilation baseline. Neither is a claim about a verified host version.

## Manual acceptance checklist

Automated geometry, bridge and bundle tests do not replace these checks. Record the test date,
Figma version, OS and CPU architecture, and mark each case pass/fail/not-run.

The release UI hides detailed bridge diagnostics, including on errors. A concise connection
message still appears if initialization fails. Developers can temporarily pass
`showDiagnostics={true}` to `FigmaPanel` when debugging; this is off in the shipped entry.
Main-thread startup failures are logged with an `[AstMatrix]` prefix in the development console.

| Case                           | Expected result                                                                                                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Start and scroll               | Panel renders at 520 × 720; all input, preview and insertion controls are reachable; console has no relevant errors.                                                |
| Code 128 and EAN-13 with HRI   | Native vectors match preview; text consists of editable outlines, without installed OCR fonts.                                                                      |
| QR Code and Data Matrix        | Full quiet zone, foreground and background are preserved. Transparent backgrounds remain transparent.                                                               |
| A curved symbol, e.g. MaxiCode | Circles/curves and compound-path holes remain intact; no unwanted strokes.                                                                                          |
| Nominal dimensions             | Frame width/height equal requested scene millimetres × 96 / 25.4.                                                                                                   |
| Placement                      | A fresh top-level frame is centered in the viewport even when an Auto Layout child is selected.                                                                     |
| Repeat insertion               | Each click creates one object; successful insertion selects its own object.                                                                                         |
| Undo and redo                  | One undo removes one insertion; redo restores its vectors, quiet-zone frame and metadata.                                                                           |
| Input/page change              | Stale preview requests cannot insert into another page; retry works on the current page.                                                                            |
| Offline plugin resources       | Generation works without external resource requests; DevTools shows no plugin CSP/resource errors.                                                                  |
| Real-host export and decoding  | Export inserted objects through Figma; independently decode representative linear and matrix symbols using ZXing/ZBar, then test the intended scanner/output scale. |

On 2026-10-18 the user confirmed in Figma that insertion and both external links work after
the bridge fix. Exact host version, OS version and architecture were not supplied. The remaining
manual cases above, especially real-host export and decoding, are not claimed as verified.
The generated `host-build-info.json` retains `actualHost: "not-run"` because the build does not
run Figma itself; user-reported acceptance is recorded here separately.
