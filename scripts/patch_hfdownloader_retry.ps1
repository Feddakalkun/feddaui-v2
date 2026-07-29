param(
    [string]$RootPath = ""
)

# ComfyUI-Studio-nodes' HuggingFaceDownloader has NO retry logic: one
# try/except around the whole transfer, and any failure marks the file failed.
# Multi-GB model pulls (10-20 GB) reliably die partway through with
#   Connection broken: IncompleteRead(N bytes read, M more expected)
# and the entire download is thrown away. The user then sees the downstream
# symptom instead of the cause:
#   "Value not in list: unet_name: '<model>.gguf' not in [...]"
#
# The worker already supports resume - it recomputes its offset from <file>.tmp
# and sends a Range header on entry - so simply re-entering it continues from
# the drop point. This patch renames the worker to _download_file_worker_once
# and adds a retry wrapper with exponential backoff around it.
#
# Applies to EVERY workflow, since they all download through this one node.

if ([string]::IsNullOrWhiteSpace($RootPath)) {
    $RootPath = Split-Path -Parent $PSScriptRoot
}
$RootPath = (Resolve-Path $RootPath).Path
$TargetFile = Join-Path $RootPath "ComfyUI\custom_nodes\ComfyUI-Studio-nodes\huggingfacedownloader.py"

if (-not (Test-Path $TargetFile)) {
    Write-Host "  [HFDownloader] huggingfacedownloader.py not found, patch skipped." -ForegroundColor Yellow
    exit 0
}

# Read/write as explicit UTF-8 WITHOUT BOM. Get-Content -Raw + Set-Content
# -Encoding UTF8 would decode this file as cp1252 and re-encode as UTF-8,
# double-encoding every non-ASCII char in it (the node prints checkmark/cross/
# arrow glyphs) and prepending a BOM. Round-trip must be byte-faithful.
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$Text = [System.IO.File]::ReadAllText($TargetFile, $Utf8NoBom)

if ($Text -match "FEDDA_HF_RETRY") {
    Write-Host "  [HFDownloader] resume-on-drop retry patch already applied." -ForegroundColor Green
    exit 0
}

$Needle = "    def download_file_worker(self, download_info, enable_notifications, max_speed_mbps, enable_resume, validate_files, hf_token):"
if (-not $Text.Contains($Needle)) {
    Write-Host "  [HFDownloader] download_file_worker signature not found, patch skipped." -ForegroundColor Yellow
    exit 0
}

$Wrapper = @'
    def download_file_worker(self, download_info, enable_notifications, max_speed_mbps, enable_resume, validate_files, hf_token):
        """FEDDA_HF_RETRY: resume across dropped connections instead of aborting.

        Multi-GB pulls reliably die with "Connection broken: IncompleteRead".
        The inner worker recomputes its resume offset from <file>.tmp and sends a
        Range header on entry, so re-entering it continues from the drop point.
        Without this a single blip discards the whole download.
        """
        url, filepath, key, folder, filename = download_info
        attempts = 8
        for attempt in range(1, attempts + 1):
            self._download_file_worker_once(download_info, enable_notifications, max_speed_mbps,
                                            enable_resume, validate_files, hf_token)
            status = (self.download_status.get(key) or {}).get("status")
            if status != "failed":
                return
            if self.check_interrupt() or not enable_resume:
                return
            if attempt >= attempts:
                break
            got = os.path.getsize(filepath + ".tmp") if os.path.exists(filepath + ".tmp") else 0
            wait = min(30, 2 ** attempt)
            print("[HF Downloader] %s: connection dropped at %.2f GB - resuming, retry %d/%d in %ds"
                  % (filename, got / (1024 ** 3), attempt, attempts - 1, wait))
            time.sleep(wait)
        print("[HF Downloader] %s: gave up after %d attempts" % (filename, attempts))

    def _download_file_worker_once(self, download_info, enable_notifications, max_speed_mbps, enable_resume, validate_files, hf_token):
'@

$Text = $Text.Replace($Needle, $Wrapper)
[System.IO.File]::WriteAllText($TargetFile, $Text, $Utf8NoBom)
Write-Host "  [HFDownloader] Applied resume-on-drop retry patch." -ForegroundColor Green
