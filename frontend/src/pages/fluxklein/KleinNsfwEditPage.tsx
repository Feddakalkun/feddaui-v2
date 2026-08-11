import { Wand2 } from 'lucide-react';
import { WorkflowPage } from '../../components/layout/WorkflowPage';

/**
 * Unfiltered Klein edit with a Z-Image refine pass (V2/KLEIN-NSFW-EDIT).
 *
 * Two samplers in one graph: the Klein edit, then a low-denoise Z-Image pass
 * over the result. The second one has its own seed, steps, CFG and denoise, so
 * they are separate controls rather than one set pretending to drive both.
 *
 * The prompts are registered against the String Literal nodes, not the
 * CLIPTextEncodes - those take their text through Text Concatenate, which also
 * mixes in two Load Styles CSV entries the graph carries.
 *
 * Not surfaced: the Power Lora Loader (rgthree) on node 1275. The app's `loras`
 * input type is written for LoraLoaderModelOnly, and pointing it at a different
 * node class would be a control that silently does nothing.
 */
export const KleinNsfwEditPage = () => (
  <WorkflowPage
    workflowId="klein-nsfw-edit"
    family="FLUX2-KLEIN"
    capability="Unfiltered Edit"
    description="Edit a photo on the unfiltered checkpoint, then refine it through a Z-Image pass."
    icon={Wand2}
    output="image"
    inputs={[
      { key: 'image', kind: 'image', label: 'Input', hint: 'The photo to edit — click or drop' },
    ]}
    prompt={{
      context: 'flux2-klein',
      label: 'What to change',
      placeholder: 'Describe the finished picture…',
      negative: { placeholder: 'what to keep out' },
      rows: 4,
    }}
    promptBuilder={{ kind: 'image' }}
    settings={[
      { kind: 'slider', key: 'steps', label: 'Steps', min: 2, max: 20, defaultValue: 5 },
      { kind: 'seed', key: 'seed' },
      { kind: 'slider', key: 'refine_denoise', label: 'Refine Strength', min: 0, max: 1, step: 0.05, defaultValue: 0.2,
        hint: 'How much the Z-Image pass is allowed to change. 0 leaves the Klein result alone.' },
      { kind: 'slider', key: 'cfg', label: 'CFG', min: 1, max: 8, step: 0.5, defaultValue: 1, advanced: true },
      { kind: 'slider', key: 'shift', label: 'Refine Shift', min: 1, max: 6, step: 0.1, defaultValue: 3, advanced: true },
      { kind: 'slider', key: 'refine_steps', label: 'Refine Steps', min: 2, max: 20, defaultValue: 5, advanced: true },
      { kind: 'slider', key: 'refine_cfg', label: 'Refine CFG', min: 1, max: 8, step: 0.5, defaultValue: 1, advanced: true },
      { kind: 'seed', key: 'refine_seed', label: 'Refine Seed', advanced: true },
    ]}
    generateLabel="Edit"
    generatingLabel="Editing…"
    readyMessage="Edit ready"
  />
);
