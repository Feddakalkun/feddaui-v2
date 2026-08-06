param(
    [string]$RootPath = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
)

# Removes the LTX audio VAE special case from KJNodes' VAELoaderKJ.
#
# HISTORY, because this has flip-flopped and the reasoning matters more than
# the code:
#
#   v1/v2 - deleted the special case, assuming core handled LTX audio VAEs.
#   v3    - restored it, because at the time core genuinely did not: the LTX-2.3
#           audio VAE keys (vocoder.vocoder.* / audio_vae.*) matched no branch
#           in comfy/sd.py, so core returned an empty VAE.
#   v4    - deletes it again, and this time core really does handle it.
#
# What makes v4 different from v2 is that it is checked rather than assumed.
# comfy/sd.py now carries the branch:
#
#     elif "vocoder.resblocks.0.convs1.0.weight" in sd
#          or "vocoder.vocoder.resblocks.0.convs1.0.weight" in sd:   # LTX Audio
#         sd = comfy.utils.state_dict_prefix_replace(sd, {"audio_vae.": "autoencoder."})
#         self.first_stage_model = comfy.ldm.lightricks.vae.audio_vae.AudioVAE(metadata=metadata)
#
# - the same key test v3 used, plus a prefix remap v3 never did.
#
# The patch is now actively harmful, not merely redundant: AudioVAE's
# constructor changed to take metadata alone, so v3's AudioVAE(sd, metadata)
# raises "TypeError: takes 2 positional arguments but 3 were given" on every
# audio run. Falling through to VAE() is both correct and less to carry.
#
# If LTX audio ever breaks again, check comfy/sd.py for that branch BEFORE
# reintroducing a special case here. That check is the whole lesson.

$NodeFile = Join-Path $RootPath "ComfyUI\custom_nodes\ComfyUI-KJNodes\nodes\nodes.py"
if (-not (Test-Path $NodeFile)) {
    Write-Host "  [KJNodes] nodes.py not found, patch skipped." -ForegroundColor Yellow
    exit 0
}

$Content = Get-Content -LiteralPath $NodeFile -Raw

$Note = @'
        # FEDDA v4: the LTX audio VAE special case that used to live here is
        # gone. Core ComfyUI dispatches these natively now (comfy/sd.py keys on
        # the vocoder weights and remaps audio_vae.* to autoencoder.*), and
        # AudioVAE's constructor takes metadata alone, so the old
        # AudioVAE(sd, metadata) call raised TypeError on every audio run.
        vae = VAE(sd=sd, device=device, dtype=dtype, metadata=metadata)
'@ -replace "`r`n", "`n"

# The v3 block: comment header through the explicit AudioVAE dispatch, up to
# and including the VAE() line that followed it.
#
# \r?\n and a leading [ \t]* throughout: the vendored file ships CRLF, and an
# LF-only pattern matched nothing while the script cheerfully reported an
# "unrecognised patch state" - which looked like a new problem rather than a
# broken regex.
$V3Pattern = '(?s)[ \t]*# FEDDA patch v3:.*?\r?\n[ \t]*vae = VAE\(sd=sd, device=device, dtype=dtype, metadata=metadata\)\r?\n'

if ($Content -match $V3Pattern) {
    $Content = [regex]::Replace($Content, $V3Pattern, ($Note + "`n"), 1)
    Set-Content -LiteralPath $NodeFile -Value $Content -NoNewline -Encoding UTF8
    Write-Host "  [KJNodes] Removed the LTX audio VAE patch (v3 -> v4, core handles it)." -ForegroundColor Green
    exit 0
}

if ($Content -match 'FEDDA v4') {
    Write-Host "  [KJNodes] LTX audio VAE already on v4 (no patch)." -ForegroundColor Gray
    exit 0
}

# A stock file with no FEDDA patch of any kind is already what v4 wants.
if ($Content -notmatch 'FEDDA') {
    Write-Host "  [KJNodes] Stock nodes.py - nothing to remove." -ForegroundColor Gray
    exit 0
}

Write-Host "  [KJNodes] Unrecognised FEDDA patch state - left untouched." -ForegroundColor Yellow
