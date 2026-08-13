# ============================================================================
# FEDDA Update & Repair - auto-detects portable vs lite mode
# ============================================================================

param([switch]$SilentMode)

# Never let git pause for input (merge editor / pager / auth prompt). A diverged
# custom-node repo doing `git pull` was opening an editor and freezing the update.
$env:GIT_PAGER = 'cat'
$env:GIT_EDITOR = 'true'
$env:GIT_TERMINAL_PROMPT = '0'
$env:GCM_INTERACTIVE = 'never'

$ErrorActionPreference = "Stop"

<#
    Apply a custom node's repair_dependency_list.txt ourselves instead of
    running its repair_dependency.bat.

    LayerStyle's script froze every update: it ends in `pause`, so an automated
    run waits forever for a keypress nobody is there to give. It also installs
    from a Chinese PyPI mirror, which from Europe is slow enough to look like a
    second hang, and it uninstalls onnxruntime without ever reinstalling it -
    taking out a package controlnet_aux and ReActor both need.

    So: same intent, none of that. The list is installed from the default
    index, conflicting opencv builds are cleared first because having several
    side by side is the actual problem these scripts exist to fix, and
    onnxruntime is left alone.
#>
<#
    Run pip without Windows PowerShell dressing its stderr up as failures.

    `& python -m pip ... 2>&1` turns every warning pip writes to stderr into an
    ErrorRecord, so a normal update scrolls past red "NativeCommandError" blocks
    about resolver conflicts that are not errors at all - it looks like the
    update is failing when it is doing exactly what it should. Piping through
    Out-String keeps the text and drops the pretence.
#>
function Invoke-Pip {
    param([string]$PyExe, [string[]]$PipArgs, [string]$Label = "pip")
    $prev = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        # Captured, not printed. A failed source build answers with ninety
        # lines of compiler output, and an update that touches forty nodes
        # buries its own progress in them - which is what the console looked
        # like before this. The detail still exists, in logs\update_pip.log.
        #
        # 2>&1 is safe now that the result goes into Out-String: the
        # ErrorRecords PowerShell wraps stderr in are rendered as their own
        # text there, so none of them reach the console as red blocks. That
        # wrapping, not the redirection itself, was the original complaint.
        $out = & $PyExe @PipArgs 2>&1 | Out-String
        $code = $LASTEXITCODE
        if ($script:PipDetailLog) {
            Add-Content -LiteralPath $script:PipDetailLog -ErrorAction SilentlyContinue `
                -Value ("`r`n===== $Label =====`r`n" + $out)
        }
        return $code
    } finally {
        $ErrorActionPreference = $prev
    }
}


function Invoke-NodeDependencyRepair {
    param(
        [string]$NodeDir,
        [string]$NodeName,
        [string]$PyExe
    )
    $list = Join-Path $NodeDir "repair_dependency_list.txt"
    if (-not (Test-Path $list)) { return }

    $pkgs = Get-Content $list | ForEach-Object { $_.Trim() } | Where-Object { $_ -and -not $_.StartsWith("#") }
    if (-not $pkgs) { return }

    Write-Host "  [$NodeName] Repairing dependencies ($($pkgs.Count))..." -ForegroundColor Gray
    $prev = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        if ($pkgs -match "opencv") {
            & $PyExe -s -m pip uninstall -y opencv-python opencv-contrib-python `
                opencv-python-headless opencv-contrib-python-headless 2>&1 | Out-Null
        }
        foreach ($p in $pkgs) {
            & $PyExe -s -m pip install --no-input --no-warn-script-location "$p" 2>&1 | Out-Null
        }
    } catch {
        Write-Host "  [$NodeName] Dependency repair failed - continuing." -ForegroundColor DarkYellow
    } finally {
        $ErrorActionPreference = $prev
    }
}
$ScriptPath = $PSScriptRoot
$RootPath = Split-Path -Parent $ScriptPath
Set-Location $RootPath

# Start transcript only when run standalone (update_code.ps1 owns it when calling us)
$LogDir = Join-Path $RootPath "logs"
if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }
$LogFile = Join-Path $LogDir "update.log"
# Where Invoke-Pip puts the output it no longer prints. Separate from update.log
# so the readable account of the run stays readable.
$script:PipDetailLog = Join-Path $LogDir "update_pip.log"
Set-Content -LiteralPath $script:PipDetailLog -Value "FEDDA update - pip detail - $(Get-Date)" -ErrorAction SilentlyContinue
$script:PipFailures = @()
if (-not $FeddaTranscriptOwner) {
    try { Start-Transcript -Path $LogFile -Append -Force | Out-Null } catch {}
}

if (-not $SilentMode) {
    Write-Host "===================================================" -ForegroundColor Cyan
    Write-Host "      FEDDA UPDATE & REPAIR" -ForegroundColor Cyan
    Write-Host "===================================================" -ForegroundColor Cyan
}

# ============================================================================
# DETECT MODE
# ============================================================================
$PortablePy = Join-Path $RootPath "python_embeded\python.exe"
$VenvPy     = Join-Path $RootPath "venv\Scripts\python.exe"
$NodeEmbed  = Join-Path $RootPath "node_embeded\node.exe"
$ComfyDir = Join-Path $RootPath "ComfyUI"
$CustomNodesDir = Join-Path $ComfyDir "custom_nodes"

# Detection order: venv = Lite (even if python_embeded also exists, since
# Lite now embeds Python 3.11.9 but still creates a venv from it).
# Full/portable = has python_embeded AND node_embeded (no venv).
if (Test-Path $VenvPy) {
    $Mode = "lite"
    $PyExe = $VenvPy
    if (-not $SilentMode) { Write-Host "`n  Mode: Lite (venv)" -ForegroundColor Green }
} elseif ((Test-Path $PortablePy) -and (Test-Path $NodeEmbed)) {
    $Mode = "portable"
    $PyExe = $PortablePy
    if (-not $SilentMode) { Write-Host "`n  Mode: Full (portable)" -ForegroundColor Green }
} elseif (Test-Path $PortablePy) {
    # python_embeded only, no venv and no node_embeded - treat as portable
    $Mode = "portable"
    $PyExe = $PortablePy
    if (-not $SilentMode) { Write-Host "`n  Mode: Full (portable - no node_embeded)" -ForegroundColor Yellow }
} else {
    Write-Host "`n  [ERROR] No Python environment found!" -ForegroundColor Red
    Write-Host "  Run install.bat first." -ForegroundColor Yellow
    exit 1
}

# Git setup
$GitEmbedded = Join-Path $RootPath "git_embeded\cmd\git.exe"
if (Test-Path $GitEmbedded) {
    $GitExe = $GitEmbedded
    $env:PATH = "$(Split-Path $GitExe);$env:PATH"
} else {
    $GitExe = "git"
}

# Fix dubious ownership errors (local config only - never modify user's global gitconfig)
$env:GIT_CONFIG_GLOBAL = Join-Path $RootPath ".gitconfig"
& $GitExe config --file "$env:GIT_CONFIG_GLOBAL" --add safe.directory '*' 2>$null

if (-not (Test-Path $ComfyDir)) {
    Write-Host "`n  [ERROR] ComfyUI directory not found!" -ForegroundColor Red
    Write-Host "  Run install.bat first." -ForegroundColor Yellow
    exit 1
}

# ============================================================================
# 0. UPDATE COMFYUI CORE
# ============================================================================
Write-Host "`n[0/3] Updating ComfyUI core..." -ForegroundColor Yellow
try {
    Set-Location $ComfyDir
    $ErrorActionPreference = "Continue"
    # ComfyUI is installed at a pinned commit (detached HEAD), so we can't
    # just `git pull`. Fetch latest master and reset hard to it instead.
    & $GitExe fetch origin master 2>&1 | Out-Null
    & $GitExe checkout master 2>&1 | Out-Null
    & $GitExe reset --hard origin/master 2>&1 | Out-Null
    $ErrorActionPreference = "Stop"
    Set-Location $RootPath
    Write-Host "  ComfyUI core updated to latest master." -ForegroundColor Green
} catch {
    Set-Location $RootPath
    Write-Host "  [WARNING] ComfyUI core update failed (non-fatal): $_" -ForegroundColor Yellow
}

# ============================================================================
# 1. CUSTOM NODES - install missing / update existing (from nodes.json)
# ============================================================================
$NodesConfigFile = Join-Path $RootPath "config\nodes.json"
if (-not (Test-Path $NodesConfigFile)) {
    Write-Host "  [ERROR] config/nodes.json not found!" -ForegroundColor Red
    exit 1
}

$ModuleNodeScript = Join-Path $RootPath "scripts\module_nodes.ps1"
if (Test-Path $ModuleNodeScript) {
    . $ModuleNodeScript
    $NodesConfig = Get-FeddaNodeConfig -RootPath $RootPath -Logger { param($Message, $Color) Write-Host "  $Message" -ForegroundColor $Color }
} else {
    Write-Host "  [WARNING] Module node helper missing; using config/nodes.json directly." -ForegroundColor Yellow
    $NodesConfig = Get-Content $NodesConfigFile -Raw | ConvertFrom-Json
}

if (-not (Test-Path $CustomNodesDir)) {
    New-Item -ItemType Directory -Path $CustomNodesDir -Force | Out-Null
}

# Smart update: only git-pull existing nodes once per week
$NodeUpdateMarker = Join-Path $RootPath ".last_node_update"
$NeedNodeUpdate = $true

if (Test-Path $NodeUpdateMarker) {
    $LastUpdate = (Get-Item $NodeUpdateMarker).LastWriteTime
    $DaysSince = ((Get-Date) - $LastUpdate).TotalDays
    if ($DaysSince -lt 7) {
        $NeedNodeUpdate = $false
        $DaysLeft = [math]::Ceiling(7 - $DaysSince)
        Write-Host "`n[1/3] Custom nodes up to date (next check in ${DaysLeft}d)" -ForegroundColor Green
    }
}

$InstalledCount = 0
$UpdatedCount = 0
$SkippedCount = 0
$FailedCount = 0

function Sync-NodeSubmodules {
    param([string]$NodeDir)
    $GitmodulesFile = Join-Path $NodeDir ".gitmodules"
    if (Test-Path $GitmodulesFile) {
        try {
            Set-Location $NodeDir
            $ErrorActionPreference = "Continue"
            & $GitExe submodule update --init --recursive 2>&1 | Out-Null
            $ErrorActionPreference = "Stop"
            Set-Location $RootPath
        } catch {
            Set-Location $RootPath
        }
    }
}

# Always check for missing nodes
$HasMissing = $false
foreach ($Node in $NodesConfig) {
    if ($Node.local -eq $true) { continue }
    $NodeDir_Check = Join-Path $CustomNodesDir $Node.folder
    if (-not (Test-Path $NodeDir_Check)) { $HasMissing = $true; break }
}

# Always force-update nodes that ship new model architectures regularly
$CriticalNodes = @("ComfyUI-LTXVideo", "RES4LYF", "ComfyUI-KJNodes")
foreach ($CritNode in $CriticalNodes) {
    $CritDir = Join-Path $CustomNodesDir $CritNode
    if (Test-Path $CritDir) {
        try {
            Set-Location $CritDir
            $ErrorActionPreference = "Continue"
            & $GitExe pull 2>&1 | Out-Null
            $ErrorActionPreference = "Stop"
            Set-Location $RootPath
            Sync-NodeSubmodules -NodeDir $CritDir
        } catch {
            Set-Location $RootPath
        }
    }
}

if ($NeedNodeUpdate -or $HasMissing) {
    if ($NeedNodeUpdate) {
        Write-Host "`n[1/3] Syncing custom nodes from config/nodes.json..." -ForegroundColor Yellow
    } else {
        Write-Host "`n[1/3] Installing missing custom nodes..." -ForegroundColor Yellow
    }

    foreach ($Node in $NodesConfig) {
        if ($Node.local -eq $true) {
            Write-Host "  [$($Node.name)] Local node - skipped" -ForegroundColor Gray
            continue
        }

        $NodeDir_Install = Join-Path $CustomNodesDir $Node.folder

        if (-not (Test-Path $NodeDir_Install)) {
            # Clone missing node. Vendored copy wins: some nodes have no reliable
            # upstream (naked folders, purged repos), so the repo ships the code.
            $VendorDir = Join-Path $RootPath "vendor\custom_nodes\$($Node.folder)"
            if (Test-Path $VendorDir) {
                Write-Host "  [$($Node.name)] Installing from vendored copy..." -ForegroundColor White
                Copy-Item -Recurse -Force $VendorDir $NodeDir_Install
                $InstalledCount++
                Write-Host "  [$($Node.name)] Installed OK (vendored)" -ForegroundColor Green
                $ReqFile = Join-Path $NodeDir_Install "requirements.txt"
                if (Test-Path $ReqFile) { & $PyExe -m pip install -r "$ReqFile" --no-warn-script-location --quiet 2>&1 | Out-Null }
                continue
            }
            Write-Host "  [$($Node.name)] Installing..." -ForegroundColor White
            try {
                $ErrorActionPreference = "Continue"
                & $GitExe clone --depth 1 $Node.url "$NodeDir_Install" 2>&1 | Out-Null
                $ErrorActionPreference = "Stop"
                if ($LASTEXITCODE -eq 0) {
                    $InstalledCount++
                    Write-Host "  [$($Node.name)] Installed OK" -ForegroundColor Green
                    Sync-NodeSubmodules -NodeDir $NodeDir_Install

                    $ReqFile = Join-Path $NodeDir_Install "requirements.txt"
                    if (Test-Path $ReqFile) {
                        Write-Host "  [$($Node.name)] Installing dependencies..." -ForegroundColor Gray
                        Write-Host "    (this can take a LONG time for heavy nodes like LayerStyle_Advance - mediapipe, onnxruntime, transformers etc.)" -ForegroundColor DarkGray
                        $SkipPkgs = @('^\s*insightface','^\s*byaldi','^\s*nano-graphrag','^\s*kaleido','^\s*qwen-vl-utils','^\s*fastparquet','^\s*llama-cpp-python','^\s*llama_cpp_python')
                        $ReqContent = Get-Content $ReqFile
                        $Filtered = $ReqContent
                        foreach ($p in $SkipPkgs) { $Filtered = $Filtered | Where-Object { $_ -notmatch $p } }
                        $TmpReq = Join-Path $NodeDir_Install "_req_filtered.txt"
                        Set-Content -Path $TmpReq -Value $Filtered
                        $ErrorActionPreference = "Continue"
                        Invoke-Pip -PyExe $PyExe -PipArgs @("-m","pip","install","-r","$TmpReq","--no-warn-script-location")
                        $ErrorActionPreference = "Stop"
                        Remove-Item $TmpReq -Force -ErrorAction SilentlyContinue
                    }

                    Invoke-NodeDependencyRepair -NodeDir $NodeDir_Install -NodeName $Node.name -PyExe $PyExe
                } else {
                    Write-Host "  [$($Node.name)] Clone failed!" -ForegroundColor Red
                    $FailedCount++
                }
            }
            catch {
                Write-Host "  [$($Node.name)] Error: $_" -ForegroundColor Red
                $FailedCount++
            }
        }
        elseif ($NeedNodeUpdate) {
            # Update existing node
            Write-Host "  [$($Node.name)] Updating..." -ForegroundColor Gray
            try {
                Set-Location $NodeDir_Install
                & $GitExe pull 2>&1 | Out-Null
                if ($LASTEXITCODE -ne 0) {
                    Write-Host "  [$($Node.name)] Git pull failed (non-fatal)" -ForegroundColor Yellow
                }
                $UpdatedCount++
                Set-Location $RootPath
                Sync-NodeSubmodules -NodeDir $NodeDir_Install
            }
            catch {
                Write-Host "  [$($Node.name)] Update failed (non-fatal): $_" -ForegroundColor Yellow
                Set-Location $RootPath
            }

            # Hardcoded list of nodes whose pip re-check on update is extremely slow
            # (torch/transformers already installed via ComfyUI — re-resolving costs minutes for nothing)
            $HeavyNodes = @('ComfyUI_LayerStyle', 'ComfyUI_LayerStyle_Advance', 'ComfyUI-Impact-Pack', 'ComfyUI-Impact-Subpack', 'comfy_mtb')
            $skipDeps = ($Node.skip_req_update -eq $true) -or ($HeavyNodes -contains $Node.folder)

            $ReqFile = Join-Path $NodeDir_Install "requirements.txt"
            if ((Test-Path $ReqFile) -and (-not $skipDeps)) {
                Write-Host ("  [{0}] dependencies . . . " -f $Node.name) -NoNewline -ForegroundColor Gray
                $SkipPkgs = @('^\s*insightface','^\s*byaldi','^\s*nano-graphrag','^\s*kaleido','^\s*qwen-vl-utils','^\s*fastparquet')
                $ReqContent = Get-Content $ReqFile
                $Filtered = $ReqContent
                foreach ($p in $SkipPkgs) { $Filtered = $Filtered | Where-Object { $_ -notmatch $p } }
                $TmpReq = Join-Path $NodeDir_Install "_req_filtered.txt"
                Set-Content -Path $TmpReq -Value $Filtered
                $ErrorActionPreference = "Continue"
                $PipCode = Invoke-Pip -PyExe $PyExe -Label $Node.name `
                    -PipArgs @("-m","pip","install","-q","-r","$TmpReq","--no-warn-script-location")
                $ErrorActionPreference = "Stop"
                if ($PipCode -eq 0) {
                    Write-Host "OK" -ForegroundColor DarkGray
                } else {
                    Write-Host "FAILED - see logs\update_pip.log" -ForegroundColor Yellow
                    $script:PipFailures += $Node.name
                }
                Remove-Item $TmpReq -Force -ErrorAction SilentlyContinue
            } elseif ($skipDeps) {
                Write-Host "  [$($Node.name)] Deps skipped (heavy node - already satisfied)" -ForegroundColor DarkGray
            }

            # Skipped for heavy nodes, whose deps are already satisfied.
            if (-not $skipDeps) {
                Invoke-NodeDependencyRepair -NodeDir $NodeDir_Install -NodeName $Node.name -PyExe $PyExe
            }
        }
        else {
            $SkippedCount++
        }
    }

    if ($NeedNodeUpdate) {
        "Updated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" | Out-File $NodeUpdateMarker -Force
    }

    $Parts = @()
    if ($InstalledCount -gt 0) { $Parts += "$InstalledCount installed" }
    if ($UpdatedCount -gt 0)  { $Parts += "$UpdatedCount updated" }
    if ($SkippedCount -gt 0)  { $Parts += "$SkippedCount up to date" }
    if ($FailedCount -gt 0)   { $Parts += "$FailedCount failed" }
    Write-Host "`n  Summary: $($Parts -join ', ')" -ForegroundColor Cyan
}

$WanAnimatePatch = Join-Path $RootPath "scripts\patch_wan_animate_preprocess.ps1"
if (Test-Path $WanAnimatePatch) {
    Write-Host "  Applying WanAnimate preprocess compatibility patch..." -ForegroundColor Gray
    & powershell -ExecutionPolicy Bypass -File "$WanAnimatePatch" -RootPath "$RootPath"
}

$LtxVideoPatch = Join-Path $RootPath "scripts\patch_ltxvideo_kornia.ps1"
if (Test-Path $LtxVideoPatch) {
    Write-Host "  Applying LTXVideo Kornia compatibility patch..." -ForegroundColor Gray
    & powershell -ExecutionPolicy Bypass -File "$LtxVideoPatch" -RootPath "$RootPath"
}

$KJNodesPatch = Join-Path $RootPath "scripts\patch_kjnodes_ltx_audio_vae.ps1"
if (Test-Path $KJNodesPatch) {
    Write-Host "  Applying KJNodes LTX audio VAE compatibility patch..." -ForegroundColor Gray
    & powershell -ExecutionPolicy Bypass -File "$KJNodesPatch" -RootPath "$RootPath"
}

$HFRetryPatch = Join-Path $RootPath "scripts\patch_hfdownloader_retry.ps1"
if (Test-Path $HFRetryPatch) {
    Write-Host "  Applying HuggingFace downloader resume-on-drop patch..." -ForegroundColor Gray
    & powershell -ExecutionPolicy Bypass -File "$HFRetryPatch" -RootPath "$RootPath"
}

# ============================================================================
# 1b. PATCH PYTHON DEPENDENCIES - fix known version conflicts
# ============================================================================
Write-Host "`n[1b/3] Patching Python dependencies..." -ForegroundColor Yellow

# ComfyUI pins a handful of packages with == because its own code calls into
# them by exact signature. comfy-kitchen is the one that bites: core called
# rms_rope_split_half_(..., rot_dim=...) against an installed build that had no
# such parameter, and every MiniMax run died on a TypeError that named neither
# ComfyUI nor pip.
#
# Only the == lines are synced. The >= and bare entries are left alone on
# purpose - torch and transformers live there, and dragging those along turns a
# version fix into a torch generation swap nobody asked for.
$ComfyReq = Join-Path (Join-Path $RootPath "ComfyUI") "requirements.txt"
if (Test-Path $ComfyReq) {
    $Pinned = Get-Content $ComfyReq | Where-Object { $_ -match '^[A-Za-z0-9._-]+==' } | ForEach-Object { $_.Trim() }
    $Stale = @()
    foreach ($Pin in $Pinned) {
        $Name, $Want = $Pin -split '==', 2
        $Have = & $PyExe -c "import importlib.metadata as m; print(m.version('$Name'))" 2>$null
        if ($LASTEXITCODE -ne 0 -or -not $Have) { $Stale += $Pin; continue }
        if ($Have.Trim() -ne $Want.Trim()) { $Stale += $Pin }
    }
    if ($Stale.Count -gt 0) {
        Write-Host "  Syncing $($Stale.Count) pinned ComfyUI dependencies..." -ForegroundColor White
        foreach ($Pin in $Stale) { Write-Host "    $Pin" -ForegroundColor DarkGray }

        # What is being replaced, so it can be put back. A pin is only an
        # improvement if ComfyUI still starts afterwards, and one of these
        # already did not: master pins comfy-kitchen 0.2.31, which types a
        # custom op `list[int]`, and torch 2.6 rejects PEP 585 generics - so
        # `import comfy.utils` failed outright where 0.2.26 had imported with
        # fp8 and fp4 turned off. A missing feature beats a dead install.
        $Previous = @{}
        foreach ($Pin in $Stale) {
            $Name = ($Pin -split '==', 2)[0]
            $Was = & $PyExe -c "import importlib.metadata as m; print(m.version('$Name'))" 2>$null
            if ($LASTEXITCODE -eq 0 -and $Was) { $Previous[$Name] = $Was.Trim() }
        }

        Invoke-Pip -PyExe $PyExe -Label "ComfyUI pins" `
            -PipArgs (@("-m","pip","install","--no-input","--no-warn-script-location") + $Stale) | Out-Null

        # Ask ComfyUI itself. Nothing here knows which package is risky; any
        # pin that cannot run on the installed torch fails the same check.
        $ComfyDirCheck = Join-Path $RootPath "ComfyUI"
        & $PyExe -c "import sys; sys.path.insert(0, r'$ComfyDirCheck'); import comfy.utils" 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  ComfyUI pins synced OK" -ForegroundColor Green
        } else {
            Write-Host "  [WARN] ComfyUI could not start with the new pins - putting them back." -ForegroundColor Yellow
            $Restore = @()
            foreach ($Name in $Previous.Keys) { $Restore += "$Name==$($Previous[$Name])" }
            if ($Restore.Count -gt 0) {
                foreach ($R in $Restore) { Write-Host "    $R" -ForegroundColor DarkGray }
                Invoke-Pip -PyExe $PyExe -Label "ComfyUI pin rollback" `
                    -PipArgs (@("-m","pip","install","--no-input","--no-warn-script-location") + $Restore) | Out-Null
                & $PyExe -c "import sys; sys.path.insert(0, r'$ComfyDirCheck'); import comfy.utils" 2>$null | Out-Null
                if ($LASTEXITCODE -eq 0) {
                    Write-Host "  Restored. ComfyUI starts; a feature the new pin adds is unavailable." -ForegroundColor Yellow
                } else {
                    Write-Host "  [WARN] Still failing after restore - see logs\update_pip.log." -ForegroundColor Red
                }
            } else {
                Write-Host "  [WARN] Nothing recorded to restore - see logs\update_pip.log." -ForegroundColor Red
            }
        }
    } else {
        Write-Host "  ComfyUI pinned dependencies OK" -ForegroundColor Green
    }
}

# Florence2 requires transformers >= 4.45 for is_flash_attn_greater_or_equal_2_10
$TransformersVersion = & $PyExe -c "import transformers; print(transformers.__version__)" 2>$null
$NeedsTransformersUpgrade = $true
if ($TransformersVersion -match '^(\d+)\.(\d+)') {
    $Major = [int]$Matches[1]; $Minor = [int]$Matches[2]
    if ($Major -gt 4 -or ($Major -eq 4 -and $Minor -ge 45)) { $NeedsTransformersUpgrade = $false }
}
if ($NeedsTransformersUpgrade) {
    Write-Host "  Upgrading transformers (Florence2 fix)..." -ForegroundColor White
    Write-Host "    (may take a minute)" -ForegroundColor DarkGray
    & $PyExe -m pip install --upgrade transformers --no-warn-script-location 2>&1
    Write-Host "  transformers upgraded OK" -ForegroundColor Green
} else {
    Write-Host "  transformers OK ($TransformersVersion)" -ForegroundColor Green
}

# llama-cpp-python for Searge LLM - prebuilt wheel (source build needs MSVC).
& $PyExe -c "import llama_cpp" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "  Installing llama-cpp-python (prebuilt, for Searge LLM)..." -ForegroundColor White
    & $PyExe -m pip install llama-cpp-python --prefer-binary --extra-index-url https://abetlen.github.io/llama-cpp-python/whl/cpu --no-warn-script-location 2>&1
    Write-Host "  llama-cpp-python installed OK" -ForegroundColor Green
} else {
    Write-Host "  llama-cpp-python OK" -ForegroundColor Green
}

# Chatterbox TTS (natural voice engine). --no-deps on purpose: its pins would
# downgrade transformers/numpy/diffusers/starlette. setuptools<81 for pkg_resources.
& $PyExe -c "import chatterbox, pyloudnorm" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "  Installing Chatterbox TTS (natural voice engine)..." -ForegroundColor White
    & $PyExe -m pip install --no-deps chatterbox-tts --no-warn-script-location 2>&1
    & $PyExe -m pip install conformer s3tokenizer resemble-perth pydub pyloudnorm --no-warn-script-location 2>&1
    & $PyExe -m pip install "setuptools==80.9.0" --no-warn-script-location 2>&1
    Write-Host "  Chatterbox TTS installed OK" -ForegroundColor Green
} else {
    Write-Host "  Chatterbox TTS OK" -ForegroundColor Green
}

# ============================================================================
# 2. FRONTEND - npm install
# ============================================================================
Write-Host "`n[2/3] Updating frontend dependencies..." -ForegroundColor Yellow
$FrontendDir = Join-Path $RootPath "frontend"

if (Test-Path $FrontendDir) {
    Set-Location $FrontendDir

    if ($Mode -eq "portable") {
        $NodeExeDir = Join-Path $RootPath "node_embeded"
        # Ensure npm shims exist
        if (Test-Path $NodeExeDir) {
            $NpmShim = Join-Path $NodeExeDir "node_modules\npm\bin\npm.cmd"
            $NpxShim = Join-Path $NodeExeDir "node_modules\npm\bin\npx.cmd"
            if (Test-Path $NpmShim) { Copy-Item $NpmShim $NodeExeDir -Force }
            if (Test-Path $NpxShim) { Copy-Item $NpxShim $NodeExeDir -Force }
        }
        $NpmCmd = Join-Path $NodeExeDir "npm.cmd"
        if (Test-Path $NpmCmd) {
            Write-Host "    (npm install in progress - can take a few minutes)" -ForegroundColor DarkGray
            & "$NpmCmd" "install" 2>&1
            Write-Host "  Frontend dependencies updated." -ForegroundColor Green
        }
        else {
            $NodeExe = Join-Path $NodeExeDir "node.exe"
            $NpmCli = Join-Path $NodeExeDir "node_modules\npm\bin\npm-cli.js"
            if (Test-Path $NpmCli) {
                Write-Host "    (npm install in progress - can take a few minutes)" -ForegroundColor DarkGray
                & "$NodeExe" "$NpmCli" "install" 2>&1
                Write-Host "  Frontend dependencies updated." -ForegroundColor Green
            }
            else {
                Write-Host "  [WARNING] npm not found - run install.bat first" -ForegroundColor Yellow
            }
        }
    } else {
        # Lite mode - use system npm
        Write-Host "    (npm install in progress - can take a few minutes)" -ForegroundColor DarkGray
        & npm install 2>&1
        Write-Host "  Frontend dependencies updated." -ForegroundColor Green
    }

    Set-Location $RootPath
}

# ============================================================================
# 3. SYNC COMFYUI REQUIREMENTS
# ============================================================================

# Ensure required ComfyUI core dependencies are in sync after ComfyUI updates
Write-Host "`n[2a/3] Syncing ComfyUI requirements..." -ForegroundColor Yellow
$ComfyRequirements = Join-Path $ComfyDir "requirements.txt"
if (Test-Path $ComfyRequirements) {
    try {
        Write-Host "    (syncing ComfyUI requirements - may take a minute)" -ForegroundColor DarkGray
        & $PyExe -m pip install -r "$ComfyRequirements" --no-warn-script-location 2>&1
        Write-Host "  ComfyUI requirements synced." -ForegroundColor Green
    } catch {
        Write-Host "  [WARNING] ComfyUI requirements sync failed (non-fatal): $_" -ForegroundColor Yellow
    }
}

# Ensure backend voice fallback dependency exists after update
try {
    Write-Host "    (installing edge-tts fallback)" -ForegroundColor DarkGray
    & $PyExe -m pip install edge-tts --no-warn-script-location 2>&1
    Write-Host "  edge-tts synced." -ForegroundColor Green
} catch {
    Write-Host "  [WARNING] edge-tts sync failed (non-fatal): $_" -ForegroundColor Yellow
}

# Keep Comfy preview defaults enabled for end users.
Write-Host "`n[2b/3] Applying Comfy preview defaults..." -ForegroundColor Yellow
$PreviewSetupScript = Join-Path $RootPath "scripts\setup_comfyui_config.py"
if (Test-Path $PreviewSetupScript) {
    try {
        & $PyExe "$PreviewSetupScript" 2>&1 | Out-Null
        Write-Host "  Preview defaults applied (Execution=auto, VHS=Always)." -ForegroundColor Green
    } catch {
        Write-Host "  [WARNING] Preview defaults update failed (non-fatal): $_" -ForegroundColor Yellow
    }
} else {
    Write-Host "  [WARNING] setup_comfyui_config.py not found, skipping preview defaults." -ForegroundColor Yellow
}

# Z-Image core models are NOT auto-downloaded (even on update).
# They will be downloaded by ComfyUI when a user actually runs a Z-Image workflow.
# (Removed per requirement - no auto model downloads in installer or update)


# ============================================================================
# DONE
# ============================================================================
if (-not $FeddaTranscriptOwner) {
    if ($script:PipFailures.Count -gt 0) {
        Write-Host ""
        Write-Host "  These nodes had dependency problems:" -ForegroundColor Yellow
        foreach ($f in ($script:PipFailures | Sort-Object -Unique)) {
            Write-Host "    - $f" -ForegroundColor Yellow
        }
        Write-Host "  Full output: logs\update_pip.log" -ForegroundColor DarkGray
        Write-Host "  FEDDA still runs; the nodes above may be missing a feature." -ForegroundColor DarkGray
        Write-Host ""
    }
    try { Stop-Transcript | Out-Null } catch {}
}

if (-not $SilentMode) {
    Write-Host "`n===================================================" -ForegroundColor Green
    Write-Host "   UPDATE COMPLETE" -ForegroundColor Green
    Write-Host "===================================================" -ForegroundColor Green
    Write-Host "Run RUN.bat to start FEDDA."
}
