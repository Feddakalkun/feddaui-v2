import { Txt2ImgPage } from '../zimage/ZImageTxt2Img';

/**
 * HiDream inpaint: paint over part of a picture, regenerate only that part.
 *
 * `enableMaskBrush` is the point of this page. The graph takes its mask from
 * LoadImage's MASK output, which is the alpha channel of the uploaded file - so
 * without a brush the upload arrives fully opaque, the mask is empty, and a run
 * returns the picture unchanged while reporting success.
 *
 * The defaults were measured rather than guessed (2026-08-14). Against the same
 * image, mask and seed: dpmpp_sde at cfg 1.2 produced garbled text where
 * deis/beta at cfg 1.0 followed the prompt - HiDream Fast is distilled and
 * degrades above cfg 1.0. Denoise has a narrow usable window: 0.55 left the
 * original untouched, 0.85 and 1.0 replaced the object being edited rather than
 * editing it. 0.72 sits in the middle of what works, roughly 0.65-0.78.
 */
export const HiDreamInpaint = () => {
  return (
    <Txt2ImgPage
      storageKey="hidream_inpaint"
      workflowId="hidream-inpaint"
      familyLabel="HiDream"
      capabilityLabel="Inpaint"
      promptContext="zimage"
      accent="violet"
      requireImageUpload
      imageParamKey="image"
      imageLabel="picture to edit"
      enableMaskBrush
      enableLoras={false}
      defaultSteps={16}
      maxSteps={40}
      defaultCfg={1.0}
      showCfgControl
      minCfg={0.8}
      maxCfg={3}
      showStrengthControl
      strengthLabel="Change strength"
      defaultStrength={0.72}
      defaultNegative=""
      characterPromptLabel="Prompt"
      characterPromptPlaceholder="What should appear in the painted area"
    />
  );
};
