import { useMemo, useState } from 'react';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { useModules } from '../contexts/ModuleContext';
import { groupIntoFamilies } from '../modules/workflowFamilies';
import { ChatWorkflowPage } from './ChatWorkflowPage';
import { cn } from '../lib/styles';

/**
 * Pick a workflow, then talk to it.
 *
 * Two levels, mirroring the studios: families first (grouped by the same
 * `sourceModuleId` the section cards use), then the workflows inside one.
 * Families holding a single workflow open straight through — a submenu with
 * one entry is just an extra click.
 *
 * Everything after the pick is `ChatWorkflowPage`, which already drives any
 * workflow from its `workflow_api.json` declaration, so nothing here is
 * workflow-specific.
 */

interface Props {
  /** Restores the workflow when a saved Studio chat is reopened. */
  workflowId: string | null;
  onPick: (workflowId: string, label: string) => void;
  onClear: () => void;
}

export const StudioPane = ({ workflowId, onPick, onClear }: Props) => {
  const { availableModules } = useModules();
  const [openFamily, setOpenFamily] = useState<string | null>(null);

  const families = useMemo(
    () => groupIntoFamilies(availableModules, ['image', 'video']),
    [availableModules],
  );

  if (workflowId) {
    return (
      <div className="flex h-full min-w-0 flex-1 flex-col">
        <button
          type="button"
          onClick={onClear}
          className="flex items-center gap-1.5 border-b border-white/8 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35 transition hover:text-white"
        >
          <ArrowLeft className="h-3 w-3" /> Choose another workflow
        </button>
        <div className="min-h-0 flex-1">
          <ChatWorkflowPage workflowId={workflowId} />
        </div>
      </div>
    );
  }

  const active = openFamily ? families.find((f) => f.id === openFamily) : undefined;
  const entries = active
    ? active.modules.map((m) => ({ id: m.defaultTab, label: m.label, poster: m.card?.poster, workflow: m.workflows?.[0] }))
    : [];

  return (
    <div className="custom-scrollbar h-full min-w-0 flex-1 overflow-y-auto px-6 py-6">
      <div className="mx-auto max-w-4xl">
        {active ? (
          <>
            <button
              type="button"
              onClick={() => setOpenFamily(null)}
              className="mb-4 inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35 transition hover:text-white"
            >
              <ArrowLeft className="h-3 w-3" /> All families
            </button>
            <h2 className="mb-4 text-[15px] font-semibold text-zinc-100">{active.label}</h2>
          </>
        ) : (
          <>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">Studio</p>
            <h2 className="mb-1 mt-1 text-[15px] font-semibold text-zinc-100">
              What are we making?
            </h2>
            <p className="mb-5 text-[12px] text-white/40">
              Pick a workflow and the agent will ask for what it needs.
            </p>
          </>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(active ? entries : families.map((f) => ({
            id: f.id,
            label: f.label,
            poster: f.modules.find((m) => m.card?.poster)?.card?.poster,
            workflow: f.modules.length === 1 ? f.modules[0].workflows?.[0] : undefined,
            single: f.modules.length === 1 ? f.modules[0] : undefined,
          }))).map((item) => {
            // Skip anything with no workflow to run - a card that cannot be
            // opened is worse than one that is missing.
            const single = (item as { single?: { workflows?: string[]; label: string } }).single;
            const target = item.workflow || single?.workflows?.[0];
            const isFamily = !active && !single;
            if (!isFamily && !target) return null;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (isFamily) return setOpenFamily(item.id);
                  if (target) onPick(target, item.label);
                }}
                className="group relative aspect-[1168/784] overflow-hidden rounded-xl border border-white/10 bg-[#08090d] text-left transition-all hover:-translate-y-0.5 hover:border-white/25"
              >
                {item.poster && (
                  <img src={item.poster} alt=""
                    className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" />
                )}
                <div className={cn(
                  'absolute inset-0',
                  item.poster ? 'bg-gradient-to-t from-black/85 via-black/25 to-transparent' : '',
                )} />
                <div className="absolute inset-x-0 bottom-0 flex items-center gap-1 p-3">
                  <span className="truncate text-[12px] font-semibold text-zinc-50">{item.label}</span>
                  {isFamily && <ChevronRight className="ml-auto h-3.5 w-3.5 shrink-0 text-white/40" />}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
