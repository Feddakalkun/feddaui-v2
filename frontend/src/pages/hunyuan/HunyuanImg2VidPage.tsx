import { Play } from 'lucide-react';
import { WorkflowPage } from '../../components/layout/WorkflowPage';

/**
 * Hunyuan image-to-video.
 *
 * Like WAN, the ratio chip feeds three graph inputs: explicit width/height plus
 * a base aspect and a direction, with portrait ratios reusing their landscape
 * aspect string.
 */
const RATIO = {
  '16:9': { w: 848, h: 480, aspect: '16:9', direction: 'Horizontal' },
  '9:16': { w: 480, h: 848, aspect: '16:9', direction: 'Vertical' },
  '1:1': { w: 624, h: 624, aspect: '1:1', direction: 'Horizontal' },
  '4:3': { w: 832, h: 624, aspect: '4:3', direction: 'Horizontal' },
  '3:4': { w: 624, h: 832, aspect: '4:3', direction: 'Vertical' },
} as const;

const DEFAULT_NEGATIVE = 'blurry, low quality, deformed, watermark, distorted';

export const HunyuanImg2VidPage = () => (
  <WorkflowPage
    workflowId="hunyuan-i2v"
    family="Hunyuan"
    capability="Image to Video"
    description="Animate a still with Hunyuan."
    icon={Play}
    output="video"
    inputs={[{ key: 'image', kind: 'image', label: 'Input', hint: 'The still to animate' }]}
    prompt={{
      context: 'hunyuan-i2v',
      label: 'Motion Prompt',
      placeholder: 'Describe the motion…',
      negative: { placeholder: DEFAULT_NEGATIVE },
      rows: 4,
    }}
    settings={[
      {
        kind: 'chips',
        key: 'ratio',
        label: 'Aspect Ratio',
        defaultValue: '16:9',
        options: Object.keys(RATIO).map((r) => ({ label: r, value: r })),
      },
      { kind: 'slider', key: 'length', label: 'Length (s)', min: 2, max: 15, defaultValue: 5 },
      { kind: 'seed', key: 'seed' },
    ]}
    loras={[{ key: 'hy', label: 'Hunyuan LoRA', match: ['hunyuan', 'hy'], paramKey: 'lora_slot1' }]}
    extraParams={(values) => {
      const r = RATIO[(values.ratio as keyof typeof RATIO) ?? '16:9'] ?? RATIO['16:9'];
      return { width: r.w, height: r.h, aspect_ratio: r.aspect, direction: r.direction };
    }}
    generateLabel="Generate Video"
    generatingLabel="Generating video…"
    readyMessage="Video ready"
  />
);
