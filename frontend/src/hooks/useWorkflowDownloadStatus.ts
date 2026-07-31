import { useCallback, useEffect, useRef, useState } from 'react';
import { useComfyExecution } from '../contexts/ComfyExecutionContext';
import { BACKEND_API } from '../config/api';

export interface DownloadFileStatus {
  filename: string;
  folder: string;
  exists: boolean;
  currentBytes: number;
  totalBytes: number;
}

export interface PreflightFileStatus {
  filename: string;
  folder: string;
  exists: boolean;
  size_bytes: number;
}

export interface WorkflowDownloadState {
  preflight: PreflightFileStatus[];
  liveFiles: DownloadFileStatus[];
  missingCount: number;
  allReady: boolean;
  checked: boolean;
  manualDownloading: boolean;
  startDownload: () => Promise<void>;
}

export function useWorkflowDownloadStatus(workflowId: string): WorkflowDownloadState {
  const { isDownloaderNode } = useComfyExecution();
  const [preflight, setPreflight] = useState<PreflightFileStatus[]>([]);
  const [liveFiles, setLiveFiles] = useState<DownloadFileStatus[]>([]);
  const [checked, setChecked] = useState(false);
  const [manualDownloading, setManualDownloading] = useState(false);
  const wasDownloadingRef = useRef(false);

  const fetchPreflight = useCallback(async () => {
    try {
      const resp = await fetch(
        `${BACKEND_API.BASE_URL}/api/workflow/model-status/${encodeURIComponent(workflowId)}`
      );
      if (!resp.ok) return;
      const data: { files?: Array<{ filename?: unknown; folder?: unknown; exists?: unknown; size_bytes?: unknown }> } = await resp.json();
      const files: PreflightFileStatus[] = (data.files ?? []).map((f) => ({
        filename: String(f.filename ?? ''),
        folder: String(f.folder ?? ''),
        exists: Boolean(f.exists),
        size_bytes: Number(f.size_bytes ?? 0),
      }));
      setPreflight(files);
      setChecked(true);
    } catch {
      // Network unavailable — silent, no crash
    }
  }, [workflowId]);

  // Initial preflight on mount
  useEffect(() => {
    fetchPreflight();
  }, [fetchPreflight]);

  // Refresh preflight when a download run completes
  useEffect(() => {
    const wasDownloading = wasDownloadingRef.current;
    wasDownloadingRef.current = isDownloaderNode;
    if (wasDownloading && !isDownloaderNode) {
      fetchPreflight();
    }
  }, [isDownloaderNode, fetchPreflight]);

  // Start a manual pre-download (no generation) of all missing models
  const startDownload = useCallback(async () => {
    try {
      const resp = await fetch(
        `${BACKEND_API.BASE_URL}/api/workflow/download-models/${encodeURIComponent(workflowId)}`,
        { method: 'POST' }
      );
      if (resp.ok) setManualDownloading(true);
    } catch {
      // Network unavailable — leave state unchanged
    }
  }, [workflowId]);

  // Poll live file sizes while a download could be running. The third condition
  // matters: /api/generate now starts missing-model downloads itself through the
  // backend's fast downloader, and that path sets neither isDownloaderNode (that
  // is the ComfyUI node executing) nor manualDownloading (that is the button).
  // Without it the bytes climb on disk while the banner shows nothing, and the
  // 409 telling the user to "watch the progress bar" points at a bar that never
  // appears. Anything still missing is reason enough to watch.
  const hasMissingFiles = preflight.some((f) => !f.exists);
  const pollingActive = isDownloaderNode || manualDownloading || hasMissingFiles;
  useEffect(() => {
    if (!pollingActive) {
      setLiveFiles([]);
      return;
    }
    let mounted = true;
    const poll = async () => {
      try {
        const resp = await fetch(
          `${BACKEND_API.BASE_URL}/api/workflow/download-live-progress/${encodeURIComponent(workflowId)}`
        );
        if (!resp.ok || !mounted) return;
        const data: { files?: Array<{ filename?: unknown; folder?: unknown; exists?: unknown; currentBytes?: unknown; totalBytes?: unknown }> } = await resp.json();
        if (!mounted) return;
        const files = (data.files ?? []).map((f) => ({
          filename: String(f.filename ?? ''),
          folder: String(f.folder ?? ''),
          exists: Boolean(f.exists),
          currentBytes: Number(f.currentBytes ?? 0),
          totalBytes: Number(f.totalBytes ?? 0),
        }));
        setLiveFiles(files);
        // Every file on disk means the download is done, whoever started it.
        // Re-running preflight clears hasMissingFiles, which stops this poll —
        // otherwise a Generate-triggered download would leave it running forever
        // since nothing else resets that flag.
        if (files.length > 0 && files.every((f) => f.exists)) {
          if (manualDownloading) setManualDownloading(false);
          fetchPreflight();
        }
      } catch {
        // Silent — polling failures don't matter
      }
    };
    poll();
    const id = setInterval(poll, 2000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, [pollingActive, manualDownloading, workflowId, fetchPreflight]);

  const missingCount = preflight.filter((f) => !f.exists).length;

  return {
    preflight,
    liveFiles,
    missingCount,
    allReady: checked && missingCount === 0,
    checked,
    manualDownloading,
    startDownload,
  };
}
