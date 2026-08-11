import { Shirt } from 'lucide-react';
import { WorkflowPage } from '../../components/layout/WorkflowPage';

/**
 * FireRed Image Edit 1.1 with up to three reference images (firered/firered-v2).
 *
 * The graph carries two step/CFG pairs and a boolean that switches between
 * them: 8 steps at CFG 1 with the Lightning LoRA, 40 at CFG 4 without. The
 * boolean defaults to on, so the LoRA pair is what runs and is what this page
 * exposes as Steps and CFG. The other pair is registered but not shown - a
 * control that only takes effect when a switch you cannot see is flipped is
 * worse than no control.
 *
 * Node 143 is the picture being edited: it feeds FluxKontextImageScale, which
 * both text encoders take as image1 and the VAE encode takes as its latent.
 */
export const FireRedV2Page = () => (
  <WorkflowPage
    workflowId="firered-v2"
    family="FireRed"
    capability="Image Edit 1.1"
    description="Edit a photo against up to two reference pictures — swap a garment, an accessory, a background."
    icon={Shirt}
    output="image"
    inputs={[
      { key: 'image', kind: 'image', label: 'Image to Edit', hint: 'Referred to as Picture 1 in the prompt' },
      { key: 'image2', kind: 'image', label: 'Reference 2', hint: 'Picture 2 — optional', optional: true },
      { key: 'image3', kind: 'image', label: 'Reference 3', hint: 'Picture 3 — optional', optional: true },
    ]}
    prompt={{
      context: 'firered',
      label: 'What to change',
      placeholder: 'Replace the dress in Picture 1 with the one in Picture 2, keeping the pose and background…',
      negative: { placeholder: 'what to keep out' },
      rows: 4,
    }}
    promptBuilder={{ kind: 'image' }}
    settings={[
      { kind: 'slider', key: 'lora_steps', label: 'Steps', min: 4, max: 20, defaultValue: 8 },
      { kind: 'seed', key: 'seed' },
      { kind: 'slider', key: 'lora_cfg', label: 'CFG', min: 1, max: 8, step: 0.5, defaultValue: 1, advanced: true },
      { kind: 'slider', key: 'denoise', label: 'Denoise', min: 0.5, max: 1, step: 0.05, defaultValue: 1, advanced: true },
      { kind: 'slider', key: 'shift', label: 'Shift', min: 1, max: 6, step: 0.1, defaultValue: 3.1, advanced: true },
    ]}
    generateLabel="Edit"
    generatingLabel="Editing…"
    readyMessage="Edit ready"
  />
);
