import { Users } from 'lucide-react';
import { WorkflowPage } from '../../components/layout/WorkflowPage';

/**
 * Two characters in one image, each with their own LoRA.
 *
 * The trick is that the two LoRAs are not chained. Person 1's loader feeds the
 * main KSampler, so they drive the whole composition; person 2's feeds a
 * DetailerForEach pass that re-renders only their face. Chaining both into one
 * model would blend the identities instead of keeping them separate, which is
 * the usual failure mode for two-person shots.
 *
 * So "Person 2 details" is a separate field: the scene prompt describes the
 * whole picture, that one describes only the face the detailer repaints.
 */
export const ZImage2LorasPage = () => (
  <WorkflowPage
    workflowId="z-image-2loras-v2"
    family="Z-Image"
    capability="Two People"
    description="Two characters, two LoRAs — one drives the image, the other detail-passes its own face."
    icon={Users}
    output="image"
    prompt={{
      context: 'zimage',
      label: 'Scene',
      placeholder: 'Describe the whole picture — name both people and say who is where…',
      rows: 4,
    }}
    promptBuilder={{ kind: 'image' }}
    settings={[
      {
        kind: 'text',
        key: 'person1_prompt',
        label: 'Person 1 details',
        placeholder: 'Name, hair, skin — appended to the scene',
        defaultValue: '',
        rows: 2,
      },
      {
        kind: 'text',
        key: 'person2_prompt',
        label: 'Person 2 details',
        placeholder: 'Name, hair, look — used only by the detailer pass',
        defaultValue: '',
        rows: 2,
      },
      { kind: 'slider', key: 'steps', label: 'Steps', min: 4, max: 25, defaultValue: 9 },
      { kind: 'slider', key: 'cfg', label: 'CFG', min: 1, max: 3, step: 0.1, defaultValue: 1.1 },
      { kind: 'seed', key: 'seed' },
      { kind: 'slider', key: 'width', label: 'Width', min: 768, max: 1920, step: 64, defaultValue: 1152, advanced: true },
      { kind: 'slider', key: 'height', label: 'Height', min: 768, max: 1920, step: 64, defaultValue: 1152, advanced: true },
    ]}
    loras={[
      { key: 'p1', label: 'Person 1 LoRA', match: ['zimage', 'z-image'], nameKey: 'lora_person1', strengthKey: 'lora_person1_str' },
      { key: 'p2', label: 'Person 2 LoRA', match: ['zimage', 'z-image'], nameKey: 'lora_person2', strengthKey: 'lora_person2_str' },
    ]}
    // ImpactWildcardProcessor reads populated_text downstream, so the scene has
    // to land in both fields or the edit is ignored.
    extraParams={(_values, { prompt }) => ({ prompt_populated: prompt })}
    generateLabel="Generate"
    readyMessage="Image ready"
  />
);
