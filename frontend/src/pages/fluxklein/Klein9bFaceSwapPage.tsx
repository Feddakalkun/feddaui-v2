import { Users } from 'lucide-react';
import { WorkflowPage } from '../../components/layout/WorkflowPage';

/**
 * Head swap on FLUX2-Klein 9B with the bfs-head LoRA (V2/KLEIN-9B-FACESWAP).
 *
 * Two pictures: the base image, whose face is masked, and the face to graft on.
 * The graph reads the mask from the base LoadImage - `easy isMaskEmpty` switches
 * between the masked and unmasked branch - so painting a mask in ComfyUI's
 * editor is what tells it where the head goes.
 *
 * Steps sit on the Flux2Scheduler as a literal here, unlike the other Klein
 * graphs where the scheduler is driven by an easy-int node.
 */
export const Klein9bFaceSwapPage = () => (
  <WorkflowPage
    workflowId="klein-9b-faceswap"
    family="FLUX2-KLEIN"
    capability="Head Swap 9B"
    description="Put the head from one picture onto another. Mask the face on the base image."
    icon={Users}
    output="image"
    inputs={[
      { key: 'image', kind: 'image', label: 'Base Image', hint: 'The picture that keeps its body, lighting and background — mask the face' },
      { key: 'face', kind: 'image', label: 'Face', hint: 'The head to transplant' },
    ]}
    prompt={{
      context: 'flux2-klein',
      label: 'Instruction',
      placeholder: 'head_swap: start with Picture 1 as the base image…',
      negative: { placeholder: 'bad quality, blurry, low resolution' },
      rows: 4,
    }}
    settings={[
      { kind: 'slider', key: 'steps', label: 'Steps', min: 2, max: 20, defaultValue: 4 },
      { kind: 'slider', key: 'lora_strength', label: 'Head LoRA', min: 0, max: 1, step: 0.01, defaultValue: 0.29 },
      { kind: 'seed', key: 'seed' },
      { kind: 'slider', key: 'cfg', label: 'CFG', min: 1, max: 8, step: 0.5, defaultValue: 1, advanced: true },
    ]}
    generateLabel="Swap"
    generatingLabel="Swapping…"
    readyMessage="Swap ready"
  />
);
