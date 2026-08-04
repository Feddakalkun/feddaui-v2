import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Layers, Search } from 'lucide-react';
import { useModules } from '../../contexts/ModuleContext';
import { groupIntoFamilies } from '../../modules/workflowFamilies';
import { cn } from '../../lib/styles';

/**
 * Switch the workflow the agent is driving, from inside the chat.
 *
 * This replaces the separate Studio mode. Picking a workflow was a place you
 * went *before* chatting, which made switching a trip back out and framed the
 * agent as a Qwen chat with an annex. It is one agent over all 48 workflows, so
 * the workflow is a setting on the conversation, not a mode around it.
 *
 * A full-width strip rather than a dropdown: every workflow is visible at once
 * without opening anything, and the bar costs one row of height. It was a tall
 * floating panel first, which buried the chat behind it every time you wanted
 * to look at the list.
 *
 * The cards are the section art at filmstrip size. Too small to read, which is
 * what the hover preview is for - and that preview is positioned against the
 * viewport, because a scrolling strip clips anything that grows inside it.
 */

const OPEN_KEY = 'fedda.chat.switcher.open';

interface Props {
  workflowId: string;
  onPick: (workflowId: string) => void;
}

type Entry = {
  id: string;
  label: string;
  family: string;
  poster?: string;
  poster916?: string;
};

export const WorkflowSwitcher = ({ workflowId, onPick }: Props) => {
  const { availableModules } = useModules();
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem(OPEN_KEY) !== '0'; } catch { return true; }
  });
  const [query, setQuery] = useState('');
  const [peek, setPeek] = useState<{ entry: Entry; x: number; y: number } | null>(null);

  const families = useMemo(
    () => groupIntoFamilies(availableModules, ['image', 'video']),
    [availableModules],
  );

  /**
   * Flat entries, keeping the family for search and the hover label.
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
          poster: m.card?.poster,
          // The strip has its own portrait art, published beside the landscape
          // set under a matching filename. Deriving the path keeps one source
          // of truth; anything not rendered yet falls back to the landscape
          // card rather than showing a gap.
          poster916: m.card?.poster?.replace('/cards/bunny/', '/cards/bunny916/'),
        }];
      }));
  }, [families]);

  const current = entries.find((e) => e.id === workflowId);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q
      ? entries.filter((e) => `${e.label} ${e.family}`.toLowerCase().includes(q))
      : entries;
  }, [entries, query]);

  const toggle = () => {
    setOpen((o) => {
      const next = !o;
      try { localStorage.setItem(OPEN_KEY, next ? '1' : '0'); } catch { /* private mode */ }
      return next;
    });
  };

  // The preview follows a card that scrolls away otherwise.
  useEffect(() => {
    if (!peek) return undefined;
    const drop = () => setPeek(null);
    window.addEventListener('scroll', drop, true);
    return () => window.removeEventListener('scroll', drop, true);
  }, [peek]);

  const src = (e: Entry) => e.poster916 || e.poster;

  return (
    <div className="shrink-0">
      <div className="flex items-center gap-2 px-4 py-1.5">
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
        <div className="custom-scrollbar flex gap-1.5 overflow-x-auto px-4 pb-2">
          {shown.length === 0 && (
            <p className="py-6 text-[11px] text-white/25">Nothing matches that.</p>
          )}
          {shown.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => onPick(e.id)}
              onMouseEnter={(ev) => {
                const r = ev.currentTarget.getBoundingClientRect();
                setPeek({ entry: e, x: r.left + r.width / 2, y: r.bottom });
              }}
              onMouseLeave={() => setPeek(null)}
              title={`${e.label} — ${e.family}`}
              className={cn(
                'relative h-16 w-9 shrink-0 overflow-hidden rounded-md bg-[#141420] ring-1 transition',
                e.id === workflowId
                  ? 'ring-cyan-400/80'
                  : 'ring-white/10 hover:ring-white/40',
              )}
            >
              {src(e) && (
                <img
                  src={src(e)}
                  alt=""
                  loading="lazy"
                  onError={(ev) => {
                    // A flag, not a src comparison: the browser resolves src to
                    // an absolute URL, so comparing it against the relative
                    // path never matches and the handler would retry forever.
                    const img = ev.currentTarget;
                    if (e.poster && !img.dataset.fellBack) {
                      img.dataset.fellBack = '1';
                      img.src = e.poster;
                    }
                  }}
                  className="h-full w-full object-cover"
                />
              )}
            </button>
          ))}
        </div>
      )}

      {/* Fixed, so it escapes the strip's own scroll clipping. */}
      {peek && (
        <div
          className="pointer-events-none fixed z-50 w-40 -translate-x-1/2 overflow-hidden rounded-xl shadow-2xl shadow-black/80 ring-1 ring-white/20"
          style={{ left: peek.x, top: peek.y + 8 }}
        >
          {/* No caption: every card has its own title baked into the art, and
              a second one printed over it just fights the first. */}
          {src(peek.entry) && (
            <img src={src(peek.entry)} alt="" className="w-full" />
          )}
        </div>
      )}
    </div>
  );
};
