import { Txt2ImgPage } from '../zimage/ZImageTxt2Img';

/**
 * FLUX2-KLEIN Unfiltered text-to-image.
 *
 * The module for this existed but had no page of its own and pointed at the
 * 'flux-txt2img' tab - the standard one - whose page hardcodes
 * workflowId="flux2klein-txt2img". So the tile said unfiltered and would have
 * run the normal model. Its own tab and its own workflow id fix that.
 *
 * Same controls as the standard page: the graph differs in the checkpoint
 * (nsfwKlein) and a baked consistency LoRA, not in what the user sets.
 */
export const FluxKleinUncensoredTxt2Img = () => {
  return (
    <Txt2ImgPage
      storageKey="flux_uncensored_txt2img"
      workflowId="flux2klein-uncensored-txt2img"
      familyLabel="FLUX"
      capabilityLabel="Unfiltered"
      promptContext="flux2-klein"
      accent="violet"
      // FLUX.1-dev LoRAs have incompatible dimensions and cause matmul errors.
      loraPrefixes={['flux2klein/']}
      loraPacks={['flux2klein']}
      defaultSteps={8}
      maxSteps={20}
      defaultCfg={1}
      showCfgControl
      minCfg={0.8}
      maxCfg={2}
      characterPromptLabel="Character / Trigger"
      characterPromptPlaceholder="LoRA identity phrase, trigger words, hair, face, body, outfit"
    />
  );
};
