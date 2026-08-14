import { Txt2ImgPage } from '../zimage/ZImageTxt2Img';

/**
 * HiDream inpaint: paint over part of a picture, regenerate only that part.
 *
 * `enableMaskBrush` is the point of this page. The graph takes its mask from
 * LoadImage's MASK output, which is the alpha channel of the uploaded file - so
 * without a brush the upload arrives fully opaque, the mask is empty, and a run
 * returns the picture unchanged while reporting success.
 *
 * Sampler and cfg were measured (2026-08-14): dpmpp_sde at cfg 1.2 produced
 * garbled text where deis/beta at cfg 1.0 followed the prompt - HiDream Fast is
 * distilled and degrades above cfg 1.0.
 *
 * Denoise is 1.0 and cannot usefully be lower. The mask rides in the alpha
 * channel, and a browser canvas stores premultiplied alpha - so a pixel set to
 * alpha 0 loses its colour, and LoadImage hands the sampler a black hole where
 * the picture used to be (measured on a real upload: RGB 8,7,6 under the mask
 * against 130,121,113 outside). Anything below 1.0 keeps a share of that black
 * and returns it, which is why 0.72 painted a black blob and 0.55 "left the
 * original untouched" - it was preserving black, not the original.
 *
 * At 1.0 the masked area is regenerated from noise while InpaintCropImproved's
 * surrounding context (1.2x the mask) still conditions it, which is ordinary
 * inpainting and unaffected by what the destroyed pixels were. Low-denoise
 * editing needs the mask sent as its own file rather than in the alpha channel.
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
      defaultStrength={1.0}
      defaultNegative=""
      characterPromptLabel="Prompt"
      characterPromptPlaceholder="What should appear in the painted area"
    />
  );
};
