import { Users } from 'lucide-react';
import { WorkflowPage } from '../../components/layout/WorkflowPage';

/**
 * Two LoRAs, two jobs.
 *
 * They are not chained. The main LoRA feeds the sampler and drives the whole
 * composition; the detail LoRA feeds a DetailerForEach pass that repaints only
 * what Florence2 found. Chaining both into one model blends the identities
 * instead of keeping them apart, which is the usual way two-person shots fail.
 *
 * "What to detail" is the phrase Florence2 grounds on - `right woman`, `face`,
 * `the blonde`. It decides where the second LoRA is applied, so it is the
 * control that makes the split mean anything.
 *
 * This page replaced six near-identical dual-LoRA workflows and the twenty
 * three parameter face-swap graph that used to sit behind this id. The graph
 * beneath it is a different construction, so none of the old controls survived:
 * a value sent to an input a workflow does not declare is dropped without a
 * word, and a page of dead sliders is worse than a page with fewer.
 */
export const ZImageDualLoraPage = () => (
  <WorkflowPage
    workflowId="z-image-dual-lora"
    family="Z-Image"
    capability="Dual LoRA"
    description="One LoRA builds the picture, a second repaints the part you name."
    icon={Users}
    output="image"
    prompt={{
      context: 'zimage',
      label: 'Prompt',
      placeholder: 'Describe the whole picture…',
      negative: { placeholder: 'what to keep out' },
      rows: 4,
    }}
    promptBuilder={{ kind: 'image' }}
    settings={[
      {
        kind: 'text',
        key: 'detect_phrase',
        label: 'What to detail',
        placeholder: 'face — or "right woman", "the blonde"',
        defaultValue: 'face',
        rows: 1,
      },
      {
        kind: 'text',
        key: 'detail_prompt',
        label: 'Detail prompt',
        placeholder: 'Describes only the part being repainted',
        defaultValue: '',
        rows: 2,
      },
      {
        kind: 'slider',
        key: 'detail_denoise',
        label: 'Detail Strength',
        min: 0, max: 1, step: 0.05, defaultValue: 0.8,
        hint: 'How much the detail pass is allowed to change. 0 leaves the first result alone.',
      },
      { kind: 'slider', key: 'steps', label: 'Steps', min: 4, max: 25, defaultValue: 9 },
      { kind: 'slider', key: 'cfg', label: 'CFG', min: 1, max: 3, step: 0.1, defaultValue: 1.1 },
      { kind: 'seed', key: 'seed' },
      {
        kind: 'text',
        key: 'style',
        label: 'Style',
        placeholder: 'Appended to the prompt — lighting, film stock, mood',
        defaultValue: '',
        rows: 1,
        advanced: true,
      },
      { kind: 'slider', key: 'width', label: 'Width', min: 768, max: 1920, step: 64, defaultValue: 1152, advanced: true },
      { kind: 'slider', key: 'height', label: 'Height', min: 768, max: 1920, step: 64, defaultValue: 1152, advanced: true },
      {
        kind: 'slider',
        key: 'detail_size',
        label: 'Detail Size',
        min: 384, max: 1536, step: 64, defaultValue: 768,
        advanced: true,
        hint: 'Resolution the detail pass works at. Higher is sharper and slower.',
      },
    ]}
    loras={[
      {
        key: 'main',
        label: 'Main LoRA',
        match: ['zimage', 'z-image'],
        nameKey: 'lora_main_name',
        strengthKey: 'lora_main_strength',
      },
      {
        key: 'detail',
        label: 'Detail LoRA',
        match: ['zimage', 'z-image'],
        nameKey: 'lora_detail_name',
        strengthKey: 'lora_detail_strength',
      },
    ]}
    generateLabel="Generate"
    readyMessage="Image ready"
  />
);
