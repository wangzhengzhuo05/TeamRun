@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
set "LAUNCHER=%SCRIPT_DIR%orca.exe"
set "TEAMRUN_CLI_COMMAND=teamrun"

if not exist "%LAUNCHER%" (
  echo Unable to locate the native TeamRun CLI launcher at "%LAUNCHER%" 1>&2
  exit /b 1
)

"%LAUNCHER%" %*
exit /b %ERRORLEVEL%
