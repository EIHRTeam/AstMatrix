# Windows installers

Four unsigned, per-user Windows 10/11 installers target x64 and aarch64 (Windows ARM64),
wrapping the existing Illustrator CEP ZIP and enhanced Photoshop CCX. Each installer accepts
only its target OS architecture and uses native 64-bit installation and registry access.
Plugin payloads are architecture-independent and stay offline. Inno Setup 7.1.1 is downloaded
at build time from its fixed official release and verified against its SHA-256 digest.
The build queries the compiler using `ISCC.exe --version` and checks its reported engine
version; the `ISCC.exe` PE `ProductVersion` resource is not a reliable version source.
CI installs the official x64 compiler edition (under x64 emulation on the Windows ARM64
runner). Both target packages explicitly use `SetupArchitecture=x86`, retaining Windows
10/11 ARM64 compatibility through Windows' x86 emulation. The aarch64 name identifies the
supported target OS, not a native ARM64 PE binary. The installer invokes system-native
PowerShell using Inno 7's `ExecAndLogOutputWithNativeSysDir`, preserving native 64-bit
registry access after Inno 7's file-system redirection changes. AppIds and management paths
remain unchanged by the compiler migration.

The manually triggered **Build Windows installers** workflow builds the selected commit,
runs repository checks, prepares Adobe archives on Ubuntu, and compiles installers on
Windows. It uploads Actions artifacts only; final artifacts last 30 days and intermediate
payloads last one day. A separate `windows-11-arm` job tests the aarch64 packages built by
the x64 job. **Release** remains manual and main-only, and waits for all four EXEs and
both architecture test jobs before publishing the three existing archives and four installers.
Each job checks out the same commit. The common composite action never publishes a release.

For local preparation on macOS/Linux, use Node 24 and pnpm 12.11.2:

```sh
pnpm build:illustrator
pnpm build:photoshop
node tooling/build-targets/verify-hosts.mjs --adobe-only
node tooling/packaging/prepare.mjs
```

Copy the entire generated `release` directory and check out the same commit on Windows.
Install Inno Setup 7.1.1, then set `ASTMATRIX_ISCC` to its `ISCC.exe` and run:

```powershell
$env:ASTMATRIX_ISCC = 'C:\Tools\Inno Setup 7\ISCC.exe'
pnpm build:inno --input-dir=release --output-dir=tmp/inno-output
```

The compiler validates archive provenance, manifest versions, host requirements, inventory
hashes, licenses, and required files. It rejects unsafe ZIP paths, duplicate names, symlinks,
ZIP64, encryption, and packages over 256 MiB uncompressed. Output contains four EXEs:
`AstMatrix-<host>-<version>-Setup.exe` for x64 (unchanged download name), and
`AstMatrix-<host>-<version>-aarch64-Setup.exe` for ARM64, for each of Illustrator and Photoshop.
Both architectures are compiled from the same validated payload. Output also contains
`installer-info.json`, and `SHA256SUMS.txt`; payload directories are temporary.

All four EXEs include English and Simplified Chinese. Standard wizard and uninstall messages
use Inno 7.1.1's bundled `Default.isl` and `Languages/ChineseSimplified.isl`; project messages
are maintained in `messages.iss`. Interactive setup shows a language selector, initially
selecting the system language or the previous installation language. English is the fallback.
Use `/LANG=english` or `/LANG=chinesesimplified` to select a language explicitly, including
silent installations. Uninstall uses the language saved by the latest installation.
Controller errors carry stable message keys for the localized UI; detailed technical and
Adobe diagnostics remain in `installer.log`. Unexpected errors show a translated summary
with the diagnostic log path.

Illustrator deploys to the current user's CEP extension directory and sets `PlayerDebugMode`
to `REG_SZ` `1` for CEP 11/12. Interactive uninstall offers an unchecked
**关闭 CEP 开发者模式 / Disable CEP developer mode** option. Selecting it sets existing CEP 11/12 `PlayerDebugMode`
values to `REG_SZ` `0`; other settings and CEP versions are untouched. This affects other
unsigned CEP extensions too. The default and silent uninstall retain developer mode.
Photoshop invokes the existing UPIA with a 120-second wait. Zero exit status still requires
a matching `/list all` entry and on-disk manifest. Missing/unlaunchable UPIA or known
initialization failures permit experimental extraction. Cancellation, package/host errors,
unknown failures and timeouts stop without extraction. Private Adobe registration JSON is
read only to detect conflicts and is never modified. An unresolved Adobe process is not killed.

Each installer stores its controller, state and diagnostics under LocalAppData. Extracted
files are inventoried; rollback restores the old payload if deployment fails, and removal
preserves modified or untracked files. Adobe-managed installations are removed via UPIA;
externally updated versions are preserved. A normal Photoshop installation already owns its
WebView dependencies; this installer does not install or repair them.

Setup detects the current user's previous Inno registration for the same host, displays the
installed and target versions, and updates in place after the user confirms installation.
The stable AppId and management directory are reused and are shared between target builds
for the same host. The same version can be reinstalled;
downgrades and inconsistent or missing registration/state are rejected. ZIP installations
are not adopted. Updates use the existing payload backup/rollback and Adobe UPIA flows,
without invoking the previous uninstaller first.

The native Inno uninstaller remains in the stable LocalAppData management directory.
Setup adds `Uninstall AstMatrix.lnk` / `卸载 AstMatrix.lnk` in the actual plugin directory and
`AstMatrix/Uninstall AstMatrix for <host>` / `AstMatrix/卸载 AstMatrix for <host>` in the current
user's Start menu, according to the selected language. The plugin shortcut
is inventoried separately in `uninstall-shortcut.json`, so it does not affect payload
integrity checks. Upgrades migrate the shortcut and remove an unchanged old entry; foreign
or modified plugin shortcuts are preserved. Language switches also migrate the shortcut
name; old Start menu entries are removed only if they target this installation's uninstaller
without extra arguments. Legacy state without a shortcut record or localized file name is supported.
The plugin shortcut uses Unicode Shell interfaces so its path, target and description do not
depend on the Windows ANSI code page. A shortcut failure after Inno commits the installation
returns a nonzero setup exit code; the committed installation remains available for repair or removal.
Plugin removal runs only after uninstall confirmation. A controller failure stops Inno
cleanup, retaining state and uninstall entry points for retry or diagnosis.

UPIA removes plugins by name. If `/list all` contains ambiguous AstMatrix entries, setup
retains the installation and asks the user to remove the Photoshop plugin through Creative
Cloud rather than risk removing a plugin for another host.

## Verification

`pnpm check` covers archive validation and provenance. The Windows composite action runs
the actual compiler, validates all four EXE versions, then runs `runtime.tests.ps1` under
Windows PowerShell 5.1 on x64. The ARM64 job downloads those same EXEs and runs
`runtime.tests.ps1 -Architecture aarch64` on Windows ARM64. Both jobs also verify that
the wrong-architecture package refuses installation before deploying plugin files.
Mocks are confined to the test scripts and are never embedded in EXEs. Cleanup and
uninstaller-process helpers shared by both test scripts live in `test-helpers.ps1`.
Runtime tests cover UPIA decisions, conflicts, preservation, and retry after failed fresh
installs, upgrades, and reinstalls. Rollback restores the old payload and removes only newly
created empty plugin directories, retaining foreign files (including hidden files).
EXE smoke tests use a separate AppData tree from runtime fixtures and temporary management
directories, install twice, and uninstall.
`upgrade.tests.ps1` additionally compiles isolated legacy and current installers with unique
test AppIds, then checks real version upgrades, shortcut migration, downgrade rejection,
cancelled dialogs, failed removal, and explicit CEP disable using Windows UI Automation.
Both languages run on each architecture, including switching languages during reinstall and
checking the uninstaller's saved language. Catalog tests check translation coverage and
interpolation placeholders; local PowerShell tests cover old-record and localized-name migration.
Windows runtime tests also exercise the real shortcut adapter with Unicode paths and descriptions.
An independent `IShellLinkW` reader inspects the original localized links without WScript's
ANSI conversion, and value mismatches report both expected and actual contents.
Upgrade tests check failure exit codes and recovery when a foreign shortcut blocks a language switch.
The legacy script fixture preserves the pre-upgrade installation format and lack of shortcuts;
its OS gate is parameterized for testing that state layout on ARM64 too, and its system
process launch is adapted to Inno 7's native-system API.
Fixture EXEs stay in a temporary directory and are never uploaded as release assets.
CEP registry values are restored after the tests. No Adobe host is available on hosted runners.

Before claiming host acceptance, manually record Windows version/architecture, Adobe and
Creative Cloud versions, installation method, and results for:

- A clean user with a Chinese username and paths containing spaces.
- x64 and ARM64 Windows, with the matching Adobe host and installer architecture.
- Illustrator CEP 11/12 and multiple installed host versions.
- Photoshop UPIA install, restart, panel loading and uninstall.
- Missing UPIA, experimental extraction and actual Photoshop loading.
- Upgrading, switching from extraction to UPIA, external updates and modified files.
- Missing WebView, cancelled installation, incompatible hosts and UPIA still running.

Extraction stays experimental until real Photoshop loading has been verified. A successful
build or file deployment is never reported as Adobe host acceptance.
