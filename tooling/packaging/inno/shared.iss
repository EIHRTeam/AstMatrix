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
AppName={cm:ProductName,{#HostName}}
AppVersion={#AppVersion}
AppPublisher=Endfield Industries Human Resource Team
AppPublisherURL=https://github.com/EIHRTeam/AstMatrix
DefaultDirName={localappdata}\AstMatrix\Installers\{#HostName}
UsePreviousAppDir=yes
UsePreviousLanguage=yes
ShowLanguageDialog=yes
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
UninstallDisplayName={cm:ProductName,{#HostName}}
LicenseFile={#PayloadDir}\LICENSE
SetupLogging=yes
OutputBaseFilename=AstMatrix-{#HostName}-{#AppVersion}{#ArchitectureSuffix}-Setup
VersionInfoVersion={#AppVersion}.0

#include "messages.iss"

[Icons]
Name: "{userprograms}\AstMatrix\{cm:UninstallShortcut,{#HostName}}"; Filename: "{uninstallexe}"

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
      SuppressibleMsgBox(CustomMessage('RegistrationIncomplete'), mbError, MB_OK, IDOK);
      exit;
    end;
    if not StrToVersion('{#AppVersion}', TargetVersion) then exit;
    if ComparePackedVersion(Version, TargetVersion) > 0 then begin
      SuppressibleMsgBox(CustomMessage('ErrDowngrade'), mbError, MB_OK, IDOK);
      exit;
    end;
    if not FileExists(AddBackslash(RegisteredDir) + 'state.json') then begin
      SuppressibleMsgBox(CustomMessage('StateMissing'), mbError, MB_OK, IDOK);
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
    Arguments := Arguments + ' -UninstallerPath ' + Quote(ExpandConstant('{uninstallexe}')) +
      ' -ShortcutName ' + Quote(CustomMessage('PluginUninstallShortcut')) +
      ' -ShortcutDescription ' + Quote(FmtMessage(CustomMessage('UninstallShortcut'), ['{#HostName}']));
  if (Operation = 'uninstall') and DisableCepDeveloperMode then
    Arguments := Arguments + ' -DisableCepDeveloperMode';
  Result := ExecAndLogOutputWithNativeSysDir(ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'),
    Arguments, '', SW_HIDE, ewWaitUntilTerminated, ExitCode, nil);
  Result := Result and (ExitCode = 0);
end;

function ControllerFailure(const FallbackKey: String): String;
var
  Key: String;
begin
  Key := GetIniString('result', 'errorKey', '', ExpandConstant('{tmp}\astmatrix-result.ini'));
  if Key = '' then Key := FallbackKey;
  Result := CustomMessage(Key) + ' ' + FmtMessage(CustomMessage('ReviewLog'), [ExpandConstant('{app}\installer.log')]);
end;

procedure RemoveOtherLanguageShortcut();
var
  Path: String;
  Shell, Link: Variant;
begin
  Path := ExpandConstant('{userprograms}\AstMatrix\') + FmtMessage(CustomMessage('OtherUninstallShortcut'), ['{#HostName}']) + '.lnk';
  if not FileExists(Path) then exit;
  try
    Shell := CreateOleObject('WScript.Shell');
    Link := Shell.CreateShortcut(Path);
    if PathSame(Link.TargetPath, ExpandConstant('{uninstallexe}')) and (Link.Arguments = '') then
      DeleteFile(Path);
  except
    Log('Previous-language shortcut cleanup failed: ' + GetExceptionMessage);
  end;
  Link := Unassigned;
  Shell := Unassigned;
end;

procedure InitializeWizard();
begin
#if HostName == "Illustrator"
  WizardForm.WelcomeLabel2.Caption := CustomMessage('WelcomeIllustrator');
#else
  WizardForm.WelcomeLabel2.Caption := CustomMessage('WelcomePhotoshop');
#endif
  if RegisteredVersion <> '' then begin
    WizardForm.WelcomeLabel1.Caption := FmtMessage(CustomMessage('UpdateTitle'), ['{#HostName}']);
    WizardForm.WelcomeLabel2.Caption := FmtMessage(CustomMessage('UpdateIntro'), [RegisteredVersion, '{#AppVersion}']) + #13#10#13#10 + WizardForm.WelcomeLabel2.Caption;
  end;
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  Result := '';
  if (RegisteredDir <> '') and not PathSame(RemoveBackslashUnlessRoot(RegisteredDir), RemoveBackslashUnlessRoot(ExpandConstant('{app}'))) then begin
    Log('Update management directory mismatch. Expected: ' + RegisteredDir + '; actual: ' + ExpandConstant('{app}'));
    Result := CustomMessage('ManagerDirectoryMismatch');
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
    Result := ControllerFailure('PreflightFailed');
    exit;
  end;
  if GetIniString('result', 'host', '', ExpandConstant('{tmp}\astmatrix-result.ini')) = 'unknown' then begin
    if SuppressibleMsgBox(CustomMessage('HostNotDetected'), mbConfirmation, MB_YESNO, IDYES) <> IDYES then
      Result := CustomMessage('InstallationCancelled');
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssInstall then begin
    if not RunController('install', ExpandConstant('{tmp}\runtime.ps1')) then
      RaiseException(ControllerFailure('InstallFailed'));
  end;
  if CurStep = ssPostInstall then begin
    if not RunController('shortcuts', ExpandConstant('{app}\runtime.ps1')) then
      RaiseException(ControllerFailure('ShortcutFailed'));
    RemoveOtherLanguageShortcut();
  end;
end;

procedure CurPageChanged(CurPageID: Integer);
begin
#if HostName == "Photoshop"
  if (CurPageID = wpFinished) and (GetIniString('result', 'mode', '', ExpandConstant('{tmp}\astmatrix-result.ini')) = 'extracted') then
    WizardForm.FinishedLabel.Caption := CustomMessage('ExtractionFinished');
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
    Form.Caption := FmtMessage(CustomMessage('UninstallOptionsTitle'), ['{#HostName}']);
    LabelText := TNewStaticText.Create(Form);
    LabelText.Parent := Form;
    LabelText.SetBounds(ScaleX(20), ScaleY(20), ScaleX(420), ScaleY(65));
    LabelText.AutoSize := False;
    LabelText.WordWrap := True;
    LabelText.Caption := CustomMessage('UninstallOptionsIntro');
    Checkbox := TNewCheckBox.Create(Form);
    Checkbox.Parent := Form;
    Checkbox.SetBounds(ScaleX(20), ScaleY(95), ScaleX(420), ScaleY(25));
    Checkbox.Caption := CustomMessage('DisableCepDeveloperMode');
    Checkbox.Checked := False;
    ContinueButton := TNewButton.Create(Form);
    ContinueButton.Parent := Form;
    ContinueButton.SetBounds(ScaleX(180), ScaleY(145), ScaleX(160), ScaleY(25));
    ContinueButton.Caption := CustomMessage('ContinueUninstall');
    ContinueButton.ModalResult := mrOk;
    ContinueButton.Default := True;
    CancelButton := TNewButton.Create(Form);
    CancelButton.Parent := Form;
    CancelButton.SetBounds(ScaleX(350), ScaleY(145), ScaleX(90), ScaleY(25));
    CancelButton.Caption := CustomMessage('Cancel');
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
      RaiseException(ControllerFailure('UninstallFailed'));
  end;
end;
