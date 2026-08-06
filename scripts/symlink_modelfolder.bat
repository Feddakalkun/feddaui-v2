@echo off
setlocal EnableExtensions EnableDelayedExpansion
title FEDDA - Link External Model Folder

:: ============================================================================
:: Link an external folder into ComfyUI\models\<subfolder> so FEDDA can
:: use a model library that lives on another drive WITHOUT copying it.
:: Uses directory junctions (mklink /J) - no admin rights needed.
::
:: Usage:  symlink_modelfolder.bat
::            interactive wizard - walks you through step by step
::         symlink_modelfolder.bat all
::            bulk mode - scans an external base folder and links every
::            matching subfolder into the corresponding ComfyUI model type
::         symlink_modelfolder.bat <subfolder> <name> <target-folder>
::            e.g. symlink_modelfolder.bat loras MyStash E:\AI\loras
::                 -> ComfyUI\models\loras\MyStash shows E:\AI\loras contents
::         symlink_modelfolder.bat remove <subfolder> <name>
::            removes the link only - never touches the target folder
:: ============================================================================

set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"
for %%I in ("%SCRIPT_DIR%\..") do set "APP_DIR=%%~fI"
set "MODELS_DIR=%APP_DIR%\ComfyUI\models"

if not exist "%MODELS_DIR%" (
    echo.
    echo  [ERROR] Models folder not found:
    echo          %MODELS_DIR%
    echo.
    echo  Run the FEDDA installer first.
    echo.
    pause & exit /b 1
)

:: Route to the correct mode
if /i "%~1"=="remove" goto MODE_REMOVE
if /i "%~1"=="all"    goto MODE_ALL
goto MODE_SINGLE

:: ============================================================================
:: REMOVE MODE:  symlink_modelfolder.bat remove <subfolder> <name>
:: ============================================================================
:MODE_REMOVE
    if "%~2"=="" ( echo Usage: symlink_modelfolder.bat remove ^<subfolder^> ^<name^> & pause & exit /b 1 )
    if "%~3"=="" ( echo Usage: symlink_modelfolder.bat remove ^<subfolder^> ^<name^> & pause & exit /b 1 )
    set "LINK=%MODELS_DIR%\%~2\%~3"
    if not exist "!LINK!" (
        echo  [ERROR] No such link: !LINK!
        pause & exit /b 1
    )
    fsutil reparsepoint query "!LINK!" >nul 2>nul
    if errorlevel 1 (
        echo  [ERROR] "%~3" is a real folder, not a junction - refusing to remove it.
        pause & exit /b 1
    )
    rmdir "!LINK!"
    if errorlevel 1 (
        echo  [ERROR] Could not remove link.
    ) else (
        echo.
        echo  Done! Link "%~2\%~3" has been removed.
        echo  Your actual files in the target folder were NOT touched.
        echo.
    )
    pause & exit /b 0

:: ============================================================================
:: BULK / ALL MODE:  symlink_modelfolder.bat all
::   Scans an external base folder. For every subfolder whose name matches
::   a ComfyUI model type, creates a junction inside that model type folder.
::   e.g. external base E:\AI\models has:  loras\  checkpoints\  upscale_models\
::        -> links each one into ComfyUI\models\loras\  etc.
:: ============================================================================
:MODE_ALL
    echo.
    echo  ============================================================
    echo   FEDDA - Bulk Link External Model Folders
    echo  ============================================================
    echo.
    echo  Point this at a folder that contains subfolders named after
    echo  ComfyUI model types (loras, checkpoints, etc.) and it will
    echo  link ALL of them into FEDDA automatically in one go.
    echo.
    echo  Example external structure:
    echo    E:\AI\models\
    echo      loras\          (links to models\loras\)
    echo      checkpoints\    (links to models\checkpoints\)
    echo      upscale_models\ (links to models\upscale_models\)
    echo.

    set /p "EXTBASE=  Path to your external base folder: "
    if "!EXTBASE!"=="" ( echo  Nothing entered. Cancelled. & pause & exit /b 1 )
    if "!EXTBASE:~-1!"=="\" set "EXTBASE=!EXTBASE:~0,-1!"
    if not exist "!EXTBASE!\" (
        echo.
        echo  [ERROR] Folder does not exist: !EXTBASE!
        pause & exit /b 1
    )

    echo.
    echo  Scanning "!EXTBASE!" for subfolders...
    echo.

    set "LINKED=0"
    set "SKIPPED=0"
    set "FAILED=0"

    for /f "delims=" %%S in ('dir /AD /B "!EXTBASE!" 2^>nul') do (
        call :LINK_ONE "!EXTBASE!\%%S" "%%S"
    )

    echo  ============================================================
    echo   Done^^!  Linked: !LINKED!   Skipped: !SKIPPED!   Failed: !FAILED!
    echo  ============================================================
    echo.
    echo  Refresh the model list in FEDDA or restart ComfyUI to see
    echo  your models appear.
    echo.
    pause
    exit /b 0

:: ============================================================================
:: MODE_SINGLE - single-folder interactive or argument mode
:: ============================================================================
:MODE_SINGLE
    set "SUBFOLDER=%~1"
    set "NAME=%~2"
    set "TARGET=%~3"

    echo.
    echo  ============================================================
    echo   FEDDA - Link an External Model Folder
    echo  ============================================================
    echo.
    echo  This creates a junction inside ComfyUI\models so FEDDA can
    echo  see models stored on another drive without copying files.
    echo.
    echo  TIP: To bulk-link an entire folder tree, run with "all":
    echo       symlink_modelfolder.bat all
    echo.
    echo  You will be asked 3 things:
    echo    1. Which model type folder to link into  (e.g. loras)
    echo    2. The path to your external folder      (e.g. E:\AI\loras)
    echo    3. What to call it inside FEDDA          (e.g. MyLoras)
    echo.

    :: STEP 1 - which model type
    if not "!SUBFOLDER!"=="" goto HAVE_SUB
    echo  Available model type folders in ComfyUI\models:
    echo  --------------------------------------------------------
    for /f "delims=" %%D in ('dir /AD /B "%MODELS_DIR%" 2^>nul') do echo    %%D
    echo  --------------------------------------------------------
    echo.
    echo  Common: loras  checkpoints  upscale_models  controlnet  text_encoders
    echo.
    set /p "SUBFOLDER=  STEP 1 - Model folder name (default: loras): "
    if "!SUBFOLDER!"=="" set "SUBFOLDER=loras"
    if /i "!SUBFOLDER!"=="all" goto MODE_ALL
    :HAVE_SUB

    set "DEST_DIR=%MODELS_DIR%\!SUBFOLDER!"
    if exist "!DEST_DIR!\" goto HAVE_DEST
    echo.
    echo  [WARNING] The folder "models\!SUBFOLDER!" does not exist yet.
    set /p "MKIT=      Create it now? [Y/N]: "
    if /i not "!MKIT!"=="Y" ( echo  Cancelled. & pause & exit /b 1 )
    mkdir "!DEST_DIR!"
    :HAVE_DEST

    echo.
    echo  Existing links in models\!SUBFOLDER!:
    set "FOUND="
    for /f "delims=" %%D in ('dir /AL /B "!DEST_DIR!" 2^>nul') do (
        set "FOUND=1"
        echo    %%D
    )
    if not defined FOUND echo    (none yet)
    echo.

    :: STEP 2 - external path
    if not "!TARGET!"=="" goto HAVE_TARGET
    echo  --------------------------------------------------------
    echo   STEP 2 - Path to your external model folder
    echo  --------------------------------------------------------
    echo   Example:  E:\AI\loras   or   D:\Models\checkpoints
    echo.
    set /p "TARGET=  Full path to your external folder: "
    :HAVE_TARGET

    if "!TARGET!"=="" ( echo  Nothing entered. Cancelled. & pause & exit /b 1 )
    if "!TARGET:~-1!"=="\" set "TARGET=!TARGET:~0,-1!"

    if not exist "!TARGET!\" (
        echo.
        echo  [ERROR] Folder does not exist: !TARGET!
        pause & exit /b 1
    )

    :: STEP 3 - link name
    if not "!NAME!"=="" goto HAVE_NAME
    for %%I in ("!TARGET!") do set "DEFNAME=%%~nxI"
    echo.
    echo  --------------------------------------------------------
    echo   STEP 3 - What to call it inside FEDDA
    echo  --------------------------------------------------------
    echo   Name that appears in: ComfyUI\models\!SUBFOLDER!\
    echo   Press Enter to use the source folder name: !DEFNAME!
    echo.
    set /p "NAME=  Name (default: !DEFNAME!): "
    if "!NAME!"=="" set "NAME=!DEFNAME!"
    :HAVE_NAME

    set "LINK=!DEST_DIR!\!NAME!"
    if exist "!LINK!" (
        echo.
        echo  [ERROR] "!NAME!" already exists in models\!SUBFOLDER!\
        echo          Choose a different name or remove it first:
        echo          symlink_modelfolder.bat remove !SUBFOLDER! !NAME!
        echo.
        pause & exit /b 1
    )

    echo.
    echo  Creating junction...
    echo    Inside FEDDA:  models\!SUBFOLDER!\!NAME!
    echo    Points to:     !TARGET!
    echo.

    mklink /J "!LINK!" "!TARGET!" >nul 2>nul
    if errorlevel 1 (
        echo  [WARN] Junction failed - trying symbolic link (needs Developer Mode or Admin)...
        mklink /D "!LINK!" "!TARGET!" >nul 2>nul
        if errorlevel 1 (
            echo.
            echo  [ERROR] Could not create the link.
            echo          Junctions only work for local drives.
            echo          For network paths, run as Administrator.
            echo.
            pause & exit /b 1
        )
    )

    echo  ============================================================
    echo   SUCCESS^^!
    echo  ============================================================
    echo   models\!SUBFOLDER!\!NAME!  now points to:
    echo   !TARGET!
    echo.
    echo   Refresh the model list in FEDDA or restart ComfyUI.
    echo  ============================================================
    echo.
    pause
    exit /b 0

:: ============================================================================
:: Subroutine: LINK_ONE  %1=full-path-to-source  %2=folder-name
:: Called once per subfolder in bulk mode. Uses MODELS_DIR, LINKED, SKIPPED, FAILED.
:: ============================================================================
:LINK_ONE
    set "L1_SRC=%~1"
    set "L1_NAME=%~2"

    :: Does a ComfyUI model type folder with the same name exist?
    if exist "%MODELS_DIR%\%L1_NAME%\" (
        set "L1_LINK=%MODELS_DIR%\%L1_NAME%\%L1_NAME%"
        if exist "!L1_LINK!" (
            echo  [SKIP] models\%L1_NAME%\%L1_NAME% already exists.
            set /a SKIPPED+=1
        ) else (
            echo  Linking:  models\%L1_NAME%\%L1_NAME%
            echo            from: %L1_SRC%
            mklink /J "!L1_LINK!" "%L1_SRC%" >nul 2>nul
            if errorlevel 1 (
                echo  [FAIL] Could not create junction.
                set /a FAILED+=1
            ) else (
                echo  [OK]
                set /a LINKED+=1
            )
        )
    ) else (
        echo  NOTE: No model type named "%L1_NAME%" in ComfyUI\models - skipping.
        echo        Run without "all" to manually choose where to put it.
        set /a SKIPPED+=1
    )
    echo.
    goto :eof
