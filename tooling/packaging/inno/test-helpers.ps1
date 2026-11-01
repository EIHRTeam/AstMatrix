# Windows-only Inno test helpers shared by runtime.tests.ps1 and upgrade.tests.ps1.
# Never shipped: the installers only carry runtime.ps1.
#
# Inno's uninstaller cannot delete its own executable, so it restarts from a
# temporary copy (for example %TEMP%\is-*.tmp\_unins.tmp) that still points at the
# management directory. The copy and unins000.dat stay busy until the last process
# exits, so cleanup waits for locks and stops a hung uninstaller instead of failing
# at once.

function Get-UninstallerProcess($Directory) {
  # Match by what the process runs instead of a hard-coded name: Inno 7 restarts
  # as _unins.tmp (other versions used _iu*.tmp) and keeps the management
  # directory in its command line.
  $prefix = $Directory.TrimEnd([char]'\') + '\'
  Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
    $name = $_.Name
    if ($name -notlike 'unins*' -and $name -notlike '_iu*' -and $name -notlike '_unins*') {
      return $false
    }
    $executable = $_.ExecutablePath
    if ($executable -and $executable.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) {
      return $true
    }
    $commandLine = $_.CommandLine
    return [bool]($commandLine -and $commandLine.IndexOf(
      $Directory, [StringComparison]::OrdinalIgnoreCase) -ge 0)
  }
}

function Stop-UninstallerProcess($Directory) {
  $processes = @(Get-UninstallerProcess $Directory)
  if (!$processes.Count) { return }
  foreach ($process in $processes) {
    Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
  }
  # Stop-Process returns before the process has exited and closed its handles.
  Wait-Process -Id @($processes | ForEach-Object { $_.ProcessId }) -Timeout 10 -ErrorAction SilentlyContinue
}

function Remove-TestTree($Path) {
  # A single Remove-Item can fail while the restarted uninstaller still holds the
  # management directory open. Retry while that lock clears, then stop the
  # uninstaller and retry once more.
  $deadline = [DateTime]::UtcNow.AddSeconds(20)
  $stopped = $false
  while (Test-Path -LiteralPath $Path) {
    try {
      Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction Stop
      return
    } catch {
      if ([DateTime]::UtcNow -lt $deadline) { Start-Sleep -Milliseconds 200; continue }
      if ($stopped) {
        # A surviving uninstaller is a test defect; a stale temporary directory is
        # not worth masking the original failure with a throw.
        $left = @(Get-UninstallerProcess $Path)
        if ($left.Count) {
          throw "Uninstaller survived cleanup: $(($left | ForEach-Object { "$($_.Name) ($($_.ProcessId))" }) -join ', ')"
        }
        Write-Warning "Could not remove the test directory: $($_.Exception.Message)"
        return
      }
      Stop-UninstallerProcess $Path
      $stopped = $true
      $deadline = [DateTime]::UtcNow.AddSeconds(5)
      continue
    }
  }
}
