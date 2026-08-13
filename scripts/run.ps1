param([string]$RootPath = "")

# Resolve root: called from run.bat which sets -RootPath, or run directly from scripts/
if (-not $RootPath) { $RootPath = Split-Path $PSScriptRoot -Parent }

$Python    = Join-Path $RootPath "python_embeded\python.exe"
$ComfyMain = Join-Path $RootPath "ComfyUI\main.py"
$BackendPy = Join-Path $RootPath "backend\server.py"
$FrontDir  = Join-Path $RootPath "frontend"
$LogDir    = Join-Path $RootPath "logs"

$Host.UI.RawUI.WindowTitle = "FEDDA Hub v2.0"
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

Write-Host ""
Write-Host "  ============================================================" -ForegroundColor Cyan
Write-Host "    FEDDA Hub v2.0  -  single-window launcher" -ForegroundColor Cyan
Write-Host "  ============================================================" -ForegroundColor Cyan
Write-Host ""

<#
    Is there a newer version on GitHub?

    Uses `git ls-remote`, which asks the server for one ref and downloads no
    objects, so it costs a fraction of a second rather than a fetch. It only
    ever reports - pulling on launch could swap code under a session the user
    is already working in, and a broken start is worse than an old version.

    Every failure path is silent: offline, no git, not a clone. A launcher must
    never refuse to start because it could not check for updates.
#>
function Test-FeddaUpdate {
    param([string]$Root)
    try {
        if (-not (Test-Path (Join-Path $Root ".git"))) { return }
        $local = (& git -C $Root rev-parse HEAD 2>$null)
        if (-not $local) { return }

        $job = Start-Job { param($r) & git -C $r ls-remote origin HEAD 2>$null } -ArgumentList $Root
        $done = Wait-Job $job -Timeout 6
        if (-not $done) { Stop-Job $job -ErrorAction SilentlyContinue; Remove-Job $job -Force -ErrorAction SilentlyContinue; return }
        $remoteLine = Receive-Job $job
        Remove-Job $job -Force -ErrorAction SilentlyContinue
        if (-not $remoteLine) { return }

        $remote = ($remoteLine -split "\s+")[0]
        if ($remote -and $remote -ne $local.Trim()) {
            # Offer it rather than mention it. Telling someone to close the
            # window and find another file is a step most people skip, and an
            # install that never updates is how a fixed bug keeps being hit.
            #
            # Safe here and nowhere later: this runs before any service starts,
            # so nothing is swapped under a session already in use - which is
            # why the check only ever reported before.
            Write-Host ""
            Write-Host "  A newer version of FEDDA is available." -ForegroundColor Yellow
            Write-Host "  Updating takes a minute or two and keeps your models," -ForegroundColor DarkGray
            Write-Host "  outputs and settings." -ForegroundColor DarkGray
            Write-Host ""
            $answer = Read-Host "  Press Enter to update now, or type N to skip"
            if ($answer -match '^\s*[Nn]') {
                Write-Host "  Skipped. Run update.bat whenever you want it." -ForegroundColor DarkGray
                Write-Host ""
                return
            }

            $Updater = Join-Path $Root "scripts\run_update.bat"
            if (-not (Test-Path $Updater)) {
                Write-Host "  [WARN] scripts\run_update.bat is missing - update by hand." -ForegroundColor Yellow
                return
            }
            Write-Host ""
            & cmd /c "`"$Updater`""
            $updateCode = $LASTEXITCODE
            Write-Host ""
            if ($updateCode -eq 2) {
                # Refused rather than failed: the updater printed why, and
                # saying "finished" over the top of that is how an outcome
                # gets announced without being checked.
                Write-Host "  ------------------------------------------------------------" -ForegroundColor Yellow
                Write-Host "   Nothing was updated. See the reason above." -ForegroundColor Yellow
                Write-Host "  ------------------------------------------------------------" -ForegroundColor Yellow
            } elseif ($updateCode -ne 0) {
                Write-Host "  ------------------------------------------------------------" -ForegroundColor Red
                Write-Host "   The update failed (exit $updateCode). FEDDA is unchanged." -ForegroundColor Red
                Write-Host "   Detail: logs\update.log" -ForegroundColor DarkGray
                Write-Host "  ------------------------------------------------------------" -ForegroundColor Red
            } else {
                Write-Host "  ------------------------------------------------------------" -ForegroundColor Green
                Write-Host "   Update finished. Start FEDDA again to run the new version." -ForegroundColor Green
                Write-Host "  ------------------------------------------------------------" -ForegroundColor Green
            }
            Write-Host ""
            Read-Host "  Press Enter to close"
            exit 0
        }
    } catch { }
}
Test-FeddaUpdate -Root $RootPath

if (-not (Test-Path $Python)) {
    Write-Host "  [ERROR] python_embeded not found. Run the installer first." -ForegroundColor Red
    Write-Host ""; Read-Host "Press Enter to exit"; exit 1
}
if (-not (Test-Path $ComfyMain)) {
    Write-Host "  [ERROR] ComfyUI not found. Run the installer first." -ForegroundColor Red
    Write-Host ""; Read-Host "Press Enter to exit"; exit 1
}
if (-not (Test-Path "$FrontDir\node_modules")) {
    Write-Host "  [ERROR] Frontend dependencies missing. Run the installer first." -ForegroundColor Red
    Write-Host ""; Read-Host "Press Enter to exit"; exit 1
}
if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }

function Wait-Port {
    param([int]$Port, [string]$Name, [System.Diagnostics.Process]$Proc, [int]$TimeoutSec = 120)
    Write-Host "  Waiting for $Name" -NoNewline -ForegroundColor Yellow
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        if ($null -ne $Proc -and $Proc.HasExited) {
            Write-Host " CRASHED (exit $($Proc.ExitCode))" -ForegroundColor Red
            return $false
        }
        try {
            $t = [System.Net.Sockets.TcpClient]::new()
            $t.Connect('127.0.0.1', $Port)
            $t.Close()
            Write-Host " ready!" -ForegroundColor Green
            return $true
        } catch {
            Write-Host "." -NoNewline
            Start-Sleep -Seconds 2
        }
    }
    Write-Host " TIMEOUT" -ForegroundColor Red
    return $false
}

# Each service runs hidden; stdout+stderr go to log files that we tail back
# into THIS window as prefixed lines. Logs also persist for debugging.
$Services = @(
    @{ Tag = "COMFY"; Color = "Magenta"; Out = Join-Path $LogDir "comfyui_live.log";  Err = Join-Path $LogDir "comfyui_live.err.log" },
    @{ Tag = "BACK";  Color = "Green";   Out = Join-Path $LogDir "backend_live.log";  Err = Join-Path $LogDir "backend_live.err.log" },
    @{ Tag = "VITE";  Color = "Cyan";    Out = Join-Path $LogDir "frontend_live.log"; Err = Join-Path $LogDir "frontend_live.err.log" }
)
foreach ($s in $Services) {
    Remove-Item $s.Out, $s.Err -ErrorAction SilentlyContinue
    New-Item -ItemType File -Path $s.Out -Force | Out-Null
    New-Item -ItemType File -Path $s.Err -Force | Out-Null
}

$ComfyProc   = $null
$BackendProc = $null
$ViteProc    = $null
$TailJobs    = @()
$ColorMap    = @{}; foreach ($s in $Services) { $ColorMap[$s.Tag] = $s.Color }

# Drain whatever the tail jobs have buffered and print it with its tag.
# Returns $true if anything was printed, which the pump loop uses to decide
# whether to sleep.
function Show-ServiceOutput {
    $printed = $false
    foreach ($j in $TailJobs) {
        foreach ($line in (Receive-Job -Job $j -ErrorAction SilentlyContinue)) {
            if ($null -ne $line -and "$line" -ne "") {
                Write-Host "[$($j.Name)] " -NoNewline -ForegroundColor $ColorMap[$j.Name]
                Write-Host "$line"
                $printed = $true
            }
        }
    }
    return $printed
}

<#
    Print the tail of a service's log after it failed to come up.

    Reads the files rather than the tail jobs: a service can die before its job
    has attached, and this has to work in exactly that case. The jobs are
    drained first so the two do not interleave.
#>
function Show-StartupFailure {
    param([string]$Name, [string]$OutLog, [string]$ErrLog)
    Write-Host ""
    Write-Host "  ------------------------------------------------------------" -ForegroundColor Red
    Write-Host "   $Name did not start. Last lines of its log:" -ForegroundColor Red
    Write-Host "  ------------------------------------------------------------" -ForegroundColor Red
    foreach ($f in @($ErrLog, $OutLog)) {
        $lines = @(Get-Content -LiteralPath $f -Tail 25 -ErrorAction SilentlyContinue |
                   Where-Object { "$_" -ne "" })
        if ($lines.Count) {
            Write-Host "  --- $(Split-Path $f -Leaf) ---" -ForegroundColor DarkGray
            foreach ($l in $lines) { Write-Host "  $l" -ForegroundColor Gray }
        }
    }
    Write-Host ""
    Write-Host "   Full log: $ErrLog" -ForegroundColor Yellow
    Write-Host "  ------------------------------------------------------------" -ForegroundColor Red
    Write-Host ""
}

# Kill stale FEDDA services from a previous session (e.g. launcher window was
# closed with X, which couldn't tear down its children). Only touches
# processes that belong to THIS install tree.
foreach ($StalePort in 8199, 8000) {
    $Conns = Get-NetTCPConnection -LocalPort $StalePort -State Listen -ErrorAction SilentlyContinue
    foreach ($Conn in $Conns) {
        $Proc = Get-Process -Id $Conn.OwningProcess -ErrorAction SilentlyContinue
        if ($Proc -and $Proc.Path -like "$RootPath*") {
            Write-Host "  Cleaning up stale $($Proc.ProcessName) (PID $($Proc.Id)) on port $StalePort from a previous session..." -ForegroundColor Yellow
            taskkill /F /T /PID $Proc.Id 2>$null | Out-Null
        } elseif ($Proc) {
            Write-Host "  [WARN] Port $StalePort is held by $($Proc.ProcessName) (PID $($Proc.Id)) - not a FEDDA process, leaving it. Startup may fail." -ForegroundColor Yellow
        }
    }
}

try {
    <#
        Attach the tails BEFORE anything starts.

        These used to be created after the last service launched, with `-Tail 0`
        - which skips everything already in the file. ComfyUI is waited on for up
        to 120s before that point, so its whole startup, traceback included, was
        captured to disk and then never shown. A tester saw a UI full of "ComfyUI
        is not reachable" and a launcher window with no [COMFY] line in it at all.

        The files were truncated above, so -Tail 0 is now genuinely "from the
        start". Nothing drains the jobs until the pump loop, but PowerShell
        buffers job output, so it is held rather than lost.
    #>
    foreach ($s in $Services) {
        foreach ($f in @($s.Out, $s.Err)) {
            $TailJobs += Start-Job -Name $s.Tag -ArgumentList $f -ScriptBlock {
                param($Path)
                Get-Content -LiteralPath $Path -Wait -Tail 0 -ErrorAction SilentlyContinue
            }
        }
    }

    # -NoNewWindow keeps services attached to THIS console, so closing the
    # window (X) takes them down with it instead of orphaning hidden children.
    Write-Host "  [1/3] Starting ComfyUI on port 8199..." -ForegroundColor White
    # --disable-cuda-malloc: switch OFF the cudaMallocAsync backend. Its async pool
    # reserves nearly the whole 24GB and never releases segments between model
    # loads, so renders OOM from fragmentation even when only ~14GB is actually
    # needed (reserved 23.8GB vs peak-allocated 14.2GB). The native PyTorch
    # allocator releases memory between models and fixes the repeated OOMs.
    # (Do NOT set PYTORCH_CUDA_ALLOC_CONF=expandable_segments — spurious OOM here.)
    Remove-Item Env:\PYTORCH_CUDA_ALLOC_CONF -ErrorAction SilentlyContinue
    $ComfyProc = Start-Process -FilePath $Python `
        -ArgumentList "-s `"$ComfyMain`" --windows-standalone-build --port 8199 --disable-cuda-malloc --preview-method auto" `
        -PassThru -NoNewWindow `
        -RedirectStandardOutput $Services[0].Out -RedirectStandardError $Services[0].Err

    Write-Host "  [2/3] Starting backend on port 8000..." -ForegroundColor White
    $BackendProc = Start-Process -FilePath $Python `
        -ArgumentList "`"$BackendPy`"" `
        -WorkingDirectory (Split-Path $BackendPy -Parent) `
        -PassThru -NoNewWindow `
        -RedirectStandardOutput $Services[1].Out -RedirectStandardError $Services[1].Err

    $comfyOk   = Wait-Port -Port 8199 -Name "ComfyUI (this can take ~30s)" -Proc $ComfyProc -TimeoutSec 120
    $backendOk = Wait-Port -Port 8000 -Name "backend" -Proc $BackendProc -TimeoutSec 30

    if (-not $comfyOk) {
        Show-ServiceOutput | Out-Null
        Show-StartupFailure -Name "ComfyUI" -OutLog $Services[0].Out -ErrLog $Services[0].Err
        Write-Host "  Nothing that generates an image will work until this is fixed." -ForegroundColor Yellow
        Write-Host "  The rest of the app (Venice, gallery, settings) still loads." -ForegroundColor DarkGray
        Write-Host ""

        # The commonest cause has a repair, and nobody would guess it exists.
        # A comfy_kitchen built for a newer torch than the cu124 wheels can
        # give stops ComfyUI importing at all; repair_comfy.ps1 walks that
        # back, testing after each step. Harmless when the fault is something
        # else - it reports that the import works and changes nothing.
        $Repair = Join-Path $RootPath "scripts\repair_comfy.ps1"
        if (Test-Path $Repair) {
            $ans = Read-Host "  Try to repair it now? Press Enter to try, or type N to skip"
            if ($ans -notmatch '^\s*[Nn]') {
                & powershell -NoProfile -ExecutionPolicy Bypass -File $Repair -RootPath $RootPath
                Write-Host ""
                Write-Host "  Close this window and start FEDDA again." -ForegroundColor Yellow
                Write-Host ""
                Read-Host "  Press Enter to close"
                exit 0
            }
            Write-Host ""
        }
    }
    if (-not $backendOk) {
        Show-ServiceOutput | Out-Null
        Show-StartupFailure -Name "The backend" -OutLog $Services[1].Out -ErrLog $Services[1].Err
    }

    Write-Host "  [3/3] Starting frontend (vite)..." -ForegroundColor White
    $NpmCmd = "cd /d `"$FrontDir`" && npm run dev"
    $ViteProc = Start-Process -FilePath "cmd.exe" `
        -ArgumentList "/c", $NpmCmd `
        -PassThru -NoNewWindow `
        -RedirectStandardOutput $Services[2].Out -RedirectStandardError $Services[2].Err

    Write-Host ""
    Write-Host "  All services live in this window:" -ForegroundColor White
    Write-Host "    [COMFY] ComfyUI :8199   [BACK] backend :8000   [VITE] frontend :5173" -ForegroundColor DarkGray
    Write-Host "  Full logs in logs\*_live.log - press Ctrl+C to stop everything." -ForegroundColor DarkGray
    Write-Host ""

    # Pump service output until the frontend exits or Ctrl+C
    while ($true) {
        $gotOutput = Show-ServiceOutput
        if ($ViteProc.HasExited) {
            Write-Host "  Frontend exited (code $($ViteProc.ExitCode)) - shutting down." -ForegroundColor Yellow
            break
        }
        if ($ComfyProc.HasExited -and $BackendProc.HasExited) {
            Write-Host "  All services exited - shutting down." -ForegroundColor Yellow
            break
        }
        if (-not $gotOutput) { Start-Sleep -Milliseconds 250 }
    }

} finally {
    Write-Host ""
    Write-Host "  Shutting down..." -ForegroundColor Yellow
    foreach ($p in @($ViteProc, $ComfyProc, $BackendProc)) {
        if ($null -ne $p -and -not $p.HasExited) {
            taskkill /F /T /PID $p.Id 2>$null | Out-Null
        }
    }
    foreach ($j in $TailJobs) {
        Stop-Job -Job $j -ErrorAction SilentlyContinue
        Remove-Job -Job $j -Force -ErrorAction SilentlyContinue
    }
    Write-Host "  Done." -ForegroundColor Green
    Write-Host ""
}
