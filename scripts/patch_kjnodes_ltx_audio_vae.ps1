param(
    [string]$RootPath = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
)

# KJNodes' VAELoaderKJ builds a generic core VAE for every file. That works for
# the LTX *video* VAE (comfy/sd.py has a lightricks branch keyed on
# "decoder.up_blocks.0.res_blocks.0.conv1.conv.weight") but NOT for the LTX-2.3
# *audio* VAE: its keys are vocoder.vocoder.* / audio_vae.*, which match no
# branch in sd.py at all (core only detects Ace Step and MMAudio audio VAEs).
# Core then returns an empty VAE -> "WARNING: No VAE weights detected" ->
# "RuntimeError: ERROR: VAE is invalid: None", and the whole LTX graph dies.
#
# HISTORY - do not regress this again: patch v2 assumed core had gained native
# LTX-audio dispatch and deleted the special-case entirely. It had not. That
# assumption is what made this bug reappear after every install/update, since
# the installer re-applies these patches every time.
#
# v3 restores explicit dispatch: detect the LTX audio VAE by its vocoder keys
# and load it with LTX's own AudioVAE class, which takes (sd, metadata) and
# does no key-sniffing. Verified against LTX23_audio_vae_bf16.safetensors.

$NodeFile = Join-Path $RootPath "ComfyUI\custom_nodes\ComfyUI-KJNodes\nodes\nodes.py"
if (-not (Test-Path $NodeFile)) {
    Write-Host "  [KJNodes] nodes.py not found, patch skipped." -ForegroundColor Yellow
    exit 0
}

$Content = Get-Content -LiteralPath $NodeFile -Raw

$New = @'
        # FEDDA patch v3: v2 assumed core ComfyUI dispatches LTX audio VAEs
        # natively. It does NOT - comfy/sd.py only detects Ace Step and MMAudio
        # audio VAEs, and the LTX-2.3 audio VAE (keys: vocoder.vocoder.* /
        # audio_vae.*) matches no branch at all, so core returns an empty VAE
        # -> "No VAE weights detected" -> "VAE is invalid: None".
        # Load it with LTX's own AudioVAE class instead, which takes (sd, metadata).
        if "vocoder.resblocks.0.convs1.0.weight" in sd or "vocoder.vocoder.resblocks.0.convs1.0.weight" in sd:
            from comfy.ldm.lightricks.vae.audio_vae import AudioVAE
            return (AudioVAE(sd, metadata),)
        vae = VAE(sd=sd, device=device, dtype=dtype, metadata=metadata)
        if hasattr(vae, "throw_exception_if_invalid"):
            vae.throw_exception_if_invalid()
'@

if ($Content.Contains("FEDDA patch v3:")) {
    Write-Host "  [KJNodes] LTX audio VAE compatibility patch (v3) already applied." -ForegroundColor Green
    exit 0
}

# Upgrade path: replace the broken v2 block (core-native dispatch) with v3.
$V2Pattern = '(?s)        # FEDDA patch v2: core ComfyUI VAE\(\) detects LTX audio VAEs natively now\..*?vae\.throw_exception_if_invalid\(\)'
if ([regex]::IsMatch($Content, $V2Pattern)) {
    $Content = [regex]::Replace($Content, $V2Pattern, [System.Text.RegularExpressions.MatchEvaluator]{ param($m) $New }, 1)
    Set-Content -LiteralPath $NodeFile -Value $Content -Encoding UTF8
    Write-Host "  [KJNodes] Upgraded LTX audio VAE patch v2 -> v3 (explicit AudioVAE dispatch)." -ForegroundColor Green
    exit 0
}

# Upgrade path: replace the v1 FEDDA patch block if present.
$V1Pattern = '(?s)        # FEDDA patch: core ComfyUI VAE\(\) detects LTX audio VAEs natively now\.\s*\n        vae = VAE\(sd=sd, device=device, dtype=dtype, metadata=metadata\)\s*\n        if hasattr\(vae, "throw_exception_if_invalid"\):\s*\n            vae\.throw_exception_if_invalid\(\)'
if ([regex]::IsMatch($Content, $V1Pattern)) {
    $Content = [regex]::Replace($Content, $V1Pattern, [System.Text.RegularExpressions.MatchEvaluator]{ param($m) $New }, 1)
    Set-Content -LiteralPath $NodeFile -Value $Content -Encoding UTF8
    Write-Host "  [KJNodes] Upgraded LTX audio VAE patch v1 -> v3 (explicit AudioVAE dispatch)." -ForegroundColor Green
    exit 0
}

# Match from the is_audio_vae detection block through the invalid-check line,
# covering both the upstream original and the old v22 FEDDA patch shape.
$Pattern = '(?s)        is_audio_vae = \(.*?\)\s*\n        if is_audio_vae:.*?(?:vae\.throw_exception_if_invalid\(\)|            vae\.throw_exception_if_invalid\(\))'

if (-not [regex]::IsMatch($Content, $Pattern)) {
    Write-Host "  [KJNodes] Audio VAE special-case block not found (may already be fixed upstream), patch skipped." -ForegroundColor Yellow
    exit 0
}

$Content = [regex]::Replace($Content, $Pattern, [System.Text.RegularExpressions.MatchEvaluator]{ param($m) $New }, 1)
Set-Content -LiteralPath $NodeFile -Value $Content -Encoding UTF8
Write-Host "  [KJNodes] Applied LTX audio VAE compatibility patch v3 (explicit AudioVAE dispatch)." -ForegroundColor Green
