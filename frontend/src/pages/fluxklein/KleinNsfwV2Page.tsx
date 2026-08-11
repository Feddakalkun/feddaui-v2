import { Sparkles } from 'lucide-react';
import { WorkflowPage } from '../../components/layout/WorkflowPage';

/**
 * FLUX2-Klein text-to-image on the nsfwKlein checkpoint (V2/KLEIN-NSFW-v2).
 *
 * The prompt is registered against the PrimitiveStringMultiline, not the
 * CLIPTextEncode: that node's `text` is fed by a Text Concatenate, so a value
 * sent to it would be dropped and the graph would keep generating its baked
 * prompt. Same trap that made z-image-inpaint answer "sunset" every run.
 *
 * Size is width/height rather than a ratio picker on purpose. The graph's
 * AspectRatioImageSize has both dimensions set, and that node uses them
 * verbatim whenever both are above zero - its aspect_ratio widget only applies
 * when one is left at 0, so a ratio control here would do nothing.
 */
export const KleinNsfwV2Page = () => (
  <WorkflowPage
    workflowId="klein-nsfw-v2"
    family="FLUX2-KLEIN"
    capability="Unfiltered v2"
    description="Text to image on the unfiltered Klein checkpoint."
    icon={Sparkles}
    output="image"
    inputs={[]}
    prompt={{
      context: 'flux2-klein',
      label: 'Prompt',
      placeholder: 'Describe the picture…',
      negative: { placeholder: 'bad quality, blurry, low resolution' },
      rows: 4,
    }}
    promptBuilder={{ kind: 'image' }}
    settings={[
      { kind: 'slider', key: 'steps', label: 'Steps', min: 4, max: 30, defaultValue: 10 },
      { kind: 'slider', key: 'width', label: 'Width', min: 512, max: 2048, step: 64, defaultValue: 1504 },
      { kind: 'slider', key: 'height', label: 'Height', min: 512, max: 2048, step: 64, defaultValue: 1504 },
      { kind: 'seed', key: 'seed' },
      { kind: 'slider', key: 'cfg', label: 'CFG', min: 1, max: 8, step: 0.5, defaultValue: 1, advanced: true },
    ]}
    generateLabel="Generate"
    generatingLabel="Generating…"
    readyMessage="Image ready"
  />
);
