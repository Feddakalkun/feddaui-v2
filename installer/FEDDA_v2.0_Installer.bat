@echo off
setlocal EnableDelayedExpansion
title FEDDA v2.0 One-Click Installer
set "APP_NAME=FEDDA Hub v2.0"

:: ===========================================================================
::  Already installed? Then this file is just the launcher.
::
::  The test is logs\install_report.txt, which install.ps1 writes as its very
::  last act. Nothing else here proves an install finished.
::
::  This used to check that python_embeded\python.exe and ComfyUI\main.py both
::  existed. ComfyUI is cloned in step 2 of 7 and PyTorch arrives in step 3, so
::  a run that died during the multi-gigabyte torch download - a dropped
::  connection, a closed window - left both files sitting there with no torch
::  behind them. Every later double-click then skipped the install and launched
::  straight into the wreck, ComfyUI crashed on `import torch`, and the app said
::  only that it could not reach port 8199. Re-running the installer, the
::  obvious thing to try, was the one thing guaranteed not to help.
::
::  A false negative costs a re-run that mostly no-ops (the steps below skip
::  what is already present). A false positive strands the user for good. So
::  when in doubt, install.
:: ===========================================================================
set "QUICK_ROOT=%~dp0"
if "%QUICK_ROOT:~-1%"=="\" set "QUICK_ROOT=%QUICK_ROOT:~0,-1%"
set "QUICK_REPORT=%QUICK_ROOT%\app\logs\install_report.txt"
if not exist "%QUICK_REPORT%" goto QUICK_NO
if not exist "%QUICK_ROOT%\app\run.bat" goto QUICK_NO

:: The report exists even when the install failed - install.ps1 writes it either
:: way and records the verdict inside. PASSED is the only thing worth trusting.
findstr /R /C:"Smoke Test: *PASSED" "%QUICK_REPORT%" >nul 2>&1
if errorlevel 1 goto QUICK_BROKEN

cd /d "%QUICK_ROOT%\app"
call "%QUICK_ROOT%\app\run.bat" %*
exit /b 0

:QUICK_BROKEN
echo.
echo   The last installation ran to the end but its self-test FAILED,
echo   so FEDDA has not been started. Repairing it now.
echo.
echo   (the previous result is in app\logs\install_report.txt)
echo.
timeout /t 6 >nul 2>&1
goto QUICK_CONTINUE

:QUICK_NO
:: Half an install is worse than none, because it looks like one. Say so, so
:: the second run does not look like the installer ignoring the first.
if exist "%QUICK_ROOT%\app\ComfyUI\main.py" (
    echo.
    echo   A previous installation was started here but never finished.
    echo   Continuing it now - already-installed parts are kept.
    echo.
    timeout /t 4 >nul 2>&1
)

:QUICK_CONTINUE

:: ===========================================================================
::  Front-of-house: welcome, requirements, disclaimer, info. The requirements
::  screen fetches portable Git and Node rather than offering to install them.
::  (Prototyped in ghost-installer.bat, ported here 2026-07-24.)
:: ===========================================================================

:SHOW_WELCOME
cls
echo.
echo   ============================================================
echo      %APP_NAME%  -  Setup
echo   ============================================================
echo.
echo   Welcome. This wizard will set up FEDDA Hub on this computer.
echo.
echo   Before anything is installed, please read the notice on the
echo   next screens.
echo.
echo   Press any key to continue...
pause >nul

:SHOW_REQUIREMENTS
cls
echo.
echo   ============================================================
echo      BEFORE YOU START  -  what you need
echo   ============================================================
echo.
echo   FEDDA brings its own Python and sets up ComfyUI and PyTorch
echo   for you - you do NOT need to install those.
echo.
echo   You DO need an NVIDIA GeForce RTX graphics card with a recent driver.
echo.
echo   Git and Node.js are also required - and if they are missing, this
echo   installer downloads portable copies into portable-files\ rather than
echo   installing anything into Windows.
echo.
echo   Optional: Ollama https://ollama.com  (smarter prompt / vision
echo   helpers; FEDDA works without it too).
echo.
echo   ------------------------------------------------------------
echo   Quick check on this machine:
echo   ------------------------------------------------------------

set "INSTALL_ROOT_EARLY=%~dp0"
if "%INSTALL_ROOT_EARLY:~-1%"=="\" set "INSTALL_ROOT_EARLY=%INSTALL_ROOT_EARLY:~0,-1%"

set "GIT_OK=MISSING"
where git >nul 2>nul && set "GIT_OK=found"
set "NODE_OK=MISSING"
where node >nul 2>nul && set "NODE_OK=found"

echo     Git      : %GIT_OK%
echo     Node.js  : %NODE_OK%
echo.
if /i "%GIT_OK%"=="found" if /i "%NODE_OK%"=="found" goto REQ_OK

:: --- one or both missing: fetch portable copies ---
:: Previously this asked winget to install them system-wide, and exited if
:: winget was absent. Requiring a developer toolchain before a picture can be
:: generated is the largest barrier this installer had; a local copy under
:: portable-files\ removes it and touches nothing outside this folder.
set "PORTABLE_DIR=%INSTALL_ROOT_EARLY%\portable-files"
if not exist "%PORTABLE_DIR%" mkdir "%PORTABLE_DIR%"

if /i not "%GIT_OK%"=="found" (
    if not exist "%PORTABLE_DIR%\git\cmd\git.exe" (
        echo   Downloading portable Git ...
        powershell -NoProfile -Command "Invoke-WebRequest -UseBasicParsing -Uri 'https://github.com/git-for-windows/git/releases/download/v2.44.0.windows.1/PortableGit-2.44.0-64-bit.7z.exe' -OutFile '%PORTABLE_DIR%\git_installer.exe'"
        start /wait "" "%PORTABLE_DIR%\git_installer.exe" -y -o"%PORTABLE_DIR%\git"
        del /f /q "%PORTABLE_DIR%\git_installer.exe" >nul 2>&1
    )
    set "PATH=%PORTABLE_DIR%\git\cmd;%PATH%"
)

if /i not "%NODE_OK%"=="found" (
    if not exist "%PORTABLE_DIR%\node\node.exe" (
        echo   Downloading portable Node.js 20 LTS ...
        powershell -NoProfile -Command "Invoke-WebRequest -UseBasicParsing -Uri 'https://nodejs.org/dist/v20.11.1/node-v20.11.1-win-x64.zip' -OutFile '%PORTABLE_DIR%\node.zip'"
        powershell -NoProfile -Command "Expand-Archive -Path '%PORTABLE_DIR%\node.zip' -DestinationPath '%PORTABLE_DIR%\node_tmp' -Force"
        xcopy /E /I /Y "%PORTABLE_DIR%\node_tmp\node-v20.11.1-win-x64\*" "%PORTABLE_DIR%\node\" >nul
        rmdir /s /q "%PORTABLE_DIR%\node_tmp" >nul 2>&1
        del /f /q "%PORTABLE_DIR%\node.zip" >nul 2>&1
    )
    set "PATH=%PORTABLE_DIR%\node;%PATH%"
)

where git >nul 2>nul || goto REQ_MANUAL
where node >nul 2>nul || goto REQ_MANUAL
echo   Portable tools ready.
goto REQ_OK

:REQ_MANUAL
echo.
echo   [X] Git and/or Node.js could not be found or downloaded, and
echo       FEDDA cannot install without them. Check your internet
echo       connection, or install them yourself and run this again:
echo         Git         https://git-scm.com/download/win
echo         Node.js LTS https://nodejs.org
echo.
pause
exit /b 1

:REQ_OK
echo   Press any key to continue...
pause >nul

:SHOW_DISCLAIMER
cls
echo.
echo   ============================================================
echo      IMPORTANT - PLEASE READ BEFORE INSTALLING
echo   ============================================================
echo.
echo   %APP_NAME% is a local, self-hosted AI media studio. It runs
echo   on YOUR machine and generates synthetic / AI images, video
echo   and voice. By installing and using it you agree to the
echo   following:
echo.
echo   1. ADULTS ONLY. This software can produce adult content. It
echo      is intended for users who are 18+ and legally adults in
echo      their jurisdiction.
echo.
echo   2. YOUR RESPONSIBILITY. You are solely responsible for what
echo      you generate and where you publish it, and for obeying
echo      the laws that apply to you and the terms of any platform
echo      you post to.
echo.
echo   3. NO REAL PEOPLE WITHOUT CONSENT. Do not create content
echo      depicting a real, identifiable person without their
echo      consent. Creating sexual or abusive content of anyone
echo      who is, or appears to be, a minor is strictly forbidden
echo      and illegal - never do this.
echo.
echo   4. THIRD-PARTY MODELS. Checkpoints, LoRAs and nodes are made
echo      by third parties under their own licenses. You are
echo      responsible for using them within those licenses.
echo.
echo   5. LOCAL AND PRIVATE. FEDDA runs entirely on your own
echo      machine. Your prompts and creations stay with you -
echo      nothing is sent to us. It is a community project that
echo      keeps getting better over time.
echo.
echo   ------------------------------------------------------------
echo.
:: A screen is not consent. `pause` returns immediately when stdin is
:: empty - piped, redirected, run from a script or a service - so every
:: one of these notices, this one included, used to scroll past unread.
:: Found by accident: a probe with no stdin ran the whole front-of-house
:: and started installing.
::
:: Typing is required instead. With no stdin the variable stays empty and
:: the install refuses, which is the correct answer: terms nobody read
:: have not been accepted. There is deliberately no environment variable
:: to bypass this - that would rebuild the hole.
:ASK_AGREE
set "AGREE="
set /p "AGREE=Type  I AGREE  to accept these terms, or N to cancel: "
if /i "%AGREE%"=="N" goto DECLINED
if /i "%AGREE%"=="I AGREE" goto AGREED
if not defined AGREE goto DECLINED
echo   Please type  I AGREE  exactly, or N to cancel.
goto ASK_AGREE

:DECLINED
echo.
echo   ------------------------------------------------------------
echo   The terms were not accepted, so nothing has been installed.
echo.
echo   If you are running this from a script or a pipe, run it in a
echo   console instead - these terms have to be read by a person.
echo   ------------------------------------------------------------
echo.
pause
exit /b 1

:AGREED

:SHOW_INFO
cls
echo.
echo   ============================================================
echo      READY TO INSTALL  -  what will happen
echo   ============================================================
echo.
echo   The installer will now:
echo     - Download the app source from GitHub
echo     - Set up an embedded Python + ComfyUI
echo     - Install the required custom nodes and dependencies
echo     - Build the FEDDA frontend
echo.
echo   Good to know:
echo     - This can take 30-60 minutes on a first run
echo     - It needs a stable internet connection
echo     - Plan for a good amount of free disk space for models
echo     - A recent NVIDIA GPU is strongly recommended
echo.
echo   No further input is required once it starts.
echo.
echo   Press any key to begin the installation...
pause >nul

echo.
echo ============================================================
echo   FEDDA Hub v2.0 - Standalone Installer
echo ============================================================
echo.

set "INSTALL_ROOT=%~dp0"
if "%INSTALL_ROOT:~-1%"=="\" set "INSTALL_ROOT=%INSTALL_ROOT:~0,-1%"

set "APP_DIR=%INSTALL_ROOT%\app"
set "LOGS_DIR=%INSTALL_ROOT%\logs"
set "REPO_URL=https://github.com/Feddakalkun/Fedda_hub_v2.0.git"
set "INSTALL_LOG=%LOGS_DIR%\install.log"

echo Install root     : %INSTALL_ROOT%
echo Target app dir   : %APP_DIR%
echo Git remote       : %REPO_URL%
echo.

:: --- Prepare log file ---
if not exist "%LOGS_DIR%" mkdir "%LOGS_DIR%"
echo # FEDDA Hub v2.0 Installation Log > "%INSTALL_LOG%"
echo **Started:** %date% %time% >> "%INSTALL_LOG%"
echo **Root:** %INSTALL_ROOT% >> "%INSTALL_LOG%"
echo **Repo:** %REPO_URL% >> "%INSTALL_LOG%"
echo. >> "%INSTALL_LOG%"
echo --- >> "%INSTALL_LOG%"

:: --- Prerequisites (Git + Node.js) already verified in the front-of-house ---

:: --- Prepare folders ---
if not exist "%APP_DIR%" mkdir "%APP_DIR%"

:: --- Clone or update the source ---
if not exist "%APP_DIR%\.git" (
    echo [1/3] Cloning clean v2.0 repository into app\ ...
    echo [1/3] Cloning clean v2.0 repository into app\ ... >> "%INSTALL_LOG%"
    git clone --depth 1 "%REPO_URL%" "%APP_DIR%" >> "%INSTALL_LOG%" 2>&1
    if %errorlevel% neq 0 (
        echo [ERROR] Git clone failed.
        echo [ERROR] Git clone failed. >> "%INSTALL_LOG%"
        pause
        exit /b 1
    )
) else (
    echo [1/3] Updating existing app\ from GitHub ...
    echo [1/3] Updating existing app\ from GitHub ... >> "%INSTALL_LOG%"
    pushd "%APP_DIR%"
    git fetch origin >> "%INSTALL_LOG%" 2>&1
    git reset --hard origin/main >> "%INSTALL_LOG%" 2>&1
    popd
)

echo [1/3] Source ready in app\
echo [1/3] Source ready in app\ >> "%INSTALL_LOG%"

:: --- Run the inner modular installer (main single install) ---
echo [2/3] Running inner setup...
echo         This will install ComfyUI, custom nodes, frontend deps, etc.
echo.
echo   The inner installer is now starting.
echo   Its output will appear below. This can take several minutes.
echo   No input is required during this step.
echo.
echo [2/3] Running inner setup... >> "%INSTALL_LOG%"
echo Inner installer starting - live output follows. No input required. >> "%INSTALL_LOG%"
echo. >> "%INSTALL_LOG%"

set "FEDDA_UNATTENDED=1"
pushd "%APP_DIR%"
call scripts\install.bat
set "INNER_EXIT=%errorlevel%"
popd
set "FEDDA_UNATTENDED="

echo. >> "%INSTALL_LOG%"
echo --- Inner installer finished (exit code %INNER_EXIT%) --- >> "%INSTALL_LOG%"
if exist "%APP_DIR%\logs\install_fast_log.txt" (
    echo. >> "%INSTALL_LOG%"
    echo --- app\logs\install_fast_log.txt --- >> "%INSTALL_LOG%"
    type "%APP_DIR%\logs\install_fast_log.txt" >> "%INSTALL_LOG%"
)
if exist "%APP_DIR%\logs\install_report.txt" (
    echo. >> "%INSTALL_LOG%"
    echo --- app\logs\install_report.txt --- >> "%INSTALL_LOG%"
    type "%APP_DIR%\logs\install_report.txt" >> "%INSTALL_LOG%"
)

:: Two things have to be clean, not one. The exit code misses the common case:
:: Venv-Pip warns and continues when a package fails, so install.ps1 can reach
:: its end - exit 0 - with no working torch, and record that as
:: "Smoke Test: FAILED" in the report. Checking only the exit code is how a
:: broken install used to reach the "ALL DONE" screen.
set "INSTALL_OK=1"
if %INNER_EXIT% neq 0 set "INSTALL_OK=0"
if exist "%APP_DIR%\logs\install_report.txt" (
    findstr /R /C:"Smoke Test: *PASSED" "%APP_DIR%\logs\install_report.txt" >nul 2>&1
    if errorlevel 1 set "INSTALL_OK=0"
) else (
    set "INSTALL_OK=0"
)

if %INNER_EXIT% neq 0 (
    echo.
    echo [WARN] Inner installer exited with code %INNER_EXIT%.
    echo [WARN] Inner installer exited with code %INNER_EXIT% >> "%INSTALL_LOG%"
) else (
    echo.
    echo [2/3] Inner installer completed successfully.
    echo [2/3] Inner installer completed successfully. >> "%INSTALL_LOG%"
)
if "%INSTALL_OK%"=="0" (
    echo [WARN] The install self-test did not pass.
    echo [WARN] The install self-test did not pass. >> "%INSTALL_LOG%"
)

:: --- Create convenience launchers in the install root ---
echo [3/3] Creating run.bat and update.bat in the install root...
echo [3/3] Creating run.bat and update.bat in the install root... >> "%INSTALL_LOG%"

:: Thin run.bat - launches the real one inside app\
:: NOTE: use echo-only inside redirect blocks - other commands (cd, call, pause) get EXECUTED, not written
(
    echo @echo off
    echo cd /d "%%~dp0app"
    echo call run.bat %%*
) > "%INSTALL_ROOT%\run.bat"

:: Thin update.bat - for existing users (distribute this when adding new workflows)
(
    echo @echo off
    echo cd /d "%%~dp0app"
    echo echo ============================================================
    echo echo   FEDDAKALKUN - Update for Existing Installs
    echo echo ============================================================
    echo echo.
    echo echo This will:
    echo echo   - Pull latest code and new workflow files from GitHub
    echo echo   - Install any new custom nodes required by new workflows
    echo echo   - Update ComfyUI core and dependencies as needed
    echo echo.
    echo echo Starting update...
    echo echo.
    echo if exist "scripts\run_update.bat" ^(
    echo     call scripts\run_update.bat
    echo ^) else ^(
    echo     powershell -ExecutionPolicy Bypass -File "scripts\update_code.ps1"
    echo ^)
    echo echo.
    echo echo Update finished. Check logs\update.log for details.
    echo echo You may need to restart ComfyUI / FEDDA after this.
    echo echo.
    echo pause
) > "%INSTALL_ROOT%\update.bat"

:: Thin download_models.bat - per-workflow model downloads (resumable)
(
    echo @echo off
    echo cd /d "%%~dp0app"
    echo call scripts\download_models.bat %%*
) > "%INSTALL_ROOT%\download_models.bat"

:: Thin symlink_modelfolder.bat - link an external model folder into models\<subfolder>
(
    echo @echo off
    echo cd /d "%%~dp0app"
    echo call scripts\symlink_modelfolder.bat %%*
) > "%INSTALL_ROOT%\symlink_modelfolder.bat"

echo.
echo   Finishing up...

:: --- Generate log.md that contains the entire install log ---
echo.
echo [INFO] Generating log.md with the install log...
(
    echo # FEDDAKALKUN v2.0 - Installation Log
    echo.
    echo **Generated:** %date% %time%
    echo **Install Root:** %INSTALL_ROOT%
    echo **Target Repo:** %REPO_URL%
    echo **Inner Installer Exit Code:** %INNER_EXIT%
    echo.
    echo ---
    echo.
    echo ## Complete Install Log
    echo.
    echo ```text
    type "%INSTALL_LOG%"
    echo ```
    echo.
    echo ---
    echo.
    echo *This file contains the entire output from the installation process.*
) > "%INSTALL_ROOT%\log.md"

echo [INFO] log.md created successfully at %INSTALL_ROOT%\log.md
echo [INFO] log.md created successfully at %INSTALL_ROOT%\log.md >> "%INSTALL_LOG%"

if "%INSTALL_OK%"=="0" goto FINISH_FAILED

echo.
echo   ============================================================
echo      ALL DONE  -  FEDDA is installed
echo   ============================================================
echo.
echo   Your shortcuts are in this folder:
echo.
echo     run.bat                Start FEDDA - the one you use every day.
echo     update.bat             Get the latest version (new code + nodes).
echo     download_models.bat    OPTIONAL - pre-fetch a workflow's models
echo                            (FEDDA can also grab them on first run).
echo     symlink_modelfolder.bat  OPTIONAL / advanced - link a model
echo                            folder from another drive to save space.
echo.
echo   ------------------------------------------------------------
echo     To start FEDDA now, just run  run.bat
echo   ------------------------------------------------------------
echo.
echo   (If something looks wrong, the full log is in  log.md)
echo.
echo   Press any key to close this window...
pause
exit /b 0

:FINISH_FAILED
echo.
echo   ============================================================
echo      SETUP DID NOT FINISH
echo   ============================================================
echo.
echo   Part of the installation failed, so FEDDA is not ready to
echo   run yet. Starting it now would only show "ComfyUI is not
echo   reachable" - the setup, not the app, is what needs fixing.
echo.
echo   What to look at, in order:
echo.
echo     app\logs\install_report.txt   the summary and the self-test
echo     app\logs\install_fast_log.txt every step in full
echo     log.md                        all of the above in one file
echo.
echo   The most common cause is a dropped connection during the
echo   PyTorch download, which is several gigabytes. Running this
echo   installer again resumes where it stopped and keeps whatever
echo   already installed correctly.
echo.
echo   Press any key to close this window...
pause
exit /b 1
