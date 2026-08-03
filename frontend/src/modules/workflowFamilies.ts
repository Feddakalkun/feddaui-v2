import type { FeddaModule } from './registry';

/**
 * Grouping of workflows into families.
 *
 * Families come from `sourceModuleId` — the same grouping `config/modules.json`
 * uses to bundle workflows with the custom nodes they need, so a family is
 * always something that installs and works as a unit.
 *
 * Lifted out of `components/layout/SectionCards.tsx` so the studio picker and
 * the section cards share one definition. Two copies would drift the moment a
 * family is added.
 */

export const FAMILY_LABELS: Record<string, string> = {
  'ltx-video': 'LTX Video',
  'wan-video': 'WAN Video',
  lipsync: 'Lipsync',
  'z-image-core': 'Z-Image',
  'z-image-advanced': 'Z-Image Advanced',
  'sdxl-pack': 'SDXL',
  'qwen-image': 'Qwen',
  'chroma-image': 'Chroma',
  'firered-image': 'FireRed',
  'flux-klein': 'FLUX',
  ideogram: 'Ideogram',
  'krea2-txt2img': 'KREA2',
};

export const prettifyFamily = (id: string) =>
  id.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export interface WorkflowFamily {
  id: string;
  label: string;
  modules: FeddaModule[];
}

/**
 * Group modules into families, sorted by label.
 *
 * `areas` is a filter rather than a single area because the studio picker
 * spans image *and* video, while the section cards only ever want one.
 */
export function groupIntoFamilies(
  modules: FeddaModule[],
  areas: FeddaModule['area'][],
  { includeHidden = false }: { includeHidden?: boolean } = {},
): WorkflowFamily[] {
  const eligible = modules.filter(
    (m) => areas.includes(m.area) && (includeHidden || !m.hidden),
  );
  const byId = new Map<string, FeddaModule[]>();
  for (const m of eligible) {
    const key = m.sourceModuleId || m.id;
    const list = byId.get(key);
    if (list) list.push(m);
    else byId.set(key, [m]);
  }
  return [...byId.entries()]
    .map(([id, mods]) => ({ id, label: FAMILY_LABELS[id] ?? prettifyFamily(id), modules: mods }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
