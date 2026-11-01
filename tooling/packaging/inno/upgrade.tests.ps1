# Windows-only EXE acceptance tests. Test AppIds are unique; no fixture EXEs are published.
param(
  [ValidateSet('x64', 'aarch64')][string]$Architecture = 'x64',
  [ValidateSet('english', 'chinesesimplified')][string]$Language = 'english'
)
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/runtime.ps1"
. "$PSScriptRoot/test-helpers.ps1"
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$ui = if ($Language -eq 'english') {
  @{ Checkbox = 'Disable CEP developer mode'; Cancel = 'Cancel'; Continue = 'OK'; Confirm = 'Yes'; Decline = 'No'; StartMenu = 'Uninstall AstMatrix for'; PluginLink = 'Uninstall AstMatrix.lnk' }
} else {
  @{ Checkbox = '关闭 CEP 开发者模式'; Cancel = '取消'; Continue = '确定'; Confirm = '是'; Decline = '否'; StartMenu = '卸载 AstMatrix for'; PluginLink = '卸载 AstMatrix.lnk' }
}
$otherLanguage = if ($Language -eq 'english') { 'chinesesimplified' } else { 'english' }
$otherStartMenu = if ($Language -eq 'english') { '卸载 AstMatrix for' } else { 'Uninstall AstMatrix for' }
$otherPluginLink = if ($Language -eq 'english') { '卸载 AstMatrix.lnk' } else { 'Uninstall AstMatrix.lnk' }

function Assert($Condition, $Message) { if (!$Condition) { throw "Assertion failed: $Message" } }
function Run-Setup($Path, $Arguments, $Success = $true) {
  # Start-Process -Wait also waits for descendant processes, so a setup that
  # leaves a long-running child (UPIA when Adobe is installed) would hang the
  # test instead of reporting the exit code. Wait for the setup itself.
  $process = Start-Process $Path -ArgumentList $Arguments -PassThru
  $process.WaitForExit()
  Assert (($process.ExitCode -eq 0) -eq $Success) "EXE result: $Path ($($process.ExitCode))"
}
function Get-NormalizedCaption($Caption) {
  # Task dialogs drop the accelerator marker, and localized message boxes may
  # append a hotkey hint such as '(Y)' in half- or full-width parentheses, so
  # compare captions without either.
  return (($Caption -replace '&', '') -replace '\s*[\(（][^\)）]*[\)）]\s*$', '').Trim()
}
function Find-UninstallerElement($Path, $Description, $Caption, [switch]$Button) {
  # Inno 7 renders the uninstall confirmation and completion messages as task
  # dialogs, whose buttons have instance-specific automation IDs instead of
  # IDYES/IDOK, so match the localized caption. Search only the uninstaller's own
  # windows: a stale dialog from an earlier case must never be clicked.
  $directory = Split-Path -Parent $Path
  $wanted = if ($Button) { Get-NormalizedCaption $Caption } else { $Caption }
  $deadline = [DateTime]::UtcNow.AddSeconds(30)
  $ids = @()
  $seen = [System.Collections.Generic.List[string]]::new()
  do {
    if (!$ids.Count) {
      # CIM returns UInt32; PropertyCondition only accepts Int32.
      $ids = @(Get-UninstallerProcess $directory | ForEach-Object { [int]$_.ProcessId })
      if (!$ids.Count) { Start-Sleep -Milliseconds 100; continue }
    }
    $sawWindow = $false
    foreach ($id in $ids) {
      $condition = New-Object Windows.Automation.PropertyCondition([Windows.Automation.AutomationElement]::ProcessIdProperty, $id)
      $windows = [Windows.Automation.AutomationElement]::RootElement.FindAll([Windows.Automation.TreeScope]::Children, $condition)
      foreach ($window in $windows) {
        try {
          $title = $window.Current.Name
          $elements = $window.FindAll([Windows.Automation.TreeScope]::Descendants, [Windows.Automation.Condition]::TrueCondition)
        } catch { continue }
        $sawWindow = $true
        foreach ($element in $elements) {
          # A dialog can close between enumeration and property access.
          try {
            $current = $element.Current
            $isButton = $current.ControlType -eq [Windows.Automation.ControlType]::Button -or $current.ClassName -like '*Button*'
            if ($isButton) {
              $label = '{0} :: {1} (offscreen={2}, enabled={3})' -f $title, $current.Name, $current.IsOffscreen, $current.IsEnabled
              if (!$seen.Contains($label)) { [void]$seen.Add($label) }
            }
            if (!$Button) {
              if ($current.Name -eq $wanted) { return $element }
            } elseif ($isButton -and !$current.IsOffscreen -and $current.IsEnabled) {
              if ((Get-NormalizedCaption $current.Name) -ieq $wanted) { return $element }
            }
          } catch { continue }
        }
      }
    }
    # The uninstaller restarts itself, so re-resolve its process when no window
    # exists yet; a replacement process would otherwise never be found.
    if (!$sawWindow) { $ids = @() }
    Start-Sleep -Milliseconds 100
  } while ([DateTime]::UtcNow -lt $deadline)
  $observed = if ($seen.Count) { ($seen | Select-Object -First 10) -join '; ' } else { 'none' }
  throw "$Description not found (pids: $(if ($ids.Count) { $ids -join ', ' } else { 'none' })). Buttons: $observed"
}
function Find-Control($Path, $Name) {
  return Find-UninstallerElement $Path "Uninstall control: $Name" $Name
}
function Find-Button($Path, $Caption) {
  return Find-UninstallerElement $Path "Uninstall button: $Caption" $Caption -Button
}
function Click-Control($Element) {
  $Element.GetCurrentPattern([Windows.Automation.InvokePattern]::Pattern).Invoke()
}
function Run-InteractiveUninstall($Path, $CancelOptions, $Confirm, $Disable) {
  # Keep the uninstaller's own log so a dialog left unanswered is diagnosable.
  $log = Join-Path $root ('interactive-uninstall-' + [guid]::NewGuid().ToString('N') + '.log')
  $job = Start-Job -ArgumentList $Path, $log -ScriptBlock {
    param($Path, $Log)
    (Start-Process $Path -ArgumentList @('/NORESTART', "/LOG=`"$Log`"") -Wait -PassThru).ExitCode
  }
  try {
    $checkbox = Find-Control $Path $ui.Checkbox
    $toggle = $checkbox.GetCurrentPattern([Windows.Automation.TogglePattern]::Pattern)
    Assert ($toggle.Current.ToggleState -eq [Windows.Automation.ToggleState]::Off) 'CEP option defaults to unchecked'
    if ($CancelOptions) { Click-Control (Find-Button $Path $ui.Cancel) }
    else {
      if ($Disable) { $toggle.Toggle() }
      Click-Control (Find-Button $Path $ui.Continue)
      Click-Control (Find-Button $Path $(if ($Confirm) { $ui.Confirm } else { $ui.Decline }))
      if ($Confirm) { Click-Control (Find-Button $Path $ui.Continue) } # completion message
    }
    Assert ($null -ne (Wait-Job $job -Timeout 45)) 'interactive uninstaller completed (a dialog may have been left unanswered)'
    $null = Receive-Job $job -ErrorAction Stop
  } catch {
    # An unanswered dialog leaves the uninstaller waiting; stop it so the next
    # case starts from a clean management directory.
    Stop-UninstallerProcess (Split-Path -Parent $Path)
    throw
  } finally { Stop-Job $job; Remove-Job $job -Force }
}

$root = Join-Path ([IO.Path]::GetTempPath()) ('astmatrix-upgrade-' + [guid]::NewGuid())
$savedAppData = $env:APPDATA
$savedRegistry = @()
$testIds = @()
$links = @()
$sentinelName = 'AstMatrixTests.' + [guid]::NewGuid().ToString('N')
try {
  Assert ([Environment]::OSVersion.Platform -eq [PlatformID]::Win32NT) 'Windows required'
  Assert (Test-Path $env:ASTMATRIX_ISCC) 'pinned Inno compiler required'
  [IO.Directory]::CreateDirectory($root) | Out-Null
  $env:APPDATA = Join-Path $root 'User 测试 with spaces'
  foreach ($cep in @(11, 12, 13)) {
    $path = "Software\Adobe\CSXS.$cep"
    $key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($path)
    $entry = @{ path = $path; keyExists = $null -ne $key; exists = $false; value = $null; kind = $null }
    if ($key) {
      if ($key.GetValueNames() -contains 'PlayerDebugMode') { $entry.exists = $true; $entry.value = $key.GetValue('PlayerDebugMode'); $entry.kind = $key.GetValueKind('PlayerDebugMode') }
      $key.Dispose()
    }
    $savedRegistry += $entry
  }
  foreach ($hostName in @('Illustrator', 'Photoshop')) {
    # Keep below Inno's 57-character threshold for hashing the uninstall key name.
    $id = 'AMTest.' + [guid]::NewGuid().ToString('N') + '.' + $hostName
    $testIds += $id
    $manager = Join-Path $root "$hostName manager"
    $regPath = "Software\Microsoft\Windows\CurrentVersion\Uninstall\${id}_is1"
    $startMenu = Join-Path ([Environment]::GetFolderPath('Programs')) "AstMatrix\$($ui.StartMenu) $hostName.lnk"
    $otherLink = Join-Path ([Environment]::GetFolderPath('Programs')) "AstMatrix\$otherStartMenu $hostName.lnk"
    Assert (!(Test-Path $startMenu)) 'fixture must not overwrite an existing start menu entry'
    $links += $startMenu
    Assert (!(Test-Path $otherLink)) 'fixture must not overwrite the other-language start menu entry'
    $links += $otherLink
    $executables = @{}
    foreach ($fixture in @('legacy', 'current', 'next', 'downgrade')) {
      $version = switch ($fixture) { 'current' { '0.0.2' }; 'next' { '0.0.3' }; default { '0.0.1' } }
      $payload = Join-Path $root "$hostName-$fixture-payload"
      [IO.Directory]::CreateDirectory($payload) | Out-Null
      [IO.File]::WriteAllText((Join-Path $payload 'LICENSE'), 'Fixture license')
      if ($hostName -eq 'Illustrator') {
        [IO.Directory]::CreateDirectory((Join-Path $payload 'CSXS')) | Out-Null
        [IO.File]::WriteAllText((Join-Path $payload 'CSXS/manifest.xml'), "<ExtensionManifest ExtensionBundleVersion=`"$version`" />")
      } else {
        [IO.File]::WriteAllText((Join-Path $payload 'manifest.json'), "{`"id`":`"1f4db629`",`"version`":`"$version`"}")
      }
      [IO.File]::WriteAllText((Join-Path $payload 'index.js'), "// $fixture $version")
      $entries = @(Get-ChildItem $payload -Recurse -File | ForEach-Object {
        @{ path = $_.FullName.Substring($payload.Length + 1).Replace('\', '/'); sha256 = (Get-FileHash $_.FullName).Hash }
      })
      Write-JsonFile (Join-Path $payload 'payload-files.json') $entries
      $archive = Join-Path $root 'fixture.ccx'
      [IO.File]::WriteAllText($archive, 'Fixture: hosted runner must use extraction')
      $include = if ($fixture -eq 'legacy') { Join-Path $PSScriptRoot 'fixtures/legacy.iss' } else { Join-Path $PSScriptRoot 'shared.iss' }
      $scriptFile = Join-Path $root "$hostName-$fixture.iss"
      $scriptText = @"
#define HostName "$hostName"
#define StableAppId "$id"
#define TargetArchitecture "$Architecture"
[Setup]
SourceDir=$PSScriptRoot
#include "$include"
"@
      [IO.File]::WriteAllText($scriptFile, $scriptText, (New-Object Text.UTF8Encoding($true)))
      & $env:ASTMATRIX_ISCC "/DAppVersion=$version" "/DPayloadDir=$payload" "/DArchivePath=$archive" "/O$root" "/F$hostName-$fixture" $scriptFile
      Assert ($LASTEXITCODE -eq 0) "$fixture fixture compiled"
      $executables[$fixture] = Join-Path $root "$hostName-$fixture.exe"
    }
    $silent = @('/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART')
    Run-Setup $executables.legacy ($silent + @("/DIR=`"$manager`"", "/LOG=`"$root\$hostName-legacy.log`""))
    $old = Get-Content (Join-Path $manager 'state.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    Assert ($old.version -eq '0.0.1') 'legacy installation created'
    Assert (!(Test-Path (Join-Path $manager 'uninstall-shortcut.json'))) 'legacy fixture has no shortcut record'
    # Omit /DIR: Inno must discover and reuse the old installation directory.
    Run-Setup $executables.current ($silent + @("/LANG=$Language", "/LOG=`"$root\$hostName-upgrade.log`""))
    $state = Get-Content (Join-Path $manager 'state.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    Assert ($state.version -eq '0.0.2') 'new installer upgraded old state in place'
    $key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($regPath)
    try { Assert ($key.GetValue('DisplayVersion') -eq '0.0.2') 'Inno registration updated' } finally { $key.Dispose() }
    $base = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Software\Microsoft\Windows\CurrentVersion\Uninstall')
    try { Assert (@($base.GetSubKeyNames() | Where-Object { $_ -like "$id*" }).Count -eq 1) 'one Inno registration remains' } finally { $base.Dispose() }
    $uninstaller = Join-Path $manager 'unins000.exe'
    $wscript = New-Object -ComObject WScript.Shell
    try {
      foreach ($link in @((Get-ShortcutPath $state.path $ui.PluginLink), $startMenu)) {
        Assert (Test-Path $link) 'both uninstall shortcuts created during migration'
        # WScript's load path is ANSI too; inspect a copy outside the Unicode tree.
        $inspectionPath = Join-Path $root 'inspect-shortcut.lnk'
        Copy-Item -LiteralPath $link -Destination $inspectionPath -Force
        Assert ($wscript.CreateShortcut($inspectionPath).TargetPath -eq $uninstaller) 'shortcut targets stable uninstaller'
      }
    } finally {
      [void][Runtime.InteropServices.Marshal]::ReleaseComObject($wscript)
      if (Test-Path -LiteralPath $inspectionPath) { Remove-Item -LiteralPath $inspectionPath }
    }
    # Fail only the post-install controller: an unowned link blocks language migration.
    $conflictingLink = Get-ShortcutPath $state.path $otherPluginLink
    [IO.File]::WriteAllText($conflictingLink, 'foreign shortcut')
    Run-Setup $executables.current ($silent + @("/LANG=$otherLanguage", "/LOG=`"$root\$hostName-shortcut-failure.log`"")) $false
    Assert ([IO.File]::ReadAllText($conflictingLink) -eq 'foreign shortcut') 'post-install failure preserves the foreign link'
    Assert (Test-Path (Get-ShortcutPath $state.path $ui.PluginLink)) 'post-install failure preserves the previous plugin shortcut'
    Assert (Test-Path $uninstaller) 'post-install failure keeps the committed installation removable'
    Remove-Item -LiteralPath $conflictingLink
    Run-Setup $executables.current ($silent + @("/LANG=$otherLanguage", "/LOG=`"$root\$hostName-switch-language.log`""))
    Assert ((Test-Path $otherLink) -and !(Test-Path $startMenu)) 'switching language migrates the start menu shortcut'
    Run-Setup $executables.current ($silent + @("/LANG=$Language", "/LOG=`"$root\$hostName-switch-back.log`""))
    Assert ((Test-Path $startMenu) -and !(Test-Path $otherLink)) 'switching back leaves one localized start menu entry'
    $oldShortcut = Get-ShortcutPath $state.path $ui.PluginLink
    Run-Setup $executables.next $silent
    $state = Get-Content (Join-Path $manager 'state.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    Assert (Test-Path (Get-ShortcutPath $state.path $ui.PluginLink)) 'upgrade keeps shortcut in current plugin directory'
    if ($hostName -eq 'Photoshop') { Assert (!(Test-Path $oldShortcut)) 'upgrade removes shortcut from previous version directory' }
    Run-Setup $executables.downgrade $silent $false
    Assert ((Get-Content (Join-Path $manager 'state.json') -Raw -Encoding UTF8 | ConvertFrom-Json).version -eq '0.0.3') 'downgrade leaves state unchanged'
    $stateFile = Join-Path $manager 'state.json'
    $originalState = Get-Content $stateFile -Raw -Encoding UTF8
    $conflicting = $originalState.Replace('0.0.3', '0.0.2')
    [IO.File]::WriteAllText($stateFile, $conflicting, (New-Object Text.UTF8Encoding($false)))
    Run-Setup $executables.next $silent $false
    Assert ((Get-Content $stateFile -Raw -Encoding UTF8) -eq $conflicting) 'registration conflict does not overwrite state'
    [IO.File]::WriteAllText($stateFile, $originalState, (New-Object Text.UTF8Encoding($false)))
    Move-Item $stateFile "$stateFile.saved"
    Run-Setup $executables.next $silent $false
    Move-Item "$stateFile.saved" $stateFile
    Run-Setup $executables.next ($silent + @("/DIR=`"$root\wrong manager`"")) $false
    Assert (Test-Path $stateFile) 'missing state and alternate management directory are rejected safely'

    if ($hostName -eq 'Illustrator') {
      Run-InteractiveUninstall $uninstaller $true $false $false
      Run-InteractiveUninstall $uninstaller $false $false $false
      Assert (Test-Path (Join-Path $state.path 'CSXS/manifest.xml')) 'cancelling either uninstall dialog preserves plugin'
      Assert (Test-Path (Join-Path $manager 'state.json')) 'cancelling preserves state'
      # Force controller failure without changing any production script or executable.
      [IO.File]::WriteAllText($stateFile, '{}')
      Run-Setup $uninstaller $silent $false
      Assert (Test-Path $uninstaller) 'failed uninstall retains Inno uninstaller'
      Assert (Test-Path $startMenu) 'failed uninstall retains start menu shortcut'
      Assert (Test-Path (Get-ShortcutPath $state.path $ui.PluginLink)) 'failed uninstall retains plugin shortcut'
      [IO.File]::WriteAllText($stateFile, $originalState, (New-Object Text.UTF8Encoding($false)))
      $key = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey('Software\Adobe\CSXS.13')
      try { $key.SetValue('PlayerDebugMode', 'test-other-version') } finally { $key.Dispose() }
      Run-InteractiveUninstall $uninstaller $false $true $true
      foreach ($cep in @(11, 12, 13)) {
        $key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey("Software\Adobe\CSXS.$cep")
        try {
          Assert ($key.GetValue('PlayerDebugMode') -eq $(if ($cep -eq 13) { 'test-other-version' } else { '0' })) 'explicit disable affects CEP 11/12 only'
          Assert ($key.GetValueKind('PlayerDebugMode') -eq 'String') 'developer mode is written as REG_SZ'
        } finally { $key.Dispose() }
      }
    } else { Run-Setup $uninstaller $silent }
    Assert (!(Test-Path $startMenu) -and !(Test-Path (Get-ShortcutPath $state.path $ui.PluginLink))) 'uninstall cleans both shortcut locations'
    Assert ($null -eq [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($regPath)) 'uninstall removes Inno registration'
  }
  $key = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey('Software\Adobe\CSXS.11')
  try {
    $key.SetValue('PlayerDebugMode', 1, [Microsoft.Win32.RegistryValueKind]::DWord)
    $key.SetValue($sentinelName, 'keep')
  } finally { $key.Dispose() }
  $key = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey('Software\Adobe\CSXS.12')
  try { $key.DeleteValue('PlayerDebugMode', $false) } finally { $key.Dispose() }
  Disable-CepDeveloperMode
  $key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Software\Adobe\CSXS.11')
  try {
    Assert ($key.GetValue('PlayerDebugMode') -eq '0' -and $key.GetValueKind('PlayerDebugMode') -eq 'String') 'disable normalizes existing DWORD to REG_SZ 0'
    Assert ($key.GetValue($sentinelName) -eq 'keep') 'disable retains other registry settings'
  } finally { $key.Dispose() }
  $key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Software\Adobe\CSXS.12')
  try { Assert ($key.GetValueNames() -notcontains 'PlayerDebugMode') 'disable does not create an absent value' } finally { $key.Dispose() }
  Write-Host "Isolated upgrade, cancellation, and CEP option EXE tests passed: $Language."
} finally {
  foreach ($entry in $savedRegistry) {
    $key = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey($entry.path)
    try {
      $key.DeleteValue($sentinelName, $false)
      if ($entry.exists) { $key.SetValue('PlayerDebugMode', $entry.value, $entry.kind) }
      else { $key.DeleteValue('PlayerDebugMode', $false) }
      $empty = !$key.GetValueNames().Count -and !$key.GetSubKeyNames().Count
    } finally { $key.Dispose() }
    if (!$entry.keyExists -and $empty) { [Microsoft.Win32.Registry]::CurrentUser.DeleteSubKey($entry.path, $false) }
  }
  foreach ($id in $testIds) { [Microsoft.Win32.Registry]::CurrentUser.DeleteSubKeyTree("Software\Microsoft\Windows\CurrentVersion\Uninstall\${id}_is1", $false) }
  foreach ($link in $links) { if (Test-Path $link) { Remove-Item $link } }
  $env:APPDATA = $savedAppData
  if (Test-Path $root) {
    $diagnostics = Join-Path $PSScriptRoot '../../../tmp/inno-tests'
    [IO.Directory]::CreateDirectory($diagnostics) | Out-Null
    foreach ($log in (Get-ChildItem $root -Filter '*.log' -Recurse)) {
      $name = 'upgrade-' + $log.FullName.Substring($root.Length + 1).Replace('\', '-')
      Copy-Item $log.FullName -Destination (Join-Path $diagnostics $name) -Force
    }
    Remove-TestTree $root
  }
}
