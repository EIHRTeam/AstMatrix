#ifndef AppVersion
  #error AppVersion must be supplied by build.mjs
#endif
#ifndef TargetArchitecture
  #define TargetArchitecture "x64"
#endif
#if TargetArchitecture == "aarch64"
  #define InnoArchitecture "arm64"
  #define ArchitectureSuffix "-aarch64"
#elif TargetArchitecture == "x64"
  #define InnoArchitecture "x64os"
  #define ArchitectureSuffix ""
#else
  #error Unsupported TargetArchitecture
#endif

[Setup]
SetupArchitecture=x86
AppId={#StableAppId}
AppName=AstMatrix for {#HostName}
AppVersion={#AppVersion}
AppPublisher=Endfield Industries Human Resource Team
AppPublisherURL=https://github.com/EIHRTeam/AstMatrix
DefaultDirName={localappdata}\AstMatrix\Installers\{#HostName}
UsePreviousAppDir=yes
DisableDirPage=yes
DisableProgramGroupPage=yes
DisableWelcomePage=no
PrivilegesRequired=lowest
ArchitecturesAllowed={#InnoArchitecture}
ArchitecturesInstallIn64BitMode={#InnoArchitecture}
MinVersion=10.0
WizardStyle=modern dynamic windows11
Compression=lzma2/max
SolidCompression=yes
CloseApplications=no
RestartApplications=no
UninstallDisplayName=AstMatrix for {#HostName}
LicenseFile={#PayloadDir}\LICENSE
SetupLogging=yes
OutputBaseFilename=AstMatrix-{#HostName}-{#AppVersion}{#ArchitectureSuffix}-Setup
VersionInfoVersion={#AppVersion}.0

[Icons]
Name: "{userprograms}\AstMatrix\卸载 AstMatrix for {#HostName}"; Filename: "{uninstallexe}"

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
  RegisteredDir, RegisteredVersion: String;
  DisableCepDeveloperMode: Boolean;

function InitializeSetup(): Boolean;
var
  Key: String;
  Version, TargetVersion: Int64;
begin
  Result := False;
  Key := 'Software\Microsoft\Windows\CurrentVersion\Uninstall\{#StableAppId}_is1';
  if RegKeyExists(HKCU64, Key) then begin
    if not RegQueryStringValue(HKCU64, Key, 'InstallLocation', RegisteredDir) or
       not RegQueryStringValue(HKCU64, Key, 'DisplayVersion', RegisteredVersion) or
       (RegisteredDir = '') or not StrToVersion(RegisteredVersion, Version) then begin
      SuppressibleMsgBox('The previous Inno installation record is incomplete. Repair or uninstall it before retrying.', mbError, MB_OK, IDOK);
      exit;
    end;
    if not StrToVersion('{#AppVersion}', TargetVersion) then exit;
    if ComparePackedVersion(Version, TargetVersion) > 0 then begin
      SuppressibleMsgBox('A newer AstMatrix version is already installed. Downgrade is not supported.', mbError, MB_OK, IDOK);
      exit;
    end;
    if not FileExists(AddBackslash(RegisteredDir) + 'state.json') then begin
      SuppressibleMsgBox('The previous Inno installation state is missing. Repair or uninstall it before retrying.', mbError, MB_OK, IDOK);
      exit;
    end;
  end;
  Result := True;
end;

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
  if (Operation = 'preflight') or (Operation = 'install') then begin
    Arguments := Arguments + ' -ValidateRegistration';
    if RegisteredVersion <> '' then
      Arguments := Arguments + ' -RegisteredVersion ' + Quote(RegisteredVersion);
  end;
  if Operation = 'shortcuts' then
    Arguments := Arguments + ' -UninstallerPath ' + Quote(ExpandConstant('{uninstallexe}'));
  if (Operation = 'uninstall') and DisableCepDeveloperMode then
    Arguments := Arguments + ' -DisableCepDeveloperMode';
  Result := ExecAndLogOutputWithNativeSysDir(ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'),
    Arguments, '', SW_HIDE, ewWaitUntilTerminated, ExitCode, nil);
  Result := Result and (ExitCode = 0);
end;

procedure InitializeWizard();
begin
#if HostName == "Illustrator"
  WizardForm.WelcomeLabel2.Caption := 'Installs for the current Windows user. Illustrator 27.x through 30.x is supported.' + #13#10#13#10 +
    'This unsigned CEP extension requires the shared CEP 11 and CEP 12 PlayerDebugMode settings. Both are set to the string 1. Uninstall retains them unless you choose to disable CEP developer mode.';
#else
  WizardForm.WelcomeLabel2.Caption := 'Requires Photoshop 26.0 or later. Uses Adobe UPIA first. Selected installation failures fall back to experimental file extraction.' + #13#10#13#10 +
    'Extraction does not modify Adobe plugin registration and may not load in Photoshop. Restart Photoshop to verify. Adobe WebView dependencies must already be installed.';
#endif
  if RegisteredVersion <> '' then begin
    WizardForm.WelcomeLabel1.Caption := 'Update AstMatrix for {#HostName}';
    WizardForm.WelcomeLabel2.Caption := RegisteredVersion + ' → {#AppVersion}' + #13#10#13#10 +
      'Setup will update the existing installation in place. Continue and click Install to confirm.' + #13#10#13#10 + WizardForm.WelcomeLabel2.Caption;
  end;
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  Result := '';
  if (RegisteredDir <> '') and not PathSame(RemoveBackslashUnlessRoot(RegisteredDir), RemoveBackslashUnlessRoot(ExpandConstant('{app}'))) then begin
    Result := 'Updates must use the previous installation management directory: ' + RegisteredDir;
    exit;
  end;
  if not PayloadReady then begin
    ExtractTemporaryFiles('{tmp}\runtime.ps1');
    ExtractTemporaryFiles('{tmp}\payload\*');
#if HostName == "Photoshop"
    ExtractTemporaryFile('AstMatrix.ccx');
#endif
    PayloadReady := True;
  end;
  if not RunController('preflight', ExpandConstant('{tmp}\runtime.ps1')) then begin
    Result := GetIniString('result', 'error', 'Preflight failed. Close {#HostName} and check compatibility.', ExpandConstant('{tmp}\astmatrix-result.ini')) +
      ' Review ' + ExpandConstant('{app}\installer.log') + '.';
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
  if CurStep = ssPostInstall then begin
    if not RunController('shortcuts', ExpandConstant('{app}\runtime.ps1')) then
      RaiseException('Could not create the plugin uninstall shortcut. Reinstall to repair it. Review ' + ExpandConstant('{app}\installer.log') + '.');
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
#if HostName == "Illustrator"
var
  Form: TSetupForm;
  LabelText: TNewStaticText;
  Checkbox: TNewCheckBox;
  ContinueButton, CancelButton: TNewButton;
#endif
begin
  Result := True;
  DisableCepDeveloperMode := False;
#if HostName == "Illustrator"
  if UninstallSilent then exit;
  Form := CreateCustomForm(460, 190, False, True);
  try
    Form.Caption := 'AstMatrix for Illustrator - 卸载选项';
    LabelText := TNewStaticText.Create(Form);
    LabelText.Parent := Form;
    LabelText.SetBounds(ScaleX(20), ScaleY(20), ScaleX(420), ScaleY(65));
    LabelText.AutoSize := False;
    LabelText.WordWrap := True;
    LabelText.Caption := '卸载 AstMatrix。默认保留 CEP 11/12 开发者模式。关闭此共享设置也会影响其他未签名 CEP 扩展。';
    Checkbox := TNewCheckBox.Create(Form);
    Checkbox.Parent := Form;
    Checkbox.SetBounds(ScaleX(20), ScaleY(95), ScaleX(420), ScaleY(25));
    Checkbox.Caption := '关闭 CEP 开发者模式';
    Checkbox.Checked := False;
    ContinueButton := TNewButton.Create(Form);
    ContinueButton.Parent := Form;
    ContinueButton.SetBounds(ScaleX(240), ScaleY(145), ScaleX(100), ScaleY(25));
    ContinueButton.Caption := '继续卸载';
    ContinueButton.ModalResult := mrOk;
    ContinueButton.Default := True;
    CancelButton := TNewButton.Create(Form);
    CancelButton.Parent := Form;
    CancelButton.SetBounds(ScaleX(350), ScaleY(145), ScaleX(90), ScaleY(25));
    CancelButton.Caption := '取消';
    CancelButton.ModalResult := mrCancel;
    CancelButton.Cancel := True;
    Result := Form.ShowModal() = mrOk;
    if Result then DisableCepDeveloperMode := Checkbox.Checked;
  finally
    Form.Free();
  end;
#endif
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if CurUninstallStep = usUninstall then begin
    if not RunController('uninstall', ExpandConstant('{app}\runtime.ps1')) then
      RaiseException('Plugin removal could not complete. Close {#HostName} and review ' + ExpandConstant('{app}\installer.log') + '. Installer state and uninstall entry points have been retained.');
  end;
end;
