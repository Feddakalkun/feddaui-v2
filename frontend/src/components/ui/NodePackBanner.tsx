import { useEffect, useState } from 'react';
import { AlertTriangle, PackagePlus, Loader2, RotateCcw } from 'lucide-react';
import { BACKEND_API } from '../../config/api';

const api = (path: string) => `${BACKEND_API.BASE_URL}${path}`;

type NodeStatus = {
  ok?: boolean;
  missing?: { folder: string; url: string }[];
};

/**
 * Detects when a workflow needs custom-node packs that are not installed yet
 * (heavy packs install on demand; only the core set ships with the installer),
 * and installs them in-app. ComfyUI loads nodes only at startup, so after an
 * install this prompts a FEDDA restart instead of letting ComfyUI throw a raw
 * "node not found" at generate time.
 */
export const NodePackBanner = ({ workflowId }: { workflowId: string }) => {
  const [missing, setMissing] = useState<string[]>([]);
  const [checked, setChecked] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setChecked(false);
    setDone(false);
    setErr(null);
    fetch(api(`${BACKEND_API.ENDPOINTS.WORKFLOW_NODE_STATUS}/${encodeURIComponent(workflowId)}`), {
      cache: 'no-store',
    })
      .then((r) => r.json())
      .then((d: NodeStatus) => {
        if (!alive) return;
        setMissing((d.missing || []).map((m) => m.folder));
        setChecked(true);
      })
      .catch(() => {
        if (alive) setChecked(true);
      });
    return () => {
      alive = false;
    };
  }, [workflowId]);

  const install = async () => {
    setInstalling(true);
    setErr(null);
    try {
      const r = await fetch(
        api(`${BACKEND_API.ENDPOINTS.WORKFLOW_INSTALL_NODES}/${encodeURIComponent(workflowId)}`),
        { method: 'POST' },
      );
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d?.success === false) {
        const first = Array.isArray(d?.failed) ? d.failed[0] : null;
        throw new Error(first?.error || d?.detail || 'Install failed');
      }
      setMissing([]);
      setDone(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Install failed');
    } finally {
      setInstalling(false);
    }
  };

  if (done) {
    return (
      <div className="border-b border-emerald-500/20 bg-emerald-500/[0.06] px-5 py-2.5">
        <div className="flex items-center gap-2">
          <RotateCcw className="h-3.5 w-3.5 flex-shrink-0 text-emerald-400" />
          <span className="text-[11px] font-semibold text-emerald-300">
            Node pack installed — restart FEDDA to use this workflow
          </span>
          <span className="ml-auto hidden text-[10px] text-emerald-500/60 sm:inline">
            Close the launcher window, run run.bat again
          </span>
        </div>
      </div>
    );
  }

  if (!checked || missing.length === 0) return null;

  return (
    <div className="space-y-1.5 border-b border-amber-500/20 bg-amber-500/[0.06] px-5 py-2.5">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 text-amber-500/80" />
        <span className="text-[11px] font-semibold text-amber-400/90">
          This workflow needs {missing.length} node pack{missing.length !== 1 ? 's' : ''}
        </span>
        <button
          type="button"
          onClick={() => void install()}
          disabled={installing}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-300 transition hover:bg-amber-500/20 disabled:opacity-60"
        >
          {installing ? <Loader2 className="h-3 w-3 animate-spin" /> : <PackagePlus className="h-3 w-3" />}
          {installing ? 'Installing…' : 'Install'}
        </button>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-0.5 pl-5">
        {missing.map((f) => (
          <span key={f} className="truncate font-mono text-[10px] text-zinc-600">
            {f}
          </span>
        ))}
      </div>
      <p className="pl-5 text-[10px] text-zinc-600">
        {installing
          ? 'Cloning + installing — this can take a minute. Keep this open.'
          : 'One click installs it. ComfyUI loads nodes at startup, so restart FEDDA after.'}
      </p>
      {err && <p className="pl-5 text-[10px] text-red-300">{err}</p>}
    </div>
  );
};
