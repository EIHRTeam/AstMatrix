#ifndef AppVersion
  #error AppVersion must be supplied by build.mjs
#endif

[Setup]
AppId={#StableAppId}
AppName=AstMatrix for {#HostName}
AppVersion={#AppVersion}
AppPublisher=Endfield Industries Human Resource Team
AppPublisherURL=https://github.com/EIHRTeam/AstMatrix
DefaultDirName={localappdata}\AstMatrix\Installers\{#HostName}
DisableDirPage=yes
DisableProgramGroupPage=yes
DisableWelcomePage=no
PrivilegesRequired=lowest
ArchitecturesAllowed=x64
ArchitecturesInstallIn64BitMode=x64
MinVersion=10.0
WizardStyle=modern
Compression=lzma2
SolidCompression=yes
CloseApplications=no
RestartApplications=no
UninstallDisplayName=AstMatrix for {#HostName}
LicenseFile={#PayloadDir}\LICENSE
SetupLogging=yes
OutputBaseFilename=AstMatrix-{#HostName}-{#AppVersion}-Setup
VersionInfoVersion={#AppVersion}.0

[Files]
Source: "runtime.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "runtime.ps1"; DestDir: "{tmp}"; Flags: dontcopy
Source: "{#PayloadDir}\*"; DestDir: "{tmp}\payload"; Flags: dontcopy recursesubdirs createallsubdirs
#if HostName == "Photoshop"
Source: "{#ArchivePath}"; DestDir: "{tmp}"; DestName: "AstMatrix.ccx"; Flags: dontcopy
#endif

[Code]
var
  PayloadReady: Boolean;

function Quote(const Value: String): String;
begin
  Result := '"' + Value + '"';
end;

function RunController(const Operation, Script: String): Boolean;
var
  Arguments: String;
  ExitCode: Integer;
begin
  Arguments := '-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File ' + Quote(Script) +
    ' -Operation ' + Operation + ' -HostName {#HostName} -AppVersion {#AppVersion}' +
    ' -ManagerDir ' + Quote(ExpandConstant('{app}')) +
    ' -PayloadDir ' + Quote(ExpandConstant('{tmp}\payload')) +
    ' -ArchivePath ' + Quote(ExpandConstant('{tmp}\AstMatrix.ccx')) +
    ' -ResultPath ' + Quote(ExpandConstant('{tmp}\astmatrix-result.ini'));
  Result := ExecAndLogOutput(ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'),
    Arguments, '', SW_HIDE, ewWaitUntilTerminated, ExitCode, nil);
  Result := Result and (ExitCode = 0);
end;

procedure InitializeWizard();
begin
#if HostName == "Illustrator"
  WizardForm.WelcomeLabel2.Caption := 'Installs for the current Windows user. Illustrator 27.x through 30.x is supported.' + #13#10#13#10 +
    'This unsigned CEP extension requires the shared CEP 11 and CEP 12 PlayerDebugMode settings. Both are set to the string 1 and are retained on uninstall so other extensions keep working.';
#else
  WizardForm.WelcomeLabel2.Caption := 'Requires Photoshop 26.0 or later. Uses Adobe UPIA first. Selected installation failures fall back to experimental file extraction.' + #13#10#13#10 +
    'Extraction does not modify Adobe plugin registration and may not load in Photoshop. Restart Photoshop to verify. Adobe WebView dependencies must already be installed.';
#endif
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  Result := '';
  if not PayloadReady then begin
    ExtractTemporaryFiles('{tmp}\runtime.ps1');
    ExtractTemporaryFiles('{tmp}\payload\*');
#if HostName == "Photoshop"
    ExtractTemporaryFile('AstMatrix.ccx');
#endif
    PayloadReady := True;
  end;
  if not RunController('preflight', ExpandConstant('{tmp}\runtime.ps1')) then begin
    Result := 'Preflight failed. Close {#HostName}, check compatibility, and review ' + ExpandConstant('{app}\installer.log') + '.';
    exit;
  end;
  if GetIniString('result', 'host', '', ExpandConstant('{tmp}\astmatrix-result.ini')) = 'unknown' then begin
    if SuppressibleMsgBox('No {#HostName} installation was detected. Ensure a compatible version is installed before using the plugin. Continue?', mbConfirmation, MB_YESNO, IDYES) <> IDYES then
      Result := 'Installation cancelled.';
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssInstall then begin
    if not RunController('install', ExpandConstant('{tmp}\runtime.ps1')) then
      RaiseException('Plugin installation failed. Review ' + ExpandConstant('{app}\installer.log') + '.');
  end;
end;

procedure CurPageChanged(CurPageID: Integer);
begin
#if HostName == "Photoshop"
  if (CurPageID = wpFinished) and (GetIniString('result', 'mode', '', ExpandConstant('{tmp}\astmatrix-result.ini')) = 'extracted') then
    WizardForm.FinishedLabel.Caption := 'Experimental fallback: plugin files have been deployed. Restart Photoshop to verify that AstMatrix loads. File deployment does not confirm successful plugin loading.';
#endif
end;

function InitializeUninstall(): Boolean;
begin
  Result := RunController('uninstall', ExpandConstant('{app}\runtime.ps1'));
  if not Result then
    SuppressibleMsgBox('Plugin removal could not complete. Close {#HostName} and review ' + ExpandConstant('{app}\installer.log') + '. Installer state has been retained.', mbError, MB_OK, IDOK);
end;
