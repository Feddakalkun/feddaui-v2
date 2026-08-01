import { ScanFace } from 'lucide-react';
import { WorkflowPage } from '../../components/layout/WorkflowPage';

/**
 * Detect faces and re-render each one at higher detail.
 *
 * The profile chip sets four sampler params at once. Lightning checkpoints are
 * distilled for few-step sampling and need a low CFG; a regular SDXL checkpoint
 * at 6 steps / CFG 2 comes out soft, so the two presets travel together rather
 * than being four separate sliders to get wrong.
 */
const PROFILES = {
  lightning: { steps: 6, cfg: 2, sampler_name: 'dpmpp_sde', scheduler: 'karras' },
  quality: { steps: 20, cfg: 7, sampler_name: 'dpmpp_2m', scheduler: 'karras' },
} as const;

export const FaceFixPage = () => (
  <WorkflowPage
    workflowId="facefix"
    family="SDXL"
    capability="Face Fixer"
    description="Find every face and re-render it at higher detail."
    icon={ScanFace}
    output="image"
    inputs={[{ key: 'image', kind: 'image', label: 'Input', hint: 'The photo to fix' }]}
    settings={[
      {
        kind: 'chips',
        key: 'profile',
        label: 'Profile',
        defaultValue: 'lightning',
        options: [
          { label: 'Lightning — fast', value: 'lightning' },
          { label: 'Quality — slower', value: 'quality' },
        ],
      },
      {
        kind: 'select',
        key: 'checkpoint',
        label: 'Checkpoint',
        node: 'CheckpointLoaderSimple',
        field: 'ckpt_name',
        filter: /xl|realvis|realism|sdxl/i,
        defaultValue: 'realvisxlV40_v40LightningBakedvae.safetensors',
      },
      { kind: 'slider', key: 'denoise', label: 'Denoise', min: 0.1, max: 1, step: 0.05, defaultValue: 0.5 },
      { kind: 'seed', key: 'seed' },
      { kind: 'slider', key: 'bbox_threshold', label: 'Detection threshold', min: 0.1, max: 0.9, step: 0.05, defaultValue: 0.5, advanced: true },
      { kind: 'slider', key: 'bbox_crop_factor', label: 'Crop factor', min: 1, max: 5, step: 0.1, defaultValue: 3, advanced: true },
    ]}
    extraParams={(values) => PROFILES[(values.profile as keyof typeof PROFILES) ?? 'lightning'] ?? PROFILES.lightning}
    generateLabel="Fix faces"
    generatingLabel="Fixing faces…"
    readyMessage="Faces fixed"
  />
);
