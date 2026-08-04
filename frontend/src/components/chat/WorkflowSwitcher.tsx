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
        return [{ id, label: m.label, poster: m.card?.poster, family: f.label }];
      }));
  }, [families]);

  const current = entries.find((e) => e.id === workflowId);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const hits = q
      ? entries.filter((e) => `${e.label} ${e.family}`.toLowerCase().includes(q))
      : entries;
    const groups = new Map<string, typeof hits>();
    for (const e of hits) {
      const list = groups.get(e.family);
      if (list) list.push(e);
      else groups.set(e.family, [e]);
    }
    return [...groups.entries()];
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
        <div className="absolute left-0 top-full z-40 mt-1 w-[min(46rem,calc(100vw-6rem))] overflow-hidden rounded-2xl bg-[#0d0d13] shadow-2xl shadow-black/70 ring-1 ring-white/10">
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

          <div className="custom-scrollbar max-h-[62vh] overflow-y-auto px-2.5 pb-3">
            {shown.length === 0 && (
              <p className="px-1 py-6 text-center text-[12px] text-white/30">Nothing matches that.</p>
            )}
            {shown.map(([family, items]) => (
              <div key={family} className="mb-3">
                <p className="px-1 pb-1.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-white/25">
                  {family}
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {items.map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => { onPick(e.id); setOpen(false); }}
                      title={e.label}
                      className={cn(
                        'group relative aspect-[1168/784] overflow-hidden rounded-xl bg-[#141420] text-left ring-1 transition',
                        e.id === workflowId
                          ? 'ring-cyan-400/70'
                          : 'ring-white/5 hover:ring-white/25',
                      )}
                    >
                      {e.poster && (
                        <img
                          src={e.poster}
                          alt=""
                          loading="lazy"
                          className="absolute inset-0 h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                        />
                      )}
                      {/* Only the strip behind the label is darkened - the cards
                          carry their own titles and a full scrim buries them. */}
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent px-2 pb-1.5 pt-5">
                        <span className="block truncate text-[11px] font-semibold text-zinc-50">
                          {e.label}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
