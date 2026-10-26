# AstMatrix

[![License: Apache 2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg?style=flat-square&label=License)](LICENSE)
[![Version](https://img.shields.io/github/v/release/EIHRTeam/AstMatrix?style=flat-square&label=Version&color=blue)](https://github.com/EIHRTeam/AstMatrix/releases/latest)<br>
[![TypeScript 7](https://img.shields.io/badge/TypeScript-7-blue.svg?logo=typescript&style=flat-square&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js 24](https://img.shields.io/badge/Node.js-24-339933.svg?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![React 19](https://img.shields.io/badge/React-19-61DAFB.svg?style=flat-square&logo=react&logoColor=white)](https://react.dev)

_"Let me be the guiding star for all"_

A lightweight yet powerful muti-formats QR Code & Barcode generator for Adobe Illustrator, Adobe Photoshop and Figma.

> [!TIP]
> This project is still in the early stages of development, and no stable release is currently available for production use. Caution is advised when using this project.

## Installation

### Adobe Illustrator

**Via Adobe Creative Cloud**

1. Open [Adobe Exchange page](https://exchange.adobe.com/apps/cc/206104/astmatrix) for this project, or search "**AstMatrix**" in Creative Cloud Desktop app.

2. Install the plugin.

**Manual**

1. Download latest release of the plugin from [Releases page](https://github.com/EIHRTeam/AstMatrix/releases/latest).

2. Open the downloaded zip file with any zip archive software (e.g., 7-Zip, ShichiZip, Keka), extract the contents to the following directory:

    - Windows: `%APPDATA%\Roaming\Adobe\CEP\extensions\`
    - macOS: `~/Library/Application Support/Adobe/CEP/extensions/`

3. Enable PlayerDebugMode:

    - Windows: Open Registry Editor, navigate to `HKEY_CURRENT_USER\Software\Adobe\CSXS.12`, create a new string value named `PlayerDebugMode` and set its value to `1`.
    - macOS: Open Terminal, run the command `defaults write com.adobe.CSXS.12 PlayerDebugMode 1`.

4. Fully restart Adobe Illustrator to load the plugin.

5. Select "Window" > "Extensions" > "AstMatrix" to launch the plugin.

### Adobe Photoshop

**Via Adobe Creative Cloud**

1. Open [Adobe Exchange page](https://exchange.adobe.com/apps/cc/1f4db629/astmatrix-for-photoshop) for this project, or search "**AstMatrix for Photoshop**" in Creative Cloud Desktop app.

2. Install the plugin.

**Via Adobe Universal Plugin Installer Agent (UPIA)**

1. Download latest release of the plugin from [Releases page](https://github.com/EIHRTeam/AstMatrix/releases/latest).

2. Make sure Adobe Creative Cloud version 5.7 or later is installed.

3. Install the plugin via UPIA by Adobe's document: [How to Install UXP Plugins Using Command Line Tools](https://blog.developer.adobe.com/en/publish/2022/03/how-to-install-uxp-plugins-using-command-line-tools).

**Manual**

1. Download latest release of the plugin from [Releases page](https://github.com/EIHRTeam/AstMatrix/releases/latest).

2. Doble-click the downloaded `.ccx` file to let Adobe Creative Cloud Desktop App install the plugin.

    **Or**

    Open the `.ccx` file with zip archive software (e.g., 7-Zip, ShichiZip, Keka), extract the contents to the following directory:

    - Windows: `%APPDATA%\Roaming\Adobe\UXP\Plugins\External\`
    - macOS: `~/Library/Application Support/Adobe/UXP/Plugins/`

### Figma

1. Open [the Figma Community page of this project](https://www.figma.com/community/plugin/1693350407249302347).

2. Click the "Save" button to save the plugin to your Figma account.

3. Open a Figma file, go to the menu bar, and select "Plugins" > "Saved plugins" > "AstMatrix" to launch the plugin.

## Compatibility

### Complete Support

- Adobe Illustrator 2023 (and above)
- Adobe Photoshop 2026 (and above)
- Figma

### Partial Support

- Adobe Photoshop 2023~2024 (without web UI)

## Legal

Copyright © 2026 Endfield Industries Human Resource Team.

This project is licensed under the [Apache License, Version 2.0](LICENSE).

Privacy policy: [PRIVACY.md](https://github.com/EIHRTeam/AstMAtrix/blob/main/PRIVACY.md)
