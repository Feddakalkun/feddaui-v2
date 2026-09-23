import { Txt2ImgPage } from '../zimage/ZImageTxt2Img';

/**
 * FLUX Krea (GGUF Q8) text-to-image. FLUX.1-dev finetune, so it wants the
 * steps (20 - below ~15 skin and hair go soft) and defaults to 1024, not the
 * Z-Image 1920x1088. Its LoRAs are FLUX.1-dev LoRAs, not Z-Image ones.
 */
export const FluxKreaTxt2Img = () => {
  return (
    <Txt2ImgPage
      storageKey="flux_krea_txt2img"
      workflowId="flux-krea-gguf-txt2img"
      familyLabel="FLUX"
      capabilityLabel="Text to Image"
      promptContext="zimage"
      accent="violet"
      loraPrefixes={['flux']}
      defaultWidth={1024}
      defaultHeight={1024}
      defaultSteps={20}
      maxSteps={30}
      defaultCfg={1}
      showCfgControl
      minCfg={1}
      maxCfg={2}
      characterPromptLabel="Character / Trigger"
      characterPromptPlaceholder="LoRA trigger word + identity details"
    />
  );
};
