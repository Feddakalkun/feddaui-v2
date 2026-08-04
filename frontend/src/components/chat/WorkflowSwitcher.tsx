import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
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
 * The entries are the section cards themselves, at a size where their baked-in
 * titles still read - recognising the artwork is faster than reading a list,
 * and the cards already carry what each workflow is for.
 */

interface Props {
  workflowId: string;
  /** Name from the schema; the card label wins when there is one. */
  fallbackName: string;
  onPick: (workflowId: string) => void;
}

export const WorkflowSwitcher = ({ workflowId, fallbackName, onPick }: Props) => {
  const { availableModules } = useModules();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrap = useRef<HTMLDivElement>(null);

  const families = useMemo(
    () => groupIntoFamilies(availableModules, ['image', 'video']),
    [availableModules],
  );

  /**
   * Flat entries, keeping the family for the headings.
   *
   * A module with no workflow cannot be opened, so it is not offered. Several
   * modules can point at the *same* workflow (two cards both run `ltx-flf`),
   * and since picking one is picking the workflow, the first card wins - the
   * duplicates would be indistinguishable once selected.
   */
  const entries = useMemo(() => {
    const seen = new Set<string>();
    return families.flatMap((f) =>
      f.modules.flatMap((m) => {
        const id = m.workflows?.[0];
        if (!id || seen.has(id)) return [];
        seen.add(id);
        return [{ id, label: m.label, poster: m.card?.poster, family: f.label,
                  // The strip has its own portrait art, published beside the
                  // landscape set under a matching filename. Deriving the path
                  // keeps one source of truth; anything not rendered yet falls
                  // back to the landscape card rather than showing a gap.
                  poster916: m.card?.poster?.replace('/cards/bunny/', '/cards/bunny916/') }];
      }));
  }, [families]);

  const current = entries.find((e) => e.id === workflowId);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q
      ? entries.filter((e) => `${e.label} ${e.family}`.toLowerCase().includes(q))
      : entries;
  }, [entries, query]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        onClick={() => { setOpen((o) => !o); setQuery(''); }}
        title="Switch workflow"
        className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45 transition hover:bg-white/[0.06] hover:text-white"
      >
        {current?.label || fallbackName || workflowId}
        <ChevronDown className={cn('h-3 w-3 transition', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-40 mt-1 w-[min(64rem,calc(100vw-4rem))] overflow-hidden rounded-2xl bg-[#0d0d13] shadow-2xl shadow-black/70 ring-1 ring-white/10">
          <div className="relative p-2.5">
            <Search className="pointer-events-none absolute left-5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/25" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search workflows…"
              className="w-full rounded-xl bg-white/[0.05] py-2 pl-8 pr-2 text-[12px] text-zinc-100 outline-none placeholder:text-white/30 focus:bg-white/[0.08]"
            />
          </div>

          {shown.length === 0 ? (
            <p className="px-3 py-8 text-center text-[12px] text-white/30">Nothing matches that.</p>
          ) : (
            /* One row, everything at once.
               A scrolling strip clips whatever leaves its box, so the space a
               hovered card grows into has to be reserved up front. It grows
               upward from its own bottom edge, which keeps the row itself
               anchored and needs the room in one direction instead of two. */
            <div className="custom-scrollbar flex items-end gap-2 overflow-x-auto overflow-y-hidden px-12 pb-4 pt-36">
              {shown.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => { onPick(e.id); setOpen(false); }}
                  title={`${e.label} — ${e.family}`}
                  className={cn(
                    'group relative aspect-[9/16] w-16 shrink-0 overflow-visible rounded-lg text-left',
                    'origin-bottom transition-transform duration-200 hover:z-20 hover:scale-[2.2]',
                  )}
                >
                  <span
                    className={cn(
                      'absolute inset-0 overflow-hidden rounded-lg bg-[#141420] ring-1 transition',
                      e.id === workflowId ? 'ring-cyan-400/80' : 'ring-white/10 group-hover:ring-white/30',
                    )}
                  >
                    {(e.poster916 || e.poster) && (
                      <img
                        src={e.poster916 || e.poster}
                        alt=""
                        loading="lazy"
                        onError={(ev) => {
                          // A flag, not a src comparison: the browser resolves
                          // src to an absolute URL, so comparing it against the
                          // relative path never matches and retries forever.
                          const img = ev.currentTarget;
                          if (e.poster && !img.dataset.fellBack) {
                            img.dataset.fellBack = '1';
                            img.src = e.poster;
                          }
                        }}
                        className="h-full w-full object-cover"
                      />
                    )}
                    {/* The names only appear once a card is big enough to read
                        them; at rest they would be an illegible smear. */}
                    <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent px-1.5 pb-1 pt-4 opacity-0 transition group-hover:opacity-100">
                      <span className="block truncate text-[5px] font-semibold text-zinc-50">
                        {e.label}
                      </span>
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
