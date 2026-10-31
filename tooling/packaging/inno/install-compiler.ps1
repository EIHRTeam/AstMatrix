$ErrorActionPreference = 'Stop'
# SHA-256 of the immutable official is-7_1_1 release's x64 compiler installer.
$expected = '8a5a6711c3766a6e5fb74f280ba0e3551e719ce94538d901fdbd1f8f9920b3f0'
$directory = Join-Path $env:RUNNER_TEMP 'astmatrix-inno-7.1.1'
$installer = Join-Path $env:RUNNER_TEMP 'innosetup-7.1.1-x64.exe'
Invoke-WebRequest -Uri 'https://github.com/jrsoftware/issrc/releases/download/is-7_1_1/innosetup-7.1.1-x64.exe' -OutFile $installer
if ((Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash -ne $expected) { throw 'Inno Setup download SHA-256 mismatch' }
$process = Start-Process -FilePath $installer -ArgumentList @('/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/CURRENTUSER', '/NOICONS', '/TASKS=', "/DIR=`"$directory`"") -Wait -PassThru
if ($process.ExitCode -ne 0) { throw "Inno Setup bootstrap failed: $($process.ExitCode)" }
$compiler = Join-Path $directory 'ISCC.exe'
if (!(Test-Path -LiteralPath $compiler)) { throw 'ISCC.exe not found' }
"ASTMATRIX_ISCC=$compiler" | Out-File -FilePath $env:GITHUB_ENV -Append -Encoding utf8
