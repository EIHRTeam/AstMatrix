# Windows PowerShell 5.1; dot-sourceable for isolated runtime tests.
param(
  [ValidateSet('preflight', 'install', 'uninstall')][string]$Operation,
  [ValidateSet('Illustrator', 'Photoshop')][string]$HostName,
  [string]$AppVersion,
  [string]$ManagerDir,
  [string]$PayloadDir,
  [string]$ArchivePath,
  [string]$ResultPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Write-JsonFile($Path, $Value) {
  [IO.Directory]::CreateDirectory((Split-Path -Parent $Path)) | Out-Null
  $temporary = "$Path.new"
  [IO.File]::WriteAllText($temporary, ($Value | ConvertTo-Json -Depth 12), (New-Object Text.UTF8Encoding($false)))
  Move-Item -LiteralPath $temporary -Destination $Path -Force
}

function Get-State {
  $file = Join-Path $ManagerDir 'state.json'
  if (Test-Path -LiteralPath $file) { return Get-Content -LiteralPath $file -Raw -Encoding UTF8 | ConvertFrom-Json }
  return $null
}

function Get-PluginDestination($Version) {
  if ($HostName -eq 'Illustrator') { return Join-Path $env:APPDATA 'Adobe\CEP\extensions\AstMatrix' }
  return Join-Path $env:APPDATA "Adobe\UXP\Plugins\External\1f4db629_$Version"
}

function Assert-NoHostProcess {
  if (Get-Process -Name $HostName -ErrorAction SilentlyContinue) {
    throw "Close $HostName completely and retry. No Adobe process has been terminated."
  }
}

function Get-HostVersions {
  $versions = @()
  foreach ($hive in @([Microsoft.Win32.RegistryHive]::LocalMachine, [Microsoft.Win32.RegistryHive]::CurrentUser)) {
    foreach ($view in @([Microsoft.Win32.RegistryView]::Registry64, [Microsoft.Win32.RegistryView]::Registry32)) {
      $base = [Microsoft.Win32.RegistryKey]::OpenBaseKey($hive, $view)
      try {
        $uninstall = $base.OpenSubKey('Software\Microsoft\Windows\CurrentVersion\Uninstall')
        if ($null -eq $uninstall) { continue }
        try {
          foreach ($name in $uninstall.GetSubKeyNames()) {
            $key = $uninstall.OpenSubKey($name)
            try {
              $display = [string]$key.GetValue('DisplayName')
              $rawVersion = [string]$key.GetValue('DisplayVersion')
              if ($display -match "^Adobe $HostName(?:\s|$)" -and $rawVersion -match '^\d+\.\d+(?:\.\d+)?') {
                $versions += [version]$Matches[0]
              }
            } finally { $key.Dispose() }
          }
        } finally { $uninstall.Dispose() }
      } finally { $base.Dispose() }
    }
  }
  return $versions
}

function Test-HostCompatibility {
  $versions = @(Get-HostVersions)
  if (!$versions.Count) { return 'unknown' }
  $compatible = @($versions | Where-Object {
    if ($HostName -eq 'Photoshop') { $_ -ge [version]'26.0' }
    else { $_ -ge [version]'27.0' -and $_ -lt [version]'30.10' }
  })
  if (!$compatible.Count) { throw "No compatible $HostName installation found. Requires $(if ($HostName -eq 'Photoshop') {'26.0+'} else {'27.x through 30.x'})." }
  return 'compatible'
}

function Find-Upia {
  foreach ($common in @($env:CommonProgramW6432, $env:CommonProgramFiles, ${env:CommonProgramFiles(x86)})) {
    if (!$common) { continue }
    $candidate = Join-Path $common 'Adobe\Adobe Desktop Common\RemoteComponents\UPI\UnifiedPluginInstallerAgent\UnifiedPluginInstallerAgent.exe'
    if (Test-Path -LiteralPath $candidate -PathType Leaf) { return $candidate }
  }
  return $null
}

function Invoke-Upia($Executable, $Arguments) {
  Write-Host "UPIA: $Executable $Arguments"
  $process = New-Object Diagnostics.Process
  $process.StartInfo.FileName = $Executable
  $process.StartInfo.Arguments = $Arguments
  $process.StartInfo.UseShellExecute = $false
  $process.StartInfo.CreateNoWindow = $true
  $process.StartInfo.RedirectStandardOutput = $true
  $process.StartInfo.RedirectStandardError = $true
  try {
    try { $started = $process.Start() } catch { Write-Host "UPIA launch failed: $($_.Exception.Message)"; return @{ status = 'start-failed'; code = $null; text = $_.Exception.Message } }
    if (!$started) { return @{ status = 'start-failed'; code = $null; text = 'UPIA did not start' } }
    $stdout = $process.StandardOutput.ReadToEndAsync()
    $stderr = $process.StandardError.ReadToEndAsync()
    if (!$process.WaitForExit(120000)) {
      # Do not kill an Adobe installer or start a competing extraction operation.
      Write-Host 'UPIA timeout: installation state is unresolved; no extraction will be attempted.'
      return @{ status = 'unknown'; code = $null; text = 'UPIA is still running after 120 seconds. Wait for Adobe installation to finish before retrying.' }
    }
    if (![Threading.Tasks.Task]::WaitAll([Threading.Tasks.Task[]]@($stdout, $stderr), 5000)) {
      Write-Host 'UPIA streams are still open: installation state is unresolved.'
      return @{ status = 'unknown'; code = $null; text = 'UPIA output is still open; installation state is unresolved.' }
    }
    $text = $stdout.GetAwaiter().GetResult() + "`n" + $stderr.GetAwaiter().GetResult()
    $result = @{ status = 'exited'; code = $process.ExitCode; text = $text }
    Write-Host "UPIA exit code: $($result.code)"
    Write-Output $text | Out-Host
    return $result
  } finally { $process.Dispose() }
}

function Get-UpiaDisposition($Result) {
  if ($Result.status -eq 'start-failed') { return 'fallback' }
  if ($Result.status -ne 'exited') { return 'stop' }
  if ($Result.code -eq 0) { return 'verify' }
  # Only known environment/service failures may fall back. Unknown errors fail closed.
  # -175 includes denied/cancelled elevation; never turn it into an extraction.
  if ($Result.code -in @(-192, -193, -194, -195, -196, -197, -198)) { return 'fallback' }
  return 'stop'
}

function Get-InstalledPlugins {
  $roots = @((Join-Path $env:APPDATA 'Adobe\UXP\Plugins\External'))
  foreach ($common in @($env:CommonProgramW6432, $env:CommonProgramFiles)) {
    if (!$common) { continue }
    $base = Join-Path $common 'Adobe\UXP\Plugins'
    $roots += Join-Path $base 'External'
    $roots += Join-Path $base "$env:USERNAME\External"
  }
  foreach ($root in ($roots | Select-Object -Unique)) {
    if (!(Test-Path -LiteralPath $root)) { continue }
    foreach ($folder in (Get-ChildItem -LiteralPath $root -Directory)) {
      if ($folder.Attributes -band [IO.FileAttributes]::ReparsePoint) { continue }
      $manifest = Join-Path $folder.FullName 'manifest.json'
      if (!(Test-Path -LiteralPath $manifest)) { continue }
      $data = Get-Content -LiteralPath $manifest -Raw -Encoding UTF8 | ConvertFrom-Json
      if ($data.id -eq '1f4db629') { [pscustomobject]@{ version = $data.version; path = $folder.FullName } }
    }
  }
}

function Test-AdobeRegistration {
  $directory = Join-Path $env:APPDATA 'Adobe\UXP\PluginsInfo'
  if (!(Test-Path -LiteralPath $directory)) { return $false }
  # Read-only detection. This private Adobe data is NEVER edited by this installer.
  foreach ($file in (Get-ChildItem -LiteralPath $directory -Filter '*.json' -File -Recurse)) {
    if ((Get-Content -LiteralPath $file.FullName -Raw -Encoding UTF8) -match '"1f4db629(?:_[^"]*)?"') { return $true }
  }
  return $false
}

function Get-SafeFilePath($Root, $Relative) {
  if ([IO.Path]::IsPathRooted($Relative) -or $Relative -match '(^|[\\/])\.\.?([\\/]|$)|:') { throw 'Invalid managed file path' }
  $separator = [IO.Path]::DirectorySeparatorChar
  $rootPath = [IO.Path]::GetFullPath($Root).TrimEnd($separator)
  $full = [IO.Path]::GetFullPath((Join-Path $rootPath $Relative))
  if (!$full.StartsWith($rootPath + $separator, [StringComparison]::OrdinalIgnoreCase)) { throw 'Managed file escaped plugin directory' }
  $current = Split-Path -Parent $full
  while ($current -and $current.Length -ge $rootPath.Length) {
    if ((Test-Path -LiteralPath $current) -and ((Get-Item -LiteralPath $current).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Refusing plugin directory junction or symlink' }
    $current = Split-Path -Parent $current
  }
  if ((Test-Path -LiteralPath $full) -and ((Get-Item -LiteralPath $full).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Refusing managed file symlink' }
  return $full
}

function Assert-State($State) {
  if ($null -eq $State) { return }
  if ($State.hostName -ne $HostName -or $State.mode -notin @('upia', 'extracted')) { throw 'Invalid installer state' }
  if ($State.version -notmatch '^\d+\.\d+\.\d+$') { throw 'Invalid installer version in state' }
  if ($State.mode -eq 'extracted' -and !@($State.files).Count) { throw 'Extracted state has no file inventory' }
  if ($State.path -ne (Get-PluginDestination $State.version)) { throw 'Installer state points outside its own deployment' }
}

function Test-OwnedFiles($State) {
  Assert-State $State
  foreach ($entry in $State.files) {
    $file = Get-SafeFilePath $State.path $entry.path
    if (!(Test-Path -LiteralPath $file) -or (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -ne $entry.sha256) { return $false }
  }
  return $true
}

function Remove-OwnedFiles($State) {
  Assert-State $State
  foreach ($entry in $State.files) {
    $file = Get-SafeFilePath $State.path $entry.path
    if ((Test-Path -LiteralPath $file) -and (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -eq $entry.sha256) {
      Remove-Item -LiteralPath $file
    }
  }
  # Only remove now-empty directories. Never recursively delete the shared Adobe tree.
  if (Test-Path -LiteralPath $State.path) {
    $directories = @($State.files | ForEach-Object { Split-Path -Parent (Get-SafeFilePath $State.path $_.path) } | Sort-Object -Unique)
    foreach ($directory in ($directories | Sort-Object Length -Descending)) {
      while ($directory -and $directory.Length -ge $State.path.Length -and (Test-Path -LiteralPath $directory)) {
        if (@(Get-ChildItem -LiteralPath $directory -Force).Count) { break }
        Remove-Item -LiteralPath $directory
        $directory = Split-Path -Parent $directory
      }
    }
  }
}

function Install-Payload($Previous) {
  $destination = Get-PluginDestination $AppVersion
  # PowerShell 5.1 emits a JSON array as one pipeline object; PowerShell 7
  # enumerates its members. Assignment (without @(...)) preserves a flat array in both.
  $files = Get-Content -LiteralPath (Join-Path $PayloadDir 'payload-files.json') -Raw -Encoding UTF8 | ConvertFrom-Json
  # Preflight every file before writing any file; reject foreign deployments and modifications.
  if ((Test-Path -LiteralPath $destination) -and (!$Previous -or $Previous.path -ne $destination -or !(Test-OwnedFiles $Previous))) { throw 'An unmanaged or externally modified plugin already occupies the destination.' }
  foreach ($entry in $files) {
    $source = Get-SafeFilePath $PayloadDir $entry.path
    $target = Get-SafeFilePath $destination $entry.path
    if ((Test-Path -LiteralPath $target) -and (!$Previous -or $Previous.path -ne $destination -or $entry.path -notin @($Previous.files | ForEach-Object { $_.path }))) { throw 'An untracked file occupies a new payload path; refusing to overwrite it.' }
    if ((Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash -ne $entry.sha256) { throw 'Embedded payload hash mismatch' }
  }
  $backup = Join-Path $ManagerDir 'rollback'
  if (Test-Path -LiteralPath $backup) { throw 'A previous rollback directory needs manual recovery before retrying.' }
  $written = @()
  $discardBackup = $false
  $registryBackup = @()
  try {
    if ($Previous -and $Previous.mode -eq 'extracted') {
      if (!(Test-OwnedFiles $Previous)) { throw 'The previous plugin was modified externally; refusing to overwrite it.' }
      foreach ($entry in $Previous.files) {
        $saved = Get-SafeFilePath $backup $entry.path
        [IO.Directory]::CreateDirectory((Split-Path -Parent $saved)) | Out-Null
        Copy-Item -LiteralPath (Get-SafeFilePath $Previous.path $entry.path) -Destination $saved
      }
      Remove-OwnedFiles $Previous
    }
    foreach ($entry in $files) {
      $file = Get-SafeFilePath $destination $entry.path
      [IO.Directory]::CreateDirectory((Split-Path -Parent $file)) | Out-Null
      $written += $file
      Copy-Item -LiteralPath (Get-SafeFilePath $PayloadDir $entry.path) -Destination $file
    }
    if ($HostName -eq 'Illustrator') {
      foreach ($cep in @(11, 12)) {
        $key = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey("Software\Adobe\CSXS.$cep")
        try {
          $entry = @{ cep = $cep; exists = $key.GetValueNames() -contains 'PlayerDebugMode'; value = $null; kind = $null }
          if ($entry.exists) { $entry.value = $key.GetValue('PlayerDebugMode'); $entry.kind = $key.GetValueKind('PlayerDebugMode') }
          $registryBackup += $entry
          $key.SetValue('PlayerDebugMode', '1', [Microsoft.Win32.RegistryValueKind]::String)
        } finally { $key.Dispose() }
      }
    }
    $state = @{ hostName = $HostName; version = $AppVersion; mode = 'extracted'; path = $destination; files = $files }
    Write-JsonFile (Join-Path $ManagerDir 'state.json') $state
    $discardBackup = $true
  } catch {
    foreach ($entry in $registryBackup) {
      $key = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey("Software\Adobe\CSXS.$($entry.cep)")
      try {
        if ($entry.exists) { $key.SetValue('PlayerDebugMode', $entry.value, $entry.kind) }
        else { $key.DeleteValue('PlayerDebugMode', $false) }
      } finally { $key.Dispose() }
    }
    foreach ($file in $written) { if (Test-Path -LiteralPath $file) { Remove-Item -LiteralPath $file } }
    if ($Previous -and (Test-Path -LiteralPath $backup)) {
      foreach ($entry in $Previous.files) {
        $saved = Get-SafeFilePath $backup $entry.path
        if (Test-Path -LiteralPath $saved) {
          $file = Get-SafeFilePath $Previous.path $entry.path
          [IO.Directory]::CreateDirectory((Split-Path -Parent $file)) | Out-Null
          Copy-Item -LiteralPath $saved -Destination $file -Force
        }
      }
    }
    $discardBackup = $true
    throw
  } finally { if ($discardBackup -and (Test-Path -LiteralPath $backup)) { Remove-Item -LiteralPath $backup -Recurse } }
  return $state
}

function Install-Photoshop($Previous) {
  if (Get-Process -Name UnifiedPluginInstallerAgent -ErrorAction SilentlyContinue) { throw 'Adobe UPIA is already running. Wait for it to finish before retrying.' }
  $plugins = @(Get-InstalledPlugins)
  if (@($plugins | Where-Object { [version]$_.version -gt [version]$AppVersion }).Count) { throw 'A newer AstMatrix plugin is already installed.' }
  $foreign = @($plugins | Where-Object { !$Previous -or $Previous.mode -ne 'extracted' -or $_.path -ne $Previous.path })
  $managed = $foreign.Count -gt 0 -or (Test-AdobeRegistration) -or ($Previous -and $Previous.mode -eq 'upia')
  $upia = Find-Upia
  $disposition = 'fallback'
  if ($upia) {
    $result = Invoke-Upia $upia ('/install "' + $ArchivePath + '"')
    $disposition = Get-UpiaDisposition $result
    if ($disposition -eq 'verify') {
      $listed = Invoke-Upia $upia '/list all'
      $installed = @(Get-InstalledPlugins | Where-Object { $_.version -eq $AppVersion -and (!$Previous -or $Previous.mode -ne 'extracted' -or $_.path -ne $Previous.path) })
      # UPIA may reuse the old extraction directory: require /list plus exact on-disk identity.
      if (!$installed.Count) { $installed = @(Get-InstalledPlugins | Where-Object { $_.version -eq $AppVersion }) }
      $pattern = '(?im)^\s*Enabled\s+AstMatrix\s+' + [regex]::Escape($AppVersion) + '(?:\s|$)'
      if ($listed.status -ne 'exited' -or $listed.code -ne 0 -or $listed.text -notmatch $pattern -or !$installed.Count) { throw 'UPIA returned success but installation could not be verified. No extraction was attempted.' }
      if ($Previous -and $Previous.mode -eq 'extracted' -and $Previous.path -ne $installed[0].path) { Remove-OwnedFiles $Previous }
      $state = @{ hostName = $HostName; version = $AppVersion; mode = 'upia'; path = (Get-PluginDestination $AppVersion); pluginPath = $installed[0].path; files = @() }
      Write-JsonFile (Join-Path $ManagerDir 'state.json') $state
      return $state
    }
    if ($disposition -eq 'stop') { throw "UPIA installation stopped (code $($result.code)). $($result.text) No extraction was attempted." }
  }
  # Reinspect after a failed UPIA operation; it may have partially installed the plugin.
  $after = @(Get-InstalledPlugins | Where-Object { !$Previous -or $Previous.mode -ne 'extracted' -or $_.path -ne $Previous.path })
  if ($managed -or $after.Count -or (Test-AdobeRegistration)) { throw 'An Adobe-managed or unowned AstMatrix installation exists. Repair it using Creative Cloud; extraction would create a conflicting copy.' }
  return Install-Payload $Previous
}

function Uninstall-Plugin($State) {
  if ($null -eq $State) { return }
  if ($State.mode -eq 'extracted') {
    if (!(Test-OwnedFiles $State)) { Write-Host 'Plugin changed externally. Its files have been preserved.'; return }
    Remove-OwnedFiles $State
    return
  }
  $plugins = @(Get-InstalledPlugins)
  if (@($plugins | Where-Object { $_.version -ne $State.version }).Count) { Write-Host 'Adobe plugin updated externally. It has been preserved.'; return }
  if (!$plugins.Count -and !(Test-AdobeRegistration)) { return }
  if (!@($plugins | Where-Object { $_.path -eq $State.pluginPath -and $_.version -eq $State.version }).Count) { throw 'Cannot establish the Adobe-managed installation identity; uninstall it through Creative Cloud.' }
  $upia = Find-Upia
  if (!$upia) { throw 'UPIA is missing. Restore Creative Cloud or uninstall the plugin there before retrying.' }
  $before = Invoke-Upia $upia '/list all'
  $named = [regex]::Matches($before.text, '(?im)^\s*(?:Enabled|Disabled)\s+AstMatrix\s+(\S+)[ \t]*$')
  if ($before.status -ne 'exited' -or $before.code -ne 0 -or $named.Count -ne 1 -or $named[0].Groups[1].Value -ne $State.version) { throw 'UPIA cannot uniquely identify AstMatrix by name. Uninstall the Photoshop plugin through Creative Cloud to avoid removing a different plugin.' }
  $result = Invoke-Upia $upia '/remove "AstMatrix"'
  if ($result.status -ne 'exited' -or $result.code -ne 0) { throw 'UPIA could not remove the plugin. Installer state has been retained.' }
  $listed = Invoke-Upia $upia '/list all'
  if ($listed.status -ne 'exited' -or $listed.code -ne 0 -or $listed.text -match '(?im)^\s*(?:Enabled|Disabled)\s+AstMatrix\s+' -or @(Get-InstalledPlugins).Count) { throw 'UPIA removal could not be verified. Installer state has been retained.' }
}

function Invoke-Installer {
  [IO.Directory]::CreateDirectory($ManagerDir) | Out-Null
  $mutex = New-Object Threading.Mutex($false, ('Local\AstMatrix.Installer.' + $HostName))
  $locked = $false
  $transcribing = $false
  try {
    $locked = $mutex.WaitOne(0)
    if (!$locked) { throw 'Another AstMatrix installer is running.' }
    Start-Transcript -LiteralPath (Join-Path $ManagerDir 'installer.log') -Append | Out-Null
    $transcribing = $true
    Assert-NoHostProcess
    $state = Get-State
    Assert-State $state
    if ($Operation -eq 'uninstall') {
      Uninstall-Plugin $state
      Remove-Item -LiteralPath (Join-Path $ManagerDir 'state.json') -ErrorAction SilentlyContinue
      return
    }
    $compatibility = Test-HostCompatibility
    if ($state -and [version]$state.version -gt [version]$AppVersion) { throw 'A newer installer version is already installed; downgrade is not supported.' }
    if ($Operation -eq 'preflight') {
      [IO.File]::WriteAllText($ResultPath, "[result]`r`nhost=$compatibility`r`n")
      return
    }
    if ($HostName -eq 'Photoshop') { $state = Install-Photoshop $state }
    else { $state = Install-Payload $state }
    [IO.File]::WriteAllText($ResultPath, "[result]`r`nmode=$($state.mode)`r`n")
  } catch {
    Write-Host "ERROR: $($_.Exception.Message)"
    Write-Host $_.ScriptStackTrace
    throw
  } finally {
    if ($transcribing) { Stop-Transcript | Out-Null }
    if ($locked) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
  }
}

if ($MyInvocation.InvocationName -ne '.') {
  try { Invoke-Installer; exit 0 }
  catch { Write-Error -Message $_.Exception.Message -ErrorAction Continue; exit 1 }
}
