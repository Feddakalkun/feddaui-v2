import { Play } from 'lucide-react';
import { WorkflowPage } from '../../components/layout/WorkflowPage';

/**
 * WAN 2.2 uncensored image-to-video.
 *
 * The ratio chip drives three graph inputs, not one: AspectRatioResizeImage
 * takes a base aspect plus a direction, and width alone sets the resolution
 * (height is computed from the aspect when left at 0). Portrait ratios reuse
 * their landscape aspect string with Vertical direction.
 *
 * Two LoRA slots because the model splits into high- and low-noise passes.
 */

const RATIO = {
  '16:9': { aspect: '16:9', direction: 'Horizontal', width: 832 },
  '9:16': { aspect: '16:9', direction: 'Vertical', width: 480 },
  '1:1': { aspect: '1:1', direction: 'Horizontal', width: 672 },
  '4:3': { aspect: '4:3', direction: 'Horizontal', width: 768 },
  '3:4': { aspect: '4:3', direction: 'Vertical', width: 576 },
} as const;

const DEFAULT_NEGATIVE =
  '色调艳丽，过曝，静态，细节模糊不清，字幕，风格，作品，画作，画面，静止，整体发灰，最差质量，低质量';

export const Wan22XxxImg2VidPage = () => (
  <WorkflowPage
    workflowId="wan22xxx-img2vid"
    family="WAN 2.2"
    capability="Img2Vid Unfiltered"
    description="Animate a still with the unfiltered WAN 2.2 pass."
    icon={Play}
    output="video"
    inputs={[{ key: 'image', kind: 'image', label: 'Input', hint: 'The still to animate' }]}
    prompt={{
      context: 'wan-i2v',
      label: 'Motion Prompt',
      placeholder: 'Describe the motion…',
      defaultValue: '',
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
      { kind: 'slider', key: 'length', label: 'Length (s)', min: 2, max: 20, defaultValue: 10 },
      { kind: 'seed', key: 'seed', advanced: true },
    ]}
    loras={[
      { key: 'lora_high', label: 'High-noise LoRA', match: ['wan'] },
      { key: 'lora_low', label: 'Low-noise LoRA', match: ['wan'] },
    ]}
    extraParams={(values) => {
      const r = RATIO[(values.ratio as keyof typeof RATIO) ?? '16:9'] ?? RATIO['16:9'];
      return {
        aspect_ratio: r.aspect,
        direction: r.direction,
        width: r.width,
        negative: DEFAULT_NEGATIVE,
      };
    }}
    generateLabel="Generate Video"
    generatingLabel="Generating video…"
    readyMessage="Video ready"
  />
);
