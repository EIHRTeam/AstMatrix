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

## Index

- [Installation](#installation)
  - [Adobe Illustrator](#adobe-illustrator)
  - [Adobe Photoshop](#adobe-photoshop)
  - [Figma](#figma)
- [Compatibility](#compatibility)
- [Supported Encoding Formats](#supported-encoding-formats)

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

## Supported Encoding Formats

<table>
  <thead>
    <tr>
      <th>Category</th>
      <th>Formats and presets</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <th rowspan="9" scope="rowgroup">Retail</th>
      <td>EAN-8</td>
    </tr>
    <tr>
      <td>EAN-13</td>
    </tr>
    <tr>
      <td>EAN-14 / GS1-128</td>
    </tr>
    <tr>
      <td>EAN-8 Composite</td>
    </tr>
    <tr>
      <td>EAN-13 Composite</td>
    </tr>
    <tr>
      <td>UPC-A</td>
    </tr>
    <tr>
      <td>UPC-E</td>
    </tr>
    <tr>
      <td>UPC-A Composite</td>
    </tr>
    <tr>
      <td>UPC-E Composite</td>
    </tr>
    <tr>
      <th rowspan="12" scope="rowgroup">Industrial</th>
      <td>Code-128</td>
    </tr>
    <tr>
      <td>Code-11</td>
    </tr>
    <tr>
      <td>Code-2of5 Interleaved</td>
    </tr>
    <tr>
      <td>Code-39</td>
    </tr>
    <tr>
      <td>Code-39 Full ASCII</td>
    </tr>
    <tr>
      <td>Code-93</td>
    </tr>
    <tr>
      <td>Flattermarken</td>
    </tr>
    <tr>
      <td>GS1-128</td>
    </tr>
    <tr>
      <td>MSI</td>
    </tr>
    <tr>
      <td>Pharmacode One-Track</td>
    </tr>
    <tr>
      <td>Pharmacode Two-Track</td>
    </tr>
    <tr>
      <td>Telepen Alpha</td>
    </tr>
    <tr>
      <th rowspan="5" scope="rowgroup">Publication</th>
      <td>ISBN 13</td>
    </tr>
    <tr>
      <td>ISBN 13 + 5 Digits</td>
    </tr>
    <tr>
      <td>ISMN</td>
    </tr>
    <tr>
      <td>ISSN</td>
    </tr>
    <tr>
      <td>ISSN + 2 Digits</td>
    </tr>
    <tr>
      <th rowspan="15" scope="rowgroup">Matrix and stacked</th>
      <td>QR Code</td>
    </tr>
    <tr>
      <td>QR Mobile/Smartphone</td>
    </tr>
    <tr>
      <td>Data Matrix</td>
    </tr>
    <tr>
      <td>Aztec</td>
    </tr>
    <tr>
      <td>Codablock-F</td>
    </tr>
    <tr>
      <td>MaxiCode</td>
    </tr>
    <tr>
      <td>MicroPDF417</td>
    </tr>
    <tr>
      <td>PDF417</td>
    </tr>
    <tr>
      <td>Micro QR Code</td>
    </tr>
    <tr>
      <td>Han Xin</td>
    </tr>
    <tr>
      <td>DotCode</td>
    </tr>
    <tr>
      <td>Royal Mail Mailmark 2D</td>
    </tr>
    <tr>
      <td>NTIN Code</td>
    </tr>
    <tr>
      <td>PPN Code</td>
    </tr>
    <tr>
      <td>Code 49</td>
    </tr>
  </tbody>
</table>

## Legal

Copyright © 2026 Endfield Industries Human Resource Team.

This project is licensed under the [Apache License, Version 2.0](LICENSE).

Privacy policy: [PRIVACY.md](https://github.com/EIHRTeam/AstMAtrix/blob/main/PRIVACY.md)
