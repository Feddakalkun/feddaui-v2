import { ArrowRight, Construction, Sparkles } from 'lucide-react';
import { useModules } from '../../contexts/ModuleContext';
import type { FeddaModule } from '../../modules/registry';
import { HFTokenReminder } from '../ui/HFTokenReminder';

/**
 * The chat agent gets its own full-width slab above the grid rather than a tile
 * inside it. It is the one entry point that isn't a workflow - it can reach any
 * of them - so making it look like a peer of "Gallery" would undersell it.
 */
function ChatBanner({ module, onSelect }: { module: FeddaModule; onSelect: (id: string) => void }) {
  const Icon = module.Icon;
  return (
    <button
      type="button"
      onClick={() => onSelect(module.defaultTab)}
      aria-label={module.label}
      // Capped against viewport height as well as its ratio, so on a wide
      // window the banner cannot grow until it squeezes the card rows.
      //
      // 20vh was too tight to honour the ratio: at 1002x777 the box came out
      // 953x154, a ratio of 6.18 against the poster's 3.89, so cover scaled the
      // image up to fill the width and threw away about a third of its height -
      // the top of the bunny. 32vh lets the declared aspect actually apply at
      // ordinary window sizes; the cap still catches very short windows.
      className="group relative aspect-[1168/300] max-h-[32vh] w-full overflow-hidden rounded-2xl border border-cyan-400/25 bg-[#08090d] text-left transition-all hover:-translate-y-0.5 hover:border-cyan-300/50"
    >
      {module.card?.poster && (
        <img
          src={module.card.poster}
          alt=""
          // Anchored right so the subject stays in frame while the copy sits
          // over the darkened left side.
          // The file is already cut to the banner's exact ratio, so plain cover
          // needs no focal offset and nothing important gets cropped away.
          className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-[1.04]"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-r from-[#050506] via-[#050506]/75 via-40% to-transparent" />
      <div className="relative flex h-full max-w-[48%] flex-col justify-center gap-1.5 px-7">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-cyan-400/30 bg-cyan-500/10">
            <Icon className="h-4 w-4 text-cyan-300" />
          </div>
          {/* It works - chat, memory, history and Studio all run - so "coming
              soon" both undersold it and contradicted the "try the preview"
              link right below. Early, not absent. */}
          <span className="rounded-md bg-cyan-500/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-cyan-200">
            Preview
          </span>
        </div>
        <p className="text-[22px] font-bold leading-tight tracking-tight text-zinc-50">
          {module.label}
        </p>
        <p className="text-[12px] leading-relaxed text-white/55">{module.description}</p>
        <span className="mt-1 inline-flex items-center gap-1.5 text-[11px] font-semibold text-cyan-300">
          Open it
          <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
        </span>
      </div>
    </button>
  );
}

interface RichHomeProps {
  onSelect: (id: string) => void;
}

function HomeCard({ module, onSelect }: { module: FeddaModule; onSelect: (id: string) => void }) {
  const Icon = module.Icon;
  return (
    <button
      onClick={() => onSelect(module.defaultTab)}
      aria-label={module.label}
      // Height comes from the row, not from an aspect ratio. Fixing the ratio
      // made the cards grow with the window width until the page scrolled;
      // letting the row size them is what keeps the home on one screen at any
      // zoom level. The poster still fills via object-cover.
      className="group relative h-full min-h-0 w-full overflow-hidden rounded-lg border border-white/10 bg-[#08090d] transition-all hover:-translate-y-0.5 hover:border-white/25"
    >
      {module.card?.poster ? (
        <>
          <img
            src={module.card.poster}
            alt=""
            // Height comes from the row, so the container's ratio moves with
            // the window while the poster's stays at 3:2. Whenever they differ
            // cover has to crop, and centred cropping takes the subject's head
            // off before it takes the empty floor. Biased upward so the crop
            // eats the bottom margin instead.
            className="absolute inset-0 h-full w-full object-cover object-[50%_35%] transition duration-500 group-hover:scale-[1.03]"
          />
          {module.card?.video ? (
            <video
              className="absolute inset-0 h-full w-full object-cover opacity-0 transition duration-500 group-hover:scale-[1.03] group-hover:opacity-100"
              src={module.card.video}
              poster={module.card.poster}
              muted
              loop
              playsInline
              autoPlay
            />
          ) : null}
        </>
      ) : (
        /* Fallback: no poster — show icon + label */
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6">
          <div className="w-10 h-10 rounded-xl border border-white/10 bg-white/[0.04] flex items-center justify-center transition-all group-hover:border-white/20 group-hover:bg-white/[0.07]">
            <Icon className="h-5 w-5 text-white/40 group-hover:text-white/70 transition-colors" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-white/60 group-hover:text-white/90 transition-colors">
              {module.label}
            </p>
            <p className="text-[10px] text-white/20 group-hover:text-white/35 transition-colors mt-0.5 max-w-[200px] leading-relaxed">
              {module.description}
            </p>
          </div>
        </div>
      )}
    </button>
  );
}

// Portrait (9:16) card for the top "Automations" row. Renders an active
// module or a "coming soon" placeholder.
function AutomationCard({ module, onSelect }: { module?: FeddaModule; onSelect: (id: string) => void }) {
  if (!module) {
    return (
      <div className="relative aspect-[9/16] overflow-hidden rounded-xl border border-dashed border-white/10 bg-gradient-to-b from-white/[0.04] to-transparent">
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03]">
            <Sparkles className="h-5 w-5 text-white/25" />
          </div>
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/30">Coming soon</span>
          <span className="text-[10px] text-white/15 leading-relaxed">More automated pipelines on the way</span>
        </div>
      </div>
    );
  }
  const Icon = module.Icon;
  return (
    <button
      onClick={() => onSelect(module.defaultTab)}
      aria-label={module.label}
      className="group relative aspect-[9/16] overflow-hidden rounded-xl border border-violet-500/25 bg-[#08090d] transition-all hover:-translate-y-0.5 hover:border-violet-400/50"
    >
      {module.card?.poster ? (
        <img src={module.card.poster} alt="" className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <Icon className="h-6 w-6 text-white/40" />
        </div>
      )}
      <span className="absolute left-2 top-2 rounded-md bg-violet-500/80 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">Automation</span>
      {module.wip ? (
        <span className="absolute right-2 top-2 flex items-center gap-1 rounded-md bg-amber-500/90 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-black">
          <Construction className="h-2.5 w-2.5" />
          Under construction
        </span>
      ) : null}
    </button>
  );
}

export const RichHome = ({ onSelect }: RichHomeProps) => {
  const { availableModules } = useModules();
  const allCards = availableModules.filter((module) => module.card && (module.area === 'home' || module.area === 'system') && !module.hidden);
  // The agent is pulled out of the grid and rendered as its own banner.
  const chat = allCards.find((module) => module.id === 'chat-edit');
  const cards = allCards.filter((module) => module.id !== 'chat-edit');
  const topCards = cards.slice(0, 2);
  const bottomCards = cards.slice(2);
  const automations = availableModules.filter((module) => module.area === 'automation' && !module.hidden);
  // Pad to 4 slots (undefined = "coming soon" placeholder)
  const automationSlots: (FeddaModule | undefined)[] = [...automations, undefined, undefined, undefined, undefined].slice(0, 4);

  // The home fits the viewport instead of scrolling: the two card rows share
  // whatever height is left over, so zooming in or out reflows rather than
  // pushing the bottom row out of sight.
  //
  // The rows carry a floor rather than shrinking freely. Without one they
  // collapsed to ~40px slivers on a short window, and a card too thin to read
  // is worse than a little scrolling - which is all that happens below roughly
  // 560px of height.
  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#050506]">
      <div className="mx-auto flex h-full w-full max-w-7xl flex-col gap-3 px-6 pb-5 pt-3">
        <div className="shrink-0">
          <HFTokenReminder />
          {chat && <ChatBanner module={chat} onSelect={onSelect} />}
        </div>

        {automations.length > 0 && (
          <section className="flex shrink-0 flex-col items-center space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/40">Automations</p>
            <div className="grid w-full max-w-2xl gap-3 grid-cols-4">
              {automationSlots.map((module, i) => (
                <AutomationCard key={module?.id ?? `soon-${i}`} module={module} onSelect={onSelect} />
              ))}
            </div>
          </section>
        )}

        <div className="grid min-h-[150px] w-full flex-[3] gap-3 md:grid-cols-2">
          {topCards.map((module) => (
            <HomeCard key={module.id} module={module} onSelect={onSelect} />
          ))}
        </div>
        <div className="grid min-h-[104px] w-full flex-[2] gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {bottomCards.map((module) => (
            <HomeCard key={module.id} module={module} onSelect={onSelect} />
          ))}
        </div>
      </div>
    </div>
  );
};