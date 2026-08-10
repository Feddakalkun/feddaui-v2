import { useMemo, useState } from 'react';
import { ArrowLeft, Layers } from 'lucide-react';
import { useModules } from '../../contexts/ModuleContext';
import type { FeddaModule } from '../../modules/registry';
import { groupIntoFamilies, type WorkflowFamily } from '../../modules/workflowFamilies';

/**
 * Two-level workflow browser for a studio area.
 *
 * Level 1 = model family (LTX, WAN, Z-Image, ...), grouped by the module's
 * `sourceModuleId` — the same grouping config/modules.json already uses to bundle
 * workflows with the custom nodes they need. Level 2 = the workflows in that family.
 *
 * A flat list stops scaling once the hidden workflows come back (video alone has 11),
 * so families keep the studio readable. Families with a single workflow skip level 2
 * and open it directly — a submenu holding one card is just an extra click.
 */

/**
 * Purpose-made art per family.
 *
 * Without this a family tile shows the poster of whichever workflow sorts
 * first, so "LTX Video" showed the Img2Vid picture. Families not listed here
 * still borrow, so adding art is one line and needs no other change.
 *
 * These two are also the reason the bunny sweep left two teal elves behind:
 * they are not module cards, so replacing every `card:` in the registry went
 * straight past them.
 */
const FAMILY_ART: Record<string, string> = {
  'ltx-video': '/cards/bunny/family/ltx-video.jpeg',
  'wan-video': '/cards/bunny/family/wan-video.jpeg',
  'minimax-h3': '/cards/bunny/family/minimax-h3.jpeg',
  // Only the three video families were ever listed, so every image family
  // fell through to one of its own children's posters - opening FLUX showed
  // the same picture on the family tile and on the workflow right beneath it.
  'flux-klein': '/cards/bunny/family/flux-klein.jpeg',
  'qwen-image': '/cards/bunny/family/qwen-image.jpeg',
  'sdxl-pack': '/cards/bunny/family/sdxl-pack.jpeg',
  'chroma-image': '/cards/bunny/family/chroma-image.jpeg',
  'z-image-core': '/cards/bunny/family/z-image-core.jpeg',
  // The last family without its own art. Its tile fell back to the Two People
  // workflow poster, which carries a burnt-in title - the one card in the
  // picker with lettering on it.
  'z-image-advanced': '/cards/bunny/family/z-image-advanced.jpeg',
  'firered-image': '/cards/bunny/family/firered-image.jpeg',
  'krea2-txt2img': '/cards/bunny/family/krea2-txt2img.jpeg',
};

/** "an LTX Video", "a WAN Video" — letters like L/M/N/S read as vowels when spoken. */
const article = (word: string) =>
  /^[AEIOUaeiou]/.test(word) || /^[FHLMNRSX]$/.test(word[0] ?? '') ? 'an' : 'a';

interface SectionCardsProps {
  area: 'image' | 'video';
  /** Tab we came back from; its family is reopened so Back lands where you left. */
  reopenFor?: string | null;
  kicker: string;
  title: string;
  onSelect: (tab: string) => void;
  onBack?: () => void;
}

/** Shared card chrome — identical for a family tile and a workflow tile. */
const Card = ({
  poster,
  video,
  label,
  description,
  count,
  Icon,
  onClick,
}: {
  poster?: string;
  video?: string;
  label: string;
  description?: string;
  count?: number;
  Icon?: FeddaModule['Icon'];
  onClick: () => void;
}) => (
  <button
    onClick={onClick}
    aria-label={label}
    className="group relative aspect-[1168/784] overflow-hidden rounded-lg border border-white/10 bg-[#08090d] transition hover:-translate-y-0.5 hover:border-white/25"
  >
    {poster ? (
      <>
        <img
          src={poster}
          alt=""
          className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
        />
        {video ? (
          <video
            className="absolute inset-0 h-full w-full object-cover opacity-0 transition duration-500 group-hover:scale-[1.03] group-hover:opacity-100"
            src={video}
            poster={poster}
            muted
            loop
            playsInline
            autoPlay
          />
        ) : null}
      </>
    ) : (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] transition group-hover:border-white/20">
          {Icon ? (
            <Icon className="h-5 w-5 text-white/40 transition group-hover:text-white/70" />
          ) : (
            <Layers className="h-5 w-5 text-white/40 transition group-hover:text-white/70" />
          )}
        </div>
        <div>
          <p className="text-sm font-semibold text-white/70 transition group-hover:text-white/90">{label}</p>
          {description ? (
            <p className="mt-1 max-w-[220px] text-[10px] leading-relaxed text-white/25">{description}</p>
          ) : null}
        </div>
      </div>
    )}

    {/* Family tiles get a name plate + workflow count over the art. */}
    {typeof count === 'number' ? (
      <>
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent p-4 text-left">
          <p className="text-sm font-semibold text-white">{label}</p>
          <p className="mt-0.5 text-[10px] uppercase tracking-[0.18em] text-white/45">
            {count} workflow{count === 1 ? '' : 's'}
          </p>
        </div>
        <span className="absolute right-2 top-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-white/80 backdrop-blur-sm">
          {count}
        </span>
      </>
    ) : null}
  </button>
);

export const SectionCards = ({ area, kicker, title, onSelect, onBack, reopenFor }: SectionCardsProps) => {
  const { availableModules } = useModules();
  // Not persisted. Restoring the last family on every visit meant entering the
  // studio dropped you inside one family's submenu instead of showing the
  // families - it looked like the other workflows had vanished. It is seeded
  // only when Back arrives here from a workflow, via reopenFor.
  const [openFamily, setOpenFamily] = useState<string | null>(null);

  const families = useMemo<WorkflowFamily[]>(
    () => groupIntoFamilies(availableModules, [area]).filter((f) => f.modules.some((m) => m.card)),
    [availableModules, area],
  );

  // Seed once from the tab we returned from, so Back reopens that submenu.
  useState(() => {
    if (!reopenFor) return undefined;
    const owner = families.find((f) => f.modules.some((m) => m.defaultTab === reopenFor || m.tabs.includes(reopenFor)));
    if (owner && owner.modules.length > 1) setOpenFamily(owner.id);
    return undefined;
  });

  const active = openFamily ? families.find((f) => f.id === openFamily) : undefined;

  const openOrSelect = (family: Family) => {
    // A family with one workflow shouldn't cost an extra click.
    if (family.modules.length === 1) onSelect(family.modules[0].defaultTab);
    else setOpenFamily(family.id);
  };

  return (
    <div className="h-full overflow-y-auto custom-scrollbar bg-[#050506] px-8 py-8">
      <div className="mx-auto max-w-[1400px] space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="v14-kicker text-white/40">{active ? active.label : kicker}</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white">
              {active ? `Choose ${article(active.label)} ${active.label} workflow` : title}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {active ? (
              <button onClick={() => setOpenFamily(null)} className="v15-home-btn inline-flex items-center gap-2">
                <ArrowLeft className="h-3.5 w-3.5" /> All families
              </button>
            ) : null}
            {onBack && !active ? (
              <button onClick={onBack} className="v15-home-btn inline-flex items-center gap-2">
                <ArrowLeft className="h-3.5 w-3.5" /> Home
              </button>
            ) : null}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {active
            ? active.modules.map((m) => (
                <Card
                  key={m.id}
                  poster={m.card?.poster}
                  video={m.card?.video}
                  label={m.label}
                  description={m.description}
                  Icon={m.Icon}
                  onClick={() => onSelect(m.defaultTab)}
                />
              ))
            : families.map((f) => {
                const art = f.modules.find((m) => m.card?.poster);
                return (
                  <Card
                    key={f.id}
                    poster={FAMILY_ART[f.id] ?? art?.card?.poster}
                    video={f.modules.length === 1 ? art?.card?.video : undefined}
                    label={f.label}
                    count={f.modules.length}
                    Icon={f.modules[0]?.Icon}
                    onClick={() => openOrSelect(f)}
                  />
                );
              })}
        </div>
      </div>
    </div>
  );
};
