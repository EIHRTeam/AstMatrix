# No Pester dependency. All mocks live in this test file, never in the shipped installer.
param(
  [string]$InstallerDirectory,
  [ValidateSet('x64', 'aarch64')][string]$Architecture = 'x64'
)
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/runtime.ps1"

function Assert($Condition, $Message) { if (!$Condition) { throw "Assertion failed: $Message" } }
function Assert-Throws([scriptblock]$Action, $Message) {
  $caught = $false
  try { & $Action } catch { $caught = $true }
  Assert $caught $Message
}

$root = Join-Path ([IO.Path]::GetTempPath()) ('astmatrix-tests-' + [guid]::NewGuid())
$originalAppData = $env:APPDATA
$originalCommon = $env:CommonProgramFiles
$originalCommon64 = $env:CommonProgramW6432
$originalCommon86 = ${env:CommonProgramFiles(x86)}
$savedRegistry = @()
$windows = [Environment]::OSVersion.Platform -eq [PlatformID]::Win32NT
try {
  [IO.Directory]::CreateDirectory($root) | Out-Null
  $env:APPDATA = Join-Path $root ('User name with spaces ' + [char]0x6d4b + [char]0x8bd5)
  [IO.Directory]::CreateDirectory($env:APPDATA) | Out-Null
  $env:CommonProgramFiles = Join-Path $root 'Common'
  $env:CommonProgramW6432 = $env:CommonProgramFiles
  ${env:CommonProgramFiles(x86)} = $env:CommonProgramFiles
  $HostName = 'Photoshop'
  $AppVersion = '0.1.2'
  $ManagerDir = Join-Path $root 'manager'
  $PayloadDir = Join-Path $root 'payload'
  $ArchivePath = Join-Path $root 'AstMatrix.ccx'
  [IO.Directory]::CreateDirectory($PayloadDir) | Out-Null
  [IO.File]::WriteAllText((Join-Path $PayloadDir 'manifest.json'), '{"id":"1f4db629","version":"0.1.2"}')
  [IO.File]::WriteAllText((Join-Path $PayloadDir 'index.js'), '// fixture')
  $entries = @('manifest.json', 'index.js') | ForEach-Object { @{ path = $_; sha256 = (Get-FileHash (Join-Path $PayloadDir $_)).Hash } }
  Write-JsonFile (Join-Path $PayloadDir 'payload-files.json') @($entries)

  & {
    $ValidateRegistration = $true
    $RegisteredVersion = ''
    Assert-Registration $null
    $legacyState = [pscustomobject]@{ version = '0.1.1' }
    Assert-Throws { Assert-Registration $legacyState } 'orphaned state cannot be overwritten'
    $RegisteredVersion = '0.1.1'
    Assert-Registration $legacyState
    Assert-Throws { Assert-Registration $null } 'registered install requires state'
    Assert-Throws { Assert-Registration ([pscustomobject]@{ version = '0.1.2' }) } 'registry and state version must agree'
  }

  & {
    $ManagerDir = Join-Path $root 'shortcut manager'
    [IO.Directory]::CreateDirectory($ManagerDir) | Out-Null
    $UninstallerPath = Join-Path $ManagerDir 'unins000.exe'
    [IO.File]::WriteAllText($UninstallerPath, 'uninstaller fixture')
    # Mock only the COM adapter, keeping path validation, inventory and migration real.
    function Write-UninstallShortcut($Path) { [IO.File]::WriteAllText($Path, $UninstallerPath) }
    $first = Join-Path $root 'Adobe actual path'
    $second = Join-Path $root 'Adobe updated path'
    [IO.Directory]::CreateDirectory($first) | Out-Null
    [IO.Directory]::CreateDirectory($second) | Out-Null
    $shortcutState = @{ mode = 'upia'; pluginPath = $first; path = 'must not use the extraction path' }
    Install-UninstallShortcut $shortcutState
    Assert ((Get-ShortcutRecord).directory -eq $first) 'UPIA shortcut uses actual pluginPath'
    Install-UninstallShortcut $shortcutState
    Assert (Test-Path (Get-ShortcutPath $first)) 'repeat shortcut creation works'
    & {
      function Write-JsonFile { throw 'Injected shortcut inventory failure' }
      Assert-Throws { Install-UninstallShortcut $shortcutState } 'shortcut commit failure propagates'
      Assert ((Get-FileHash (Get-ShortcutPath $first)).Hash -eq (Get-ShortcutRecord).sha256) 'shortcut failure restores the old link'
    }
    $shortcutState.pluginPath = $second
    Install-UninstallShortcut $shortcutState
    Assert (!(Test-Path (Get-ShortcutPath $first))) 'migration removes unchanged old shortcut'
    Assert (Test-Path (Get-ShortcutPath $second)) 'migration creates new shortcut'
    [IO.File]::WriteAllText((Get-ShortcutPath $second), 'foreign modification')
    Assert-Throws { Install-UninstallShortcut $shortcutState } 'modified shortcut cannot be overwritten'
    Remove-UninstallShortcut (Get-ShortcutRecord)
    Assert (Test-Path (Get-ShortcutPath $second)) 'modified shortcut survives removal'
  }

  foreach ($code in @(-175, -402, -403, -410, -411, -204, -999, 1602, 1223)) {
    Assert ((Get-UpiaDisposition @{ status = 'exited'; code = $code; text = '' }) -eq 'stop') "UPIA code $code must not extract"
  }
  Assert ((Get-UpiaDisposition @{ status = 'unknown'; code = $null; text = '' }) -eq 'stop') 'timeout must not extract'
  Assert ((Get-UpiaDisposition @{ status = 'start-failed'; code = $null; text = '' }) -eq 'fallback') 'launch failure permits fallback'
  Assert ((Get-UpiaDisposition @{ status = 'exited'; code = -192; text = '' }) -eq 'fallback') 'known environment failure permits fallback'
  Assert ((Get-UpiaDisposition @{ status = 'exited'; code = 0; text = '' }) -eq 'verify') 'zero requires verification'

  # Exercise the real native-process adapter before replacing it with state-machine mocks.
  $shell = Join-Path $PSHOME $(if ($windows) { 'powershell.exe' } else { 'pwsh' })
  $native = Invoke-Upia $shell '-NoLogo -NoProfile -NonInteractive -Command "[Console]::Out.WriteLine(''stdout''); [Console]::Error.WriteLine(''stderr''); exit 0"'
  Assert ($native.status -eq 'exited' -and $native.code -eq 0 -and $native.text -match 'stdout' -and $native.text -match 'stderr') 'native process captures both streams'
  $native = Invoke-Upia $shell '-NoLogo -NoProfile -NonInteractive -Command "exit 7"'
  Assert ($native.status -eq 'exited' -and $native.code -eq 7) 'native process captures exit code'
  $native = Invoke-Upia (Join-Path $root 'missing-upia.exe') '/install missing.ccx'
  Assert ($native.status -eq 'start-failed') 'native process reports launch failure'

  function Find-Upia { return $null }
  function Test-AdobeRegistration { return $false }
  function Get-InstalledPlugins { return @() }

  & {
    $state = Install-Photoshop $null
    Assert ($state.mode -eq 'extracted') 'missing UPIA extracts'
    Assert ($state.files.Count -eq 2 -and $state.files[0].path -is [string]) 'JSON payload inventory is flat in Windows PowerShell 5.1 and PowerShell 7'
    Assert ((Get-State).path -eq $state.path) 'UTF-8 state preserves Chinese usernames in Windows PowerShell 5.1'
    Assert (Test-OwnedFiles (Get-State)) 'persisted file inventory can be read back for repeat installation'
    Assert (Test-OwnedFiles $state) 'deployed files match inventory'
    Assert ($null -eq (Get-ShortcutRecord)) 'legacy state needs no shortcut record'
    $state = Install-Photoshop $state
    Assert (Test-OwnedFiles $state) 'repeat installation works'
    & {
      $previous = $state
      $AppVersion = '0.1.3'
      [IO.File]::WriteAllText((Join-Path $PayloadDir 'manifest.json'), '{"id":"1f4db629","version":"0.1.3"}')
      [IO.File]::WriteAllText((Join-Path $PayloadDir 'index.js'), '// upgraded')
      $entries = @('manifest.json', 'index.js') | ForEach-Object { @{ path = $_; sha256 = (Get-FileHash (Join-Path $PayloadDir $_)).Hash } }
      Write-JsonFile (Join-Path $PayloadDir 'payload-files.json') @($entries)
      $upgraded = Install-Payload $previous
      Assert (Test-OwnedFiles $upgraded) 'upgrade files match inventory'
      Assert (!(Test-Path (Join-Path $previous.path 'manifest.json'))) 'old version files cleaned after upgrade'
      Remove-OwnedFiles $upgraded
    }
    [IO.File]::WriteAllText((Join-Path $PayloadDir 'manifest.json'), '{"id":"1f4db629","version":"0.1.2"}')
    [IO.File]::WriteAllText((Join-Path $PayloadDir 'index.js'), '// fixture')
    $entries = @('manifest.json', 'index.js') | ForEach-Object { @{ path = $_; sha256 = (Get-FileHash (Join-Path $PayloadDir $_)).Hash } }
    Write-JsonFile (Join-Path $PayloadDir 'payload-files.json') @($entries)
    $state = Install-Payload $null
    & {
      $AppVersion = '0.1.3'
      $script:failCopy = $true
      function Copy-Item {
        param([string]$LiteralPath, [string]$Destination, [switch]$Force)
        if ($script:failCopy -and $LiteralPath -eq (Join-Path $PayloadDir 'index.js')) { $script:failCopy = $false; throw 'Injected copy failure' }
        Microsoft.PowerShell.Management\Copy-Item -LiteralPath $LiteralPath -Destination $Destination -Force:$Force
      }
      Assert-Throws { Install-Payload $state } 'failed deployment throws'
      Assert (Test-OwnedFiles $state) 'failed deployment restored previous files'
      Assert ((Get-State).version -eq $state.version) 'failed deployment retained previous state'
      Assert (!(Test-Path (Join-Path (Get-PluginDestination $AppVersion) 'manifest.json'))) 'failed upgrade left no new plugin manifest'
    }
    Assert-Throws { Get-SafeFilePath $state.path '../foreign.txt' } 'traversal rejected'
    [IO.File]::WriteAllText((Join-Path $state.path 'index.js'), '// modified externally')
    Uninstall-Plugin $state
    Assert (Test-Path (Join-Path $state.path 'manifest.json')) 'modified plugin is preserved'
    Assert-Throws { Install-Payload $state } 'modified plugin cannot be overwritten'
    Copy-Item (Join-Path $PayloadDir 'index.js') (Join-Path $state.path 'index.js') -Force
    [IO.File]::WriteAllText((Join-Path $state.path 'foreign.txt'), 'not ours')
    Uninstall-Plugin $state
    Assert (Test-Path (Join-Path $state.path 'foreign.txt')) 'untracked file survives uninstall'
    Assert (!(Test-Path (Join-Path $state.path 'manifest.json'))) 'owned files removed'
    Remove-Item -LiteralPath $state.path -Recurse
  }

  $script:UpiaResult = @{ status = 'exited'; code = 0; text = '' }
  $script:ListResult = @{ status = 'exited'; code = 0; text = "Enabled AstMatrix $AppVersion" }
  $script:Installed = @()
  $script:InstallCalls = 0
  function Find-Upia { return 'mock-upia.exe' }
  function Get-InstalledPlugins { return $script:Installed }
  function Invoke-Upia($Executable, $Arguments) {
    if ($Arguments.StartsWith('/install')) {
      $script:InstallCalls++
      if ($script:UpiaResult.status -eq 'exited' -and $script:UpiaResult.code -eq 0) {
        $script:Installed = @([pscustomobject]@{ version = $AppVersion; path = 'C:\Adobe\ManagedPlugin' })
      }
      return $script:UpiaResult
    }
    return $script:ListResult
  }
  $managed = Install-Photoshop $null
  Assert ($managed.mode -eq 'upia') 'UPIA success verified by list and manifest'
  $script:Installed = @()
  $script:ListResult = @{ status = 'exited'; code = 0; text = 'Enabled SomeOtherPlugin 0.1.2' }
  Assert-Throws { Install-Photoshop $null } 'success without matching list stops'
  $script:Installed = @()
  foreach ($status in @('unknown', 'exited')) {
    $script:UpiaResult = @{ status = $status; code = -175; text = 'cancelled or unresolved' }
    Assert-Throws { Install-Photoshop $null } 'cancelled or unknown install cannot extract'
  }
  & {
    foreach ($result in @(@{ status = 'start-failed'; code = $null; text = '' }, @{ status = 'exited'; code = -192; text = '' })) {
      $script:UpiaResult = $result
      $state = Install-Photoshop $null
      Assert ($state.mode -eq 'extracted') 'confirmed fallback installs'
      Remove-OwnedFiles $state
    }
  }
  $script:Installed = @([pscustomobject]@{ version = $AppVersion; path = 'C:\Adobe\ManagedPlugin' })
  $script:UpiaResult = @{ status = 'exited'; code = -192; text = 'failure' }
  Assert-Throws { Install-Photoshop $null } 'managed install blocks fallback'
  $script:RemoveCalls = 0
  $script:Ambiguous = $true
  function Invoke-Upia($Executable, $Arguments) {
    if ($Arguments.StartsWith('/remove')) { $script:RemoveCalls++; $script:Installed = @(); return @{ status = 'exited'; code = 0; text = '' } }
    $text = ''
    if ($script:Installed.Count) { $text = "Enabled AstMatrix $AppVersion" }
    if ($script:Ambiguous) { $text += "`nEnabled AstMatrix $AppVersion" }
    return @{ status = 'exited'; code = 0; text = $text }
  }
  Assert-Throws { Uninstall-Plugin $managed } 'ambiguous UPIA names cannot be removed'
  Assert ($script:RemoveCalls -eq 0) 'ambiguous UPIA name did not execute remove'
  $script:Ambiguous = $false
  Uninstall-Plugin $managed
  Assert ($script:RemoveCalls -eq 1 -and !$script:Installed.Count) 'Adobe-managed installation removed via UPIA and verified'
  $script:Installed = @([pscustomobject]@{ version = '99.0.0'; path = 'C:\Adobe\ManagedPlugin' })
  $script:RemoveCalls = 0
  function Invoke-Upia { $script:RemoveCalls++; throw 'Must not remove externally updated version' }
  Uninstall-Plugin $managed
  Assert ($script:RemoveCalls -eq 0) 'externally updated plugin preserved'
  Assert-Throws { Install-Photoshop $null } 'downgrade rejected'

  & {
    $Operation = 'preflight'
    $AppVersion = '0.1.1'
    function Assert-NoHostProcess {}
    function Test-HostCompatibility { return 'compatible' }
    function Get-State { return $managed }
    Assert-Throws { Invoke-Installer } 'controller rejects downgrade before modifying payload'
    $Operation = 'uninstall'
    & {
      $DisableCepDeveloperMode = $true
      $script:removed = $false
      function Uninstall-Plugin { $script:removed = $true }
      Assert-Throws { Invoke-Installer } 'Photoshop rejects the Illustrator-only switch'
      Assert (!$script:removed) 'invalid switch cannot start removal'
    }
    function Uninstall-Plugin { throw 'Injected removal failure' }
    $before = Get-Content (Join-Path $ManagerDir 'state.json') -Raw
    Assert-Throws { Invoke-Installer } 'removal failure propagates'
    Assert ((Get-Content (Join-Path $ManagerDir 'state.json') -Raw) -eq $before) 'removal failure retains persisted state'
  }

  if ($InstallerDirectory) {
    Assert $windows 'EXE smoke tests require Windows'
    $nativeArchitecture = [Environment]::GetEnvironmentVariable('PROCESSOR_ARCHITEW6432')
    if (!$nativeArchitecture) { $nativeArchitecture = $env:PROCESSOR_ARCHITECTURE }
    Assert (($Architecture -eq 'aarch64') -eq ($nativeArchitecture -eq 'ARM64')) 'installer tests must run on the requested native OS architecture'
    # Preserve any prior shared setting; hosted runners should have none.
    foreach ($cep in @(11, 12)) {
      $keyPath = "Software\Adobe\CSXS.$cep"
      $key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($keyPath)
      $entry = @{ key = $keyPath; exists = $false; value = $null; kind = $null }
      if ($key) {
        if ($key.GetValueNames() -contains 'PlayerDebugMode') { $entry.exists = $true; $entry.value = $key.GetValue('PlayerDebugMode'); $entry.kind = $key.GetValueKind('PlayerDebugMode') }
        $key.Dispose()
      }
      $savedRegistry += $entry
    }
    $version = (Get-Content (Join-Path $PSScriptRoot '../../../package.json') -Raw -Encoding UTF8 | ConvertFrom-Json).version
    foreach ($hostName in @('Illustrator', 'Photoshop')) {
      $manager = Join-Path $root "$hostName manager"
      $suffix = if ($Architecture -eq 'aarch64') { '-aarch64' } else { '' }
      $setup = (Resolve-Path (Join-Path $InstallerDirectory "AstMatrix-$hostName-$version$suffix-Setup.exe")).Path
      $otherSuffix = if ($Architecture -eq 'aarch64') { '' } else { '-aarch64' }
      $wrongSetup = (Resolve-Path (Join-Path $InstallerDirectory "AstMatrix-$hostName-$version$otherSuffix-Setup.exe")).Path
      $process = Start-Process $wrongSetup -ArgumentList @('/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', "/DIR=`"$manager`"") -Wait -PassThru
      Assert ($process.ExitCode -ne 0 -and !(Test-Path (Join-Path $manager 'state.json'))) 'wrong architecture is rejected before deployment'
      foreach ($attempt in @(1, 2)) {
        $process = Start-Process $setup -ArgumentList @('/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', "/DIR=`"$manager`"", "/LOG=`"$root\$hostName-$attempt.log`"") -Wait -PassThru
        Assert ($process.ExitCode -eq 0) "$hostName EXE installation $attempt"
      }
      $record = Get-Content (Join-Path $manager 'state.json') -Raw -Encoding UTF8 | ConvertFrom-Json
      Assert ($record.mode -eq 'extracted') 'host-free smoke test follows extraction path'
      $shortcutRecord = Get-Content (Join-Path $manager 'uninstall-shortcut.json') -Raw -Encoding UTF8 | ConvertFrom-Json
      Assert ($shortcutRecord.directory -eq $record.path) 'plugin uninstall shortcut is recorded separately'
      Assert (Test-Path (Get-ShortcutPath $record.path)) 'plugin uninstall shortcut exists'
      $startMenu = Join-Path ([Environment]::GetFolderPath('Programs')) "AstMatrix\卸载 AstMatrix for $hostName.lnk"
      $wscript = New-Object -ComObject WScript.Shell
      try {
        foreach ($link in @((Get-ShortcutPath $record.path), $startMenu)) {
          Assert (Test-Path $link) 'uninstall entry point exists'
          Assert ($wscript.CreateShortcut($link).TargetPath -eq (Join-Path $manager 'unins000.exe')) 'entry point targets stable Inno uninstaller'
        }
      } finally { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($wscript) }
      if ($hostName -eq 'Illustrator') {
        foreach ($cep in @(11, 12)) {
          $key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey("Software\Adobe\CSXS.$cep")
          try { Assert ($key.GetValueKind('PlayerDebugMode') -eq 'String' -and $key.GetValue('PlayerDebugMode') -eq '1') 'CEP setting is REG_SZ 1' } finally { $key.Dispose() }
        }
      }
      $process = Start-Process (Join-Path $manager 'unins000.exe') -ArgumentList @('/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', "/LOG=`"$root\$hostName-uninstall.log`"") -Wait -PassThru
      Assert ($process.ExitCode -eq 0) "$hostName EXE uninstall"
      Assert (!(Test-Path (Join-Path $record.path $(if ($hostName -eq 'Photoshop') {'manifest.json'} else {'CSXS\manifest.xml'})))) 'uninstall removed plugin manifest'
      Assert (!(Test-Path $startMenu) -and !(Test-Path (Get-ShortcutPath $record.path))) 'uninstall removed both entry points'
      if ($hostName -eq 'Illustrator') {
        foreach ($cep in @(11, 12)) {
          $key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey("Software\Adobe\CSXS.$cep")
          try { Assert ($key.GetValue('PlayerDebugMode') -eq '1') 'silent uninstall retains shared developer mode' } finally { $key.Dispose() }
        }
      }
    }
    & $shell -NoLogo -NoProfile -File "$PSScriptRoot/upgrade.tests.ps1" -Architecture $Architecture
    Assert ($LASTEXITCODE -eq 0) 'isolated old-to-new EXE and uninstall option tests'
  }
  Write-Host 'Runtime and installer tests passed. Adobe host loading was not tested.'
} finally {
  foreach ($entry in $savedRegistry) {
    $key = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey($entry.key)
    try {
      if ($entry.exists) { $key.SetValue('PlayerDebugMode', $entry.value, $entry.kind) }
      else { $key.DeleteValue('PlayerDebugMode', $false) }
    } finally { $key.Dispose() }
  }
  $env:APPDATA = $originalAppData
  $env:CommonProgramFiles = $originalCommon
  $env:CommonProgramW6432 = $originalCommon64
  ${env:CommonProgramFiles(x86)} = $originalCommon86
  if ($InstallerDirectory -and (Test-Path -LiteralPath $root)) {
    $diagnostics = Join-Path $PSScriptRoot '../../../tmp/inno-tests'
    [IO.Directory]::CreateDirectory($diagnostics) | Out-Null
    Get-ChildItem -LiteralPath $root -Filter '*.log' | Copy-Item -Destination $diagnostics -Force
    $fixtureState = Join-Path $root 'manager/state.json'
    if (Test-Path -LiteralPath $fixtureState) { Copy-Item -LiteralPath $fixtureState -Destination (Join-Path $diagnostics 'fixture-state.json') -Force }
    foreach ($name in @('Illustrator', 'Photoshop')) {
      $manager = Join-Path $root "$name manager"
      foreach ($file in @('state.json', 'installer.log')) {
        $source = Join-Path $manager $file
        if (Test-Path -LiteralPath $source) { Copy-Item -LiteralPath $source -Destination (Join-Path $diagnostics "$name-$file") -Force }
      }
    }
  }
  if (Test-Path -LiteralPath $root) { Remove-Item -LiteralPath $root -Recurse -Force }
}
