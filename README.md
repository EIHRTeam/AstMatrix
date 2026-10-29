# AstMatrix

[![CodeQL](https://github.com/EIHRTeam/AstMatrix/actions/workflows/codeql.yml/badge.svg)](https://github.com/EIHRTeam/AstMatrix/actions/workflows/codeql.yml)
[![CI](https://github.com/EIHRTeam/AstMatrix/actions/workflows/ci.yml/badge.svg)](https://github.com/EIHRTeam/AstMatrix/actions/workflows/ci.yml)<br>
[![License: Apache 2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg?style=flat-square&label=License)](LICENSE)
[![Version](https://img.shields.io/github/v/release/EIHRTeam/AstMatrix?style=flat-square&label=Version&color=blue)](https://github.com/EIHRTeam/AstMatrix/releases/latest)<br>
[![TypeScript 7](https://img.shields.io/badge/TypeScript-7-blue.svg?logo=typescript&style=flat-square&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js 24](https://img.shields.io/badge/Node.js-24-339933.svg?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![React 19](https://img.shields.io/badge/React-19-61DAFB.svg?style=flat-square&logo=react&logoColor=white)](https://react.dev)

_"Let me be the guiding star for all"_

A lightweight yet powerful muti-formats QR Code & Barcode generator for Adobe Illustrator, Adobe Photoshop and Figma.

## Index

- [Compatibility](#compatibility)
- [Supported Encoding Formats](#supported-encoding-formats)
- [Installation](#installation)
  - [Adobe Illustrator](#adobe-illustrator)
  - [Adobe Photoshop](#adobe-photoshop)
  - [Figma](#figma)

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

## Installation

### Adobe Illustrator

**Windows installer (.exe)**

1. Download `AstMatrix-Illustrator-<version>-Setup.exe` from the [Releases page](https://github.com/EIHRTeam/AstMatrix/releases/latest), close Illustrator, and run it on Windows 10/11 x64.
2. The installer deploys the extension for the current user and enables the shared CEP 11/12 `PlayerDebugMode` settings (`REG_SZ`, `1`). These settings are retained on uninstall so other unsigned extensions keep working.
3. Restart Illustrator and select "Window" > "Extensions" > "AstMatrix". Supported Illustrator versions are 27.x through 30.9.x.

Upgrade by running a newer installer. Remove it through Windows Installed apps. EXE installers are unsigned; plugin resources are included and no plugin or Adobe runtime is downloaded during setup.

**Via Adobe Creative Cloud**

1. Make sure Adobe Creative Cloud is installed and that you are signed in with your Adobe account.
2. Open the [Adobe Exchange page](https://exchange.adobe.com/apps/cc/206104/astmatrix), or search "**AstMatrix**" in the Creative Cloud desktop app.
3. Install the plugin.
4. Open Illustrator (or restart it completely if it is already running), then select "Window" > "Extensions" > "AstMatrix" to launch the plugin.

**Manual**

1. Download the latest Illustrator `.zip` package from the [Releases page](https://github.com/EIHRTeam/AstMatrix/releases/latest).
2. Make sure Adobe Illustrator is installed and completely closed.
3. Open the downloaded `.zip` file using a ZIP archive utility (e.g., 7-Zip, ShichiZip, or Keka). Its contents start with `CSXS/manifest.xml`, without an enclosing `AstMatrix` folder.
4. Create an `AstMatrix` folder in the following directory, then extract all archive contents into it:

   - Windows: `%APPDATA%\Adobe\CEP\extensions\`
   - macOS: `~/Library/Application Support/Adobe/CEP/extensions/`

   Create the `extensions` folder if it does not already exist. The final manifest path must be `extensions/AstMatrix/CSXS/manifest.xml`, without an extra nested folder.

5. Because the manually installed plugin is unsigned, enable CEP debug mode by setting `PlayerDebugMode` for the CEP version used by Illustrator:

   - Windows: Press Windows + R, enter `regedit`, and open Registry Editor. Navigate to `HKEY_CURRENT_USER\Software\Adobe\CSXS.12` (create the key if necessary), create a String Value (`REG_SZ`) named `PlayerDebugMode`, and set its value to `1`.
   - macOS: Open Terminal via Spotlight (Command + Space), then run:

     ```sh
     defaults write com.adobe.CSXS.12 PlayerDebugMode 1
     ```

   These examples use CEP 12. If your Illustrator version uses a different CEP version, replace `12` with the corresponding version number (e.g., `11` for CEP 11). Enable this setting only for plugins from sources you trust.

6. Open Illustrator (or restart it completely if it is already running), then select "Window" > "Extensions" > "AstMatrix" to launch the plugin.

### Adobe Photoshop

**Windows installer (.exe)**

1. Download `AstMatrix-Photoshop-<version>-Setup.exe` from the [Releases page](https://github.com/EIHRTeam/AstMatrix/releases/latest), close Photoshop, and run it on Windows 10/11 x64. This package requires Photoshop 26.0 or later and its Adobe WebView dependencies.
2. Setup first uses the existing Adobe Unified Plugin Installer Agent (UPIA). If UPIA is missing, cannot start, or reports a recognized environment failure, setup attempts **experimental extraction** into a versioned plugin directory. It does not edit Adobe's internal plugin registration JSON.
3. Restart Photoshop and check "Plugins" > "AstMatrix". **Extraction confirms file deployment only; Photoshop loading is not verified.** Cancelled, incompatible, invalid-package, conflicting-installation, and unresolved UPIA operations do not trigger extraction.

Upgrade by running a newer installer; downgrades are rejected. Remove it through Windows Installed apps. Setup uses the recorded installation method for removal and preserves externally updated or modified plugin files. Diagnostics are saved to `%LOCALAPPDATA%\AstMatrix\Installers\Photoshop\installer.log`. EXE installers are unsigned and include all plugin resources; setup does not download UPIA or Adobe runtimes.

**Via Adobe Creative Cloud**

1. Make sure Adobe Creative Cloud is installed and that you are signed in with your Adobe account.
2. Open the [Adobe Exchange page](https://exchange.adobe.com/apps/cc/1f4db629/astmatrix-for-photoshop), or search "**AstMatrix for Photoshop**" in the Creative Cloud desktop app.
3. Install the plugin.
4. Open Photoshop (or restart it completely if it is already running), then select "Plugins" > "AstMatrix" to launch the plugin.

**Via Adobe Creative Cloud (.ccx file)**

1. Download the latest Photoshop `.ccx` package from the [Releases page](https://github.com/EIHRTeam/AstMatrix/releases/latest).
2. Make sure Adobe Creative Cloud is installed and that you are signed in with your Adobe account.
3. Double-click the downloaded `.ccx` file, or open it using the Adobe Creative Cloud desktop app.
4. Confirm the non-marketplace plugin installation prompt by clicking "Install" (or "Install locally", depending on your Creative Cloud version).
5. Open Photoshop (or restart it completely if it is already running), then select "Plugins" > "AstMatrix" to launch the plugin.

**Via Adobe Universal Plugin Installer Agent (UPIA)**

1. Download the latest Photoshop `.ccx` package from the [Releases page](https://github.com/EIHRTeam/AstMatrix/releases/latest).
2. Make sure Adobe Creative Cloud version 5.7 or later is installed.
3. Run the command for your operating system. Replace the example `.ccx` path with the path to your downloaded file, keeping the quotation marks:

   - Windows: Press Windows + R, enter `cmd`, and run in CMD:

     ```bat
     "C:\Program Files\Common Files\Adobe\Adobe Desktop Common\RemoteComponents\UPI\UnifiedPluginInstallerAgent\UnifiedPluginInstallerAgent.exe" /install "C:\path\to\AstMatrix.ccx"
     ```

   - macOS: Open Terminal via Spotlight (Command + Space), then run:

     ```sh
     "/Library/Application Support/Adobe/Adobe Desktop Common/RemoteComponents/UPI/UnifiedPluginInstallerAgent/UnifiedPluginInstallerAgent.app/Contents/MacOS/UnifiedPluginInstallerAgent" --install "/path/to/AstMatrix.ccx"
     ```

   See Adobe's [How to Install UXP Plugins Using Command Line Tools](https://blog.developer.adobe.com/en/publish/2022/03/how-to-install-uxp-plugins-using-command-line-tools) for details.

4. Open Photoshop (or restart it completely if it is already running), then select "Plugins" > "AstMatrix" to launch the plugin.

**Manual extraction (experimental)**

1. Download the latest Photoshop `.ccx` package from the [Releases page](https://github.com/EIHRTeam/AstMatrix/releases/latest).
2. Open the `.ccx` file using a ZIP archive utility (e.g., 7-Zip, ShichiZip, or Keka).
3. Extract its contents to the following directory:

   - Windows: `%APPDATA%\Adobe\UXP\Plugins\External\1f4db629_<version>\` (create this plugin-specific directory; `manifest.json` must be directly inside it)
   - macOS: `~/Library/Application Support/Adobe/UXP/Plugins/`

4. Open Photoshop (or restart it completely if it is already running), then select "Plugins" > "AstMatrix" to launch the plugin.

Extraction may not register the plugin with current Photoshop/Creative Cloud versions. If it does not appear, use Creative Cloud or UPIA instead; do not modify Adobe's internal registration JSON. Avoid keeping extracted and Adobe-managed copies of the same plugin together.

### Figma

**Via Figma Community**

1. Open [the Figma Community page of this project](https://www.figma.com/community/plugin/1693350407249302347).

2. Click the "Save" button to save the plugin to your Figma account.

3. Open a Figma file, go to the menu bar, and select "Plugins" > "Saved plugins" > "AstMatrix" to launch the plugin.

**From GitHub Releases (Figma Desktop)**

1. Download `AstMatrix-Figma-<version>.zip` from the [Releases page](https://github.com/EIHRTeam/AstMatrix/releases/latest).
2. Extract the entire archive and keep its files together.
3. In Figma Desktop, select "Plugins" > "Development" > "Import plugin from manifest" and choose the extracted `manifest.json`.
4. Open a Figma Design file, then select "Plugins" > "Development" > "AstMatrix" to launch the plugin.

## Legal

Copyright © 2026 Endfield Industries Human Resource Team.

This project is licensed under the [Apache License, Version 2.0](LICENSE).

Privacy policy: [PRIVACY.md](https://github.com/EIHRTeam/AstMAtrix/blob/main/PRIVACY.md)
