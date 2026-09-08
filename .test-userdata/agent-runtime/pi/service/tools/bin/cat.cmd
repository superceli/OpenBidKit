@echo off
setlocal
if "%LVCERT_ELECTRON_NODE%"=="" set "LVCERT_ELECTRON_NODE=node"
set "ELECTRON_RUN_AS_NODE=1"
"%LVCERT_ELECTRON_NODE%" "%~dp0yibiao-tool-runner.cjs" "cat" %*
exit /b %ERRORLEVEL%
