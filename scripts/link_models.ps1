# Point FEDDA at a model folder you already have, without moving anything.
#
# Not symlinks. The obvious approach - junction each ComfyUI model folder to
# the matching folder elsewhere - cannot work on an install that has already
# downloaded models: a junction needs its target not to exist, and
# diffusion_models, loras and vae all have files in them. Per-file symlinks
# get around that but need Developer Mode or an elevated prompt on Windows,
# which is a bad thing to require of a double-click.
#
# ComfyUI has the feature built in. extra_model_paths.yaml *adds* search
# locations rather than replacing them, so both folders stay live, nothing
# moves, no privileges are needed, and undoing it means deleting one file.
#
# It also fixes something links never could: a donor install often files
# models under different names than ComfyUI expects - E:\Comfyuistudio keeps
# its text encoder, VAE and LoRAs under checkpoints\ - so each category is
# given every plausible source folder rather than one.

$ErrorActionPreference = "Stop"

$AppDir    = Split-Path -Parent $PSScriptRoot
$ComfyDir  = Join-Path $AppDir "ComfyUI"
$YamlPath  = Join-Path $ComfyDir "extra_model_paths.yaml"

# ComfyUI category -> folder names worth looking for under the donor's models
# directory. checkpoints appears in several on purpose: that is where a lot of
# installs dump everything, and listing a folder that holds nothing relevant
# costs nothing.
$Categories = [ordered]@{
    "checkpoints"     = @("checkpoints")
    "diffusion_models"= @("diffusion_models", "unet", "checkpoints")
    "text_encoders"   = @("text_encoders", "clip", "checkpoints")
    "clip_vision"     = @("clip_vision")
    "vae"             = @("vae", "vae_approx", "checkpoints")
    # checkpoints is here for the same reason as above, and for a specific
    # case: the donor keeps lightx2v_I2V_14B_480p, a LoRA, in checkpoints\.
    "loras"           = @("loras", "lora", "checkpoints")
    "controlnet"      = @("controlnet")
    "upscale_models"  = @("upscale_models", "ESRGAN")
    "embeddings"      = @("embeddings")
    "style_models"    = @("style_models")
}

Write-Host ""
Write-Host "  FEDDA - use models you already have" -ForegroundColor Cyan
Write-Host "  ----------------------------------" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  Nothing is copied and nothing is moved. FEDDA is simply told to" -ForegroundColor Gray
Write-Host "  look in your folder as well as its own." -ForegroundColor Gray
Write-Host ""

if (-not (Test-Path $ComfyDir)) {
    Write-Host "  ComfyUI not found at $ComfyDir" -ForegroundColor Red
    Write-Host "  Run the FEDDA installer first." -ForegroundColor Yellow
    Read-Host "`n  Press Enter to close"
    exit 1
}

$Input = Read-Host "  Path to your models folder (or the ComfyUI folder above it)"
$Input = $Input.Trim().Trim('"').TrimEnd('\')

if (-not $Input) { Write-Host "`n  Nothing entered." -ForegroundColor Yellow; Read-Host "  Press Enter to close"; exit 1 }
if (-not (Test-Path $Input)) {
    Write-Host "`n  No such folder: $Input" -ForegroundColor Red
    Read-Host "  Press Enter to close"
    exit 1
}

# Accept either the models folder or anything above it - people paste the
# ComfyUI root, or the install root, about as often as the models folder.
$ModelsDir = $Input
foreach ($candidate in @("models", "ComfyUI\models", "App\ComfyUI\models")) {
    $try = Join-Path $Input $candidate
    if (Test-Path $try) { $ModelsDir = $try; break }
}

$Resolved = (Resolve-Path $ModelsDir).Path
if ($Resolved -ieq (Resolve-Path (Join-Path $ComfyDir "models")).Path) {
    Write-Host "`n  That is FEDDA's own models folder - nothing to link." -ForegroundColor Yellow
    Read-Host "  Press Enter to close"
    exit 1
}

Write-Host ""
Write-Host "  Reading $Resolved" -ForegroundColor DarkGray
Write-Host ""

# Work out which categories actually have something behind them, and say what
# was found rather than asking the user to trust it.
$Lines  = @()
$Total  = 0
foreach ($category in $Categories.Keys) {
    $paths = @()
    foreach ($folder in $Categories[$category]) {
        $full = Join-Path $Resolved $folder
        if (-not (Test-Path $full)) { continue }
        $count = @(Get-ChildItem -Path $full -Recurse -File -Include *.safetensors,*.ckpt,*.pt,*.pth,*.bin,*.gguf -ErrorAction SilentlyContinue).Count
        if ($count -eq 0) { continue }
        $paths += $folder
        if ($Categories[$category][0] -eq $folder) {
            Write-Host ("    {0,-18} {1,4} files" -f $category, $count) -ForegroundColor Green
            $Total += $count
        }
    }
    if ($paths.Count -eq 0) { continue }
    if ($paths.Count -eq 1) {
        $Lines += "    {0}: {1}/" -f $category, $paths[0]
    } else {
        $Lines += "    {0}: |" -f $category
        foreach ($p in $paths) { $Lines += "         {0}/" -f $p }
    }
}

if ($Lines.Count -eq 0) {
    Write-Host "  Found no model files under that folder." -ForegroundColor Yellow
    Write-Host "  Expected subfolders like diffusion_models, loras or checkpoints." -ForegroundColor Gray
    Read-Host "`n  Press Enter to close"
    exit 1
}

if (Test-Path $YamlPath) {
    Write-Host ""
    Write-Host "  $YamlPath already exists." -ForegroundColor Yellow
    $answer = Read-Host "  Replace it? (y/N)"
    if ($answer -notmatch '^(y|yes)$') {
        Write-Host "`n  Left alone." -ForegroundColor Gray
        Read-Host "  Press Enter to close"
        exit 0
    }
    Copy-Item $YamlPath "$YamlPath.bak" -Force
    Write-Host "  Previous version kept as extra_model_paths.yaml.bak" -ForegroundColor DarkGray
}

$Yaml = @()
$Yaml += "# Written by link_models.bat. Delete this file to undo."
$Yaml += "# FEDDA's own models folder keeps working; these are searched as well."
$Yaml += ""
$Yaml += "external:"
$Yaml += "    base_path: $Resolved"
$Yaml += $Lines
$Yaml += ""

# WriteAllLines, not Set-Content: PowerShell 5.1's -Encoding utf8 emits a
# byte order mark, and a BOM on the first line of a YAML file is a silent
# way to have every one of these paths ignored.
[System.IO.File]::WriteAllLines($YamlPath, $Yaml, (New-Object System.Text.UTF8Encoding $false))

Write-Host ""
Write-Host "  Linked $Total model files." -ForegroundColor Green
Write-Host "  Wrote $YamlPath" -ForegroundColor Gray
Write-Host ""
Write-Host "  Restart FEDDA for it to take effect." -ForegroundColor Cyan
Write-Host "  To undo: delete that file." -ForegroundColor DarkGray
Write-Host ""
Read-Host "  Press Enter to close"
