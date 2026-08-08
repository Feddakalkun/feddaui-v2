import { Eraser } from 'lucide-react';
import { WorkflowPage } from '../../components/layout/WorkflowPage';

/**
 * FLUX2-KLEIN uncensored reference edit.
 *
 * No mask required: the graph runs InpaintModelConditioning with noise_mask
 * False alongside ReferenceLatent, so it behaves as a reference edit rather than
 * a masked inpaint — "replace the banana with X" works on the whole image.
 *
 * This was the page that had to hand-roll generate+poll because useWorkflowRun
 * was video-only; the hook now handles images, so it is a wrapper like the rest.
 */
export const KleinInpaintPage = () => (
  <WorkflowPage
    workflowId="klein-inpaint"
    family="FLUX2-KLEIN"
    capability="Reference Edit"
    description="Describe the change in plain language — the model finds what you mean and leaves the rest of the photo alone."
    icon={Eraser}
    output="image"
    inputs={[
      { key: 'image', kind: 'image', label: 'Input', hint: 'The photo to edit — click or drop' },
    ]}
    prompt={{
      context: 'flux2-klein',
      label: 'What to change',
      placeholder: 'replace the banana with a penis / make it nude / …',
      rows: 4,
    }}
    settings={[
      { kind: 'slider', key: 'steps', label: 'Steps', min: 2, max: 20, defaultValue: 4 },
      { kind: 'slider', key: 'lora_strength', label: 'Consistency LoRA', min: 0, max: 1, step: 0.05, defaultValue: 0.3 },
      { kind: 'seed', key: 'seed' },
      { kind: 'slider', key: 'cfg', label: 'CFG', min: 1, max: 8, step: 0.5, defaultValue: 1, advanced: true },
      { kind: 'slider', key: 'denoise', label: 'Denoise', min: 0.5, max: 1, step: 0.05, defaultValue: 1, advanced: true },
    ]}
    generateLabel="Replace"
    generatingLabel="Editing…"
    readyMessage="Edit ready"
  />
);
