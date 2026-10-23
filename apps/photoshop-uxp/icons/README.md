# Photoshop icons

These assets are size exports of the repository's `icon.png` logo. Panel icons use 23/46px;
plugin list icons use 24/48px. Both Photoshop manifests reference the base path without a scale
suffix; UXP loads the actual `@1x.png` and `@2x.png` files. The logo has its own dark background
and is shared across the four Photoshop themes.

To refresh the exports on macOS, run these commands from the repository root:

```sh
sips -z 23 23 icon.png --out apps/photoshop-uxp/icons/panel@1x.png
sips -z 46 46 icon.png --out apps/photoshop-uxp/icons/panel@2x.png
sips -z 24 24 icon.png --out apps/photoshop-uxp/icons/list@1x.png
sips -z 48 48 icon.png --out apps/photoshop-uxp/icons/list@2x.png
```
