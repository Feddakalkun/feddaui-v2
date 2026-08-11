import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ArrowUpRight, CheckCircle2, DownloadCloud, Loader2, RefreshCw } from 'lucide-react';
import { BACKEND_API } from '../../config/api';
import { useModules } from '../../contexts/ModuleContext';
import { cn } from '../../lib/styles';

/**
 * Every workflow's model status in one list.
 *
 * The per-page banner answers "can I run this one"; this is the backup view for
 * "what does this install still need", and lets you fetch things before a
 * session instead of discovering a 28 GB download when you press Generate.
 *
 * A workflow reporting 0 models is not necessarily fine - it means its graph has
 * no downloader node, so nothing can be fetched automatically. Those are called
 * out rather than shown as ready.
 */
type Row = {
  workflow_id: string;
  name: string;
  total: number;
  present: number;
  missing: number;
  missing_bytes: number;
  error?: string | null;
};

/**
 * workflow_id → tab id, for the rows whose page lives under a different route.
 * Most workflow ids ARE valid tabs already; this only covers the variants
 * (gguf/fast/noupscale graphs a page swaps to at runtime) and renamed tabs.
 * Anything that resolves to a tab not in validTabs renders without a link —
 * App.tsx bounces unknown tabs to the default page, which is worse than no link.
 */
const TAB_ALIASES: Record<string, string> = {
  'krea2-turbo-txt2img-gguf': 'krea2-turbo-txt2img',
  'ltx-ai2v-noupscale': 'ltx-ai2v',
  'ltx-img2vid-gguf': 'ltx-img2vid',
  'qwen-edit-2509-image-reference': 'qwen-image-ref',
  'qwen-multi-angles': 'qwen-multi-angle',
  'qwen-multi-angles-fast': 'qwen-multi-angle',
  'z-image-dual-base': 'z-image-dual-lora',
  'z-image-dual-detail': 'z-image-dual-lora',
  'z-image-dual-lora-upload': 'z-image-dual-lora',
  'z-image-dual-lora-v2': 'z-image-dual-lora',
  'z-image-controlnet-pose': 'wan21-steady-dancer',
};

const fmtBytes = (b: number) =>
  b >= 1_000_000_000 ? `${(b / 1_000_000_000).toFixed(1)} GB`
  : b >= 1_000_000 ? `${(b / 1_000_000).toFixed(0)} MB`
  : b > 0 ? `${(b / 1_000).toFixed(0)} KB` : '';

export const ModelOverview = () => {
  const { validTabs } = useModules();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${BACKEND_API.BASE_URL}/api/workflows/model-overview`);
      if (!r.ok) throw new Error(String(r.status));
      const d = await r.json();
      setRows(d.workflows ?? []);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const download = async (id: string) => {
    setBusy(id);
    try {
      await fetch(`${BACKEND_API.BASE_URL}/api/workflow/download-models/${encodeURIComponent(id)}`, { method: 'POST' });
      setTimeout(() => { void load(); }, 4000);
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <p className="flex items-center justify-center gap-2 py-16 text-sm text-zinc-600">
        <Loader2 className="h-4 w-4 animate-spin" /> Checking every workflow…
      </p>
    );
  }

  if (failed) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm font-semibold text-zinc-400">Could not reach the backend</p>
        <p className="mt-1 text-xs text-zinc-600">
          This view needs a backend restart if you are running one started before it was added.
        </p>
      </div>
    );
  }

  const needing = rows.filter((r) => r.missing > 0);
  const undeclared = rows.filter((r) => r.total === 0 && !r.error);
  const totalMissing = needing.reduce((n, r) => n + r.missing_bytes, 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">
          {rows.length} workflows · {needing.length} need models
          {totalMissing > 0 && <> · {fmtBytes(totalMissing)} to fetch</>}
        </p>
        <button
          type="button"
          onClick={() => { void load(); }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1 text-[10px] font-semibold text-white/50 transition hover:text-white"
        >
          <RefreshCw className="h-3 w-3" /> Refresh
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-white/8">
        {rows.map((r) => {
          // Link straight to the workflow's page when its id (or an alias)
          // is a tab the app will actually resolve.
          const candidate = TAB_ALIASES[r.workflow_id] ?? r.workflow_id;
          const tab = validTabs.has(candidate) ? candidate : null;
          const nameBlock = (
            <>
              <p className="truncate text-[12px] text-zinc-200">
                {r.name}
                {tab && <ArrowUpRight className="ml-1 inline h-3 w-3 text-white/25 transition group-hover:text-cyan-300" />}
              </p>
              <p className="truncate font-mono text-[9px] text-white/25">{r.workflow_id}</p>
            </>
          );
          return (
          <div
            key={r.workflow_id}
            className="flex items-center gap-3 border-b border-white/5 px-4 py-2 last:border-b-0"
          >
            {tab ? (
              <a
                href={`#/tab/${encodeURIComponent(tab)}`}
                className="group min-w-0 flex-1 transition hover:brightness-125"
                title="Open workflow"
              >
                {nameBlock}
              </a>
            ) : (
              <div className="min-w-0 flex-1">{nameBlock}</div>
            )}

            <span className={cn(
              'shrink-0 text-[10px] font-semibold',
              r.error ? 'text-red-400/70'
                : r.total === 0 ? 'text-white/25'
                : r.missing === 0 ? 'text-emerald-400/80'
                : 'text-amber-300',
            )}>
              {r.error ? 'error'
                : r.total === 0 ? 'no downloader node'
                : r.missing === 0 ? <><CheckCircle2 className="mr-1 inline h-3 w-3" />{r.present} ready</>
                : <><AlertTriangle className="mr-1 inline h-3 w-3" />{r.missing} of {r.total} missing</>}
            </span>

            {r.missing > 0 && (
              <button
                type="button"
                disabled={busy === r.workflow_id}
                onClick={() => { void download(r.workflow_id); }}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] font-semibold text-amber-300 transition hover:bg-amber-500/20 disabled:opacity-40"
              >
                {busy === r.workflow_id
                  ? <Loader2 className="h-3 w-3 animate-spin" />
                  : <DownloadCloud className="h-3 w-3" />}
                {fmtBytes(r.missing_bytes) || 'Get'}
              </button>
            )}
          </div>
          );
        })}
      </div>

      {undeclared.length > 0 && (
        <p className="text-[10px] leading-relaxed text-white/25">
          {undeclared.length} workflows declare no models at all — their graphs have no downloader node,
          so nothing can be fetched for them automatically. They will still run if the files happen to
          be on disk.
        </p>
      )}
    </div>
  );
};
