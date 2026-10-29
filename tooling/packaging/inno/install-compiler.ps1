$ErrorActionPreference = 'Stop'
$expected = 'a549929319f9120716677c685535ca4671e4b937b5fdc87e2585f32d8eb30e8c'
$directory = Join-Path $env:RUNNER_TEMP 'astmatrix-inno-6.7.4'
$installer = Join-Path $env:RUNNER_TEMP 'innosetup-6.7.4.exe'
Invoke-WebRequest -Uri 'https://github.com/jrsoftware/issrc/releases/download/is-6_7_4/innosetup-6.7.4.exe' -OutFile $installer
if ((Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash -ne $expected) { throw 'Inno Setup download SHA-256 mismatch' }
$process = Start-Process -FilePath $installer -ArgumentList @('/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/CURRENTUSER', '/NOICONS', '/TASKS=', "/DIR=`"$directory`"") -Wait -PassThru
if ($process.ExitCode -ne 0) { throw "Inno Setup bootstrap failed: $($process.ExitCode)" }
$compiler = Join-Path $directory 'ISCC.exe'
if (!(Test-Path -LiteralPath $compiler)) { throw 'ISCC.exe not found' }
"ASTMATRIX_ISCC=$compiler" | Out-File -FilePath $env:GITHUB_ENV -Append -Encoding utf8
