import { Txt2ImgPage } from '../zimage/ZImageTxt2Img';

/**
 * One Chroma page, not two.
 *
 * "Chroma Simple" was the same graph: identical nodes, same UNET, same
 * encoder, same VAE, same sampler chain. It differed only in steps (32 vs 40),
 * cfg (1.25 vs 1.7), scheduler alpha/beta and the default size - every one of
 * which is a slider on this page already. A second card, graph and registry
 * entry bought nothing but a second 17.8 GB readiness check.
 */

const CHROMA_PRESETS = [
  { label: 'Square', w: 1152, h: 1152 },
  { label: 'Portrait', w: 896, h: 1344 },
  { label: 'Wide', w: 1344, h: 896 },
  { label: 'Tall', w: 832, h: 1488 },
];

const CHROMA_NEGATIVE =
  'low quality, ugly, unfinished, out of focus, blurry, smudged, body horror, mutated creature, extra animal, fish, monster, malformed arms, deformed hands, fused anatomy, melted body, muddy skin artifacts, extra limbs, bad anatomy, duplicate face';

export const ChromaTxt2Img = () => {
  return (
    <Txt2ImgPage
      storageKey="chroma_txt2img"
      workflowId="chroma1-hd-txt2img"
      familyLabel="Chroma1-HD"
      promptContext="chroma"
      accent="emerald"
      loraPrefixes={[]}
      loraPacks={[]}
      aspectPresets={CHROMA_PRESETS}
      // The graph carries a real LoraLoader and the workflow registers a
      // `loras` parameter, so the picker works the moment a Chroma LoRA exists.
      enableLoras
      defaultSteps={40}
      defaultCfg={1.7}
      // Simple's range, kept: it is the safer floor of the two.
      defaultNegative={`${CHROMA_NEGATIVE}, restricted palette, flat colors`}
      maxSteps={60}
      showCfgControl
      minCfg={1.0}
      maxCfg={3.0}
    />
  );
};
