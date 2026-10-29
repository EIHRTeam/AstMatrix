# Windows installers

Two unsigned, per-user Windows 10/11 x64 installers wrap the existing Illustrator CEP ZIP
and enhanced Photoshop CCX. Plugin payloads stay offline. Inno Setup 6.7.4 is downloaded
at build time from its fixed official release and verified against its SHA-256 digest.

The manually triggered **Build Windows installers** workflow builds the selected commit,
runs repository checks, prepares Adobe archives on Ubuntu, and compiles installers on
Windows. It uploads Actions artifacts only; final artifacts last 30 days and intermediate
payloads last one day. **Release** remains manual and main-only, and waits for both EXEs
before publishing the three existing archives and two installers. Each job checks out the
same commit. The common composite action never publishes a release.

For local preparation on macOS/Linux, use Node 24 and pnpm 12.11.2:

```sh
pnpm build:illustrator
pnpm build:photoshop
node tooling/build-targets/verify-hosts.mjs --adobe-only
node tooling/packaging/prepare.mjs
```

Copy the entire generated `release` directory and check out the same commit on Windows.
Install Inno Setup 6.7.4, then set `ASTMATRIX_ISCC` to its `ISCC.exe` and run:

```powershell
$env:ASTMATRIX_ISCC = 'C:\Tools\Inno Setup 6\ISCC.exe'
pnpm build:inno --input-dir=release --output-dir=tmp/inno-output
```

The compiler validates archive provenance, manifest versions, host requirements, inventory
hashes, licenses, and required files. It rejects unsafe ZIP paths, duplicate names, symlinks,
ZIP64, encryption, and packages over 256 MiB uncompressed. Output contains the two EXEs,
`installer-info.json`, and `SHA256SUMS.txt`; payload directories are temporary.

Illustrator deploys to the current user's CEP extension directory and sets `PlayerDebugMode`
to `REG_SZ` `1` for CEP 11/12. These shared settings are deliberately retained on uninstall.
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

UPIA removes plugins by name. If `/list all` contains ambiguous AstMatrix entries, setup
retains the installation and asks the user to remove the Photoshop plugin through Creative
Cloud rather than risk removing a plugin for another host.

## Verification

`pnpm check` covers archive validation and provenance. The Windows composite action runs
the actual compiler, validates EXE versions, then runs `runtime.tests.ps1` under Windows
PowerShell 5.1. Mocks are confined to the test script and are never embedded in EXEs.
Runtime tests cover UPIA decisions, conflicts and preservation. EXE smoke tests redirect
AppData and management directories to a temporary tree, install twice, and uninstall.
CEP registry values are restored after the tests. No Adobe host is available on hosted runners.

Before claiming host acceptance, manually record Windows version/architecture, Adobe and
Creative Cloud versions, installation method, and results for:

- A clean user with a Chinese username and paths containing spaces.
- Illustrator CEP 11/12 and multiple installed host versions.
- Photoshop UPIA install, restart, panel loading and uninstall.
- Missing UPIA, experimental extraction and actual Photoshop loading.
- Upgrading, switching from extraction to UPIA, external updates and modified files.
- Missing WebView, cancelled installation, incompatible hosts and UPIA still running.

Extraction stays experimental until real Photoshop loading has been verified. A successful
build or file deployment is never reported as Adobe host acceptance.
