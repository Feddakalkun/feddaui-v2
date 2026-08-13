import { useEffect, useMemo, useState } from 'react';
import { BACKEND_API } from '../../config/api';
import { ChevronDown, ChevronUp, Layers, Lock, Search } from 'lucide-react';
import { useAgentWorkflow } from '../../contexts/AgentWorkflowContext';
import { FEDDA_MODULES } from '../../modules/registry';
import { groupIntoFamilies } from '../../modules/workflowFamilies';
import { cn } from '../../lib/styles';

/**
 * Switch the workflow the agent is driving.
 *
 * This replaces the separate Studio mode. Picking a workflow was a place you
 * went *before* chatting, which made switching a trip back out and framed the
 * agent as a Qwen chat with an annex. It is one agent over every workflow, so
 * the workflow is a setting on the conversation, not a mode around it.
 *
 * A bar rather than a dropdown: the whole set is visible without opening
 * anything, and it costs one row. It was a tall floating panel first, which
 * buried the chat behind it every time you wanted to look at the list.
 *
 * Everything is listed, including the entries the menus keep hidden - the point
 * of the bar is seeing what the app can do, and hiding the rest makes the
 * library look smaller than it is.
 *
 * What decides whether a card can be picked is whether its models are on disk.
 * The pack being installed is not the same question and answering it that way
 * was wrong: 33 of 34 looked ready when only 16 would actually run. Until the
 * readiness answer arrives nothing is dimmed, because guessing wrong in that
 * direction locks the user out of workflows that work.
 *
 * Cards are filmstrip size, too small to read, which is what the hover preview
 * is for. That preview is positioned against the viewport, because a scrolling
 * strip clips anything that grows inside it.
 */

const OPEN_KEY = 'fedda.chat.switcher.open';

/**
 * Why a card cannot be picked, in the fewest words that are still actionable.
 *
 * Nodes come first when both are missing: a missing model is a download the app
 * offers, while a missing node needs the pack installed, so it is the bigger
 * blocker of the two.
 */
const whyNot = (e: { known: boolean; missing: number; missingNodes: string[] }) => {
  // A registry entry can name a workflow that was never shipped - FLUX KLEIN
  // UNCENSORED points at one that exists in no config and no file. Nothing is
  // missing there because there is nothing; saying "0 model files missing"
  // reads as a bug, which is how this was found.
  if (!e.known) return 'not in this build';
  if (e.missingNodes.length) {
    return e.missingNodes.length === 1
      ? `needs node ${e.missingNodes[0]}`
      : `needs ${e.missingNodes.length} custom nodes`;
  }
  return `${e.missing} model file${e.missing === 1 ? '' : 's'} missing`;
};

type Entry = {
  id: string;
  label: string;
  family: string;
  /** The backend has a workflow by this id at all. */
  known: boolean;
  /** Everything it needs - models and nodes - is present. */
  ready: boolean;
  /** How many model files are missing, for the tooltip. */
  missing: number;
  /** Custom nodes ComfyUI does not have. A workflow can have every model and
      still die on one of these, which is what "ready" used to miss. */
  missingNodes: string[];
};

export const WorkflowSwitcher = () => {
  const { workflowId, pick } = useAgentWorkflow();
  // Closed until asked for. Switching workflow is something you do now and
  // then; a wall of cards is not worth the room it takes the rest of the time.
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem(OPEN_KEY) === '1'; } catch { return false; }
  });
  const [query, setQuery] = useState('');
  const [readiness, setReadiness] = useState<
    Record<string, { ready: boolean; missing: number; missing_nodes?: string[] }> | null>(null);

  // One request for the whole library; the per-workflow endpoint would be 34.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${BACKEND_API.BASE_URL}/api/workflow/model-readiness`);
        const data = await res.json();
        if (!cancelled && data.success) setReadiness(data.workflows);
      } catch { /* leave everything enabled rather than lock the bar */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // The whole registry, hidden entries included, marked up afterwards.
  const families = useMemo(
    () => groupIntoFamilies(FEDDA_MODULES, ['image', 'video'], { includeHidden: true }),
    [],
  );

  /**
   * Flat entries, keeping the family for search and the tooltip.
   *
   * A module with no workflow cannot be opened, so it is not offered. Several
   * modules can point at the *same* workflow (two cards both run `ltx-flf`),
   * and since picking one is picking the workflow, the first card wins - the
   * duplicates would be indistinguishable once selected.
   */
  const entries = useMemo<Entry[]>(() => {
    const seen = new Set<string>();
    return families.flatMap((f) =>
      f.modules.flatMap((m) => {
        const id = m.workflows?.[0];
        if (!id || seen.has(id)) return [];
        seen.add(id);
        return [{
          id,
          label: m.label,
          family: f.label,
          known: readiness ? id in readiness : true,
          ready: readiness ? Boolean(readiness[id]?.ready) : true,
          missing: readiness?.[id]?.missing ?? 0,
          missingNodes: readiness?.[id]?.missing_nodes ?? [],
        }];
      }));
  }, [families, readiness]);

  const current = entries.find((e) => e.id === workflowId);
  const readyCount = entries.filter((e) => e.ready).length;

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const hits = q
      ? entries.filter((e) => `${e.label} ${e.family}`.toLowerCase().includes(q))
      : entries;
    // Runnable first: the ones you can actually use should not be buried
    // among the ones you cannot.
    return [...hits].sort((a, b) => Number(b.ready) - Number(a.ready));
  }, [entries, query]);

  const toggle = () => {
    setOpen((o) => {
      const next = !o;
      try { localStorage.setItem(OPEN_KEY, next ? '1' : '0'); } catch { /* private mode */ }
      return next;
    });
  };


  return (
    <div className="shrink-0">
      <div className="flex items-center gap-2 px-6 py-1.5">
        <button
          type="button"
          onClick={toggle}
          className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.2em] text-white/35 transition hover:text-white/70"
        >
          <Layers className="h-3 w-3" />
          Workflow
          <span className="font-mono normal-case tracking-normal text-white/50">
            {current?.label || workflowId}
          </span>
          <span className="font-mono text-white/25">{readyCount}/{entries.length}</span>
          {open ? <ChevronUp className="h-3.5 w-3.5 text-white/25" />
                : <ChevronDown className="h-3.5 w-3.5 text-white/25" />}
        </button>

        {open && (
          <div className="relative ml-auto">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-white/25" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter…"
              className="w-32 rounded-lg bg-white/[0.05] py-1 pl-7 pr-2 text-[10px] text-zinc-100 outline-none transition-[width] placeholder:text-white/25 focus:w-44 focus:bg-white/[0.08]"
            />
          </div>
        )}
      </div>

      {open && (
        <div className="custom-scrollbar flex gap-1.5 overflow-x-auto px-6 pb-2">
          {shown.length === 0 && (
            <p className="py-6 text-[11px] text-white/25">Nothing matches that.</p>
          )}
          {shown.map((e) => (
            <button
              key={e.id}
              type="button"
              disabled={!e.ready}
              onClick={() => pick(e.id)}
              title={e.ready ? `${e.label} — ${e.family}` : `${e.label} — ${whyNot(e)}`}
              className={cn(
                'relative flex h-16 w-[104px] shrink-0 flex-col justify-center gap-0.5',
                'overflow-hidden rounded-md bg-[#141420] px-2 py-1.5 text-left ring-1 transition',
                !e.ready ? 'cursor-not-allowed opacity-40 ring-white/5'
                  : e.id === workflowId ? 'ring-cyan-400/80 bg-cyan-500/10'
                  : 'ring-white/10 hover:bg-white/[0.06] hover:ring-white/40',
              )}
            >
              <span
                className={cn(
                  'line-clamp-2 text-[10px] font-semibold leading-tight',
                  e.id === workflowId ? 'text-cyan-100' : 'text-white/80',
                )}
              >
                {e.label}
              </span>
              <span className="flex items-center gap-1 truncate text-[8px] uppercase tracking-wider text-white/30">
                {!e.ready && <Lock className="h-2 w-2 shrink-0" />}
                {e.family}
              </span>
            </button>
          ))}
        </div>
      )}

    </div>
  );
};
