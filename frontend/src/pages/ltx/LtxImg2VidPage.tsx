import { Play } from 'lucide-react';
import { usePersistentState } from '../../hooks/usePersistentState';
import { WorkflowPage } from '../../components/layout/WorkflowPage';
import { LTX_RATIOS, LTX_RESOLUTIONS, getLtxDimensions, type LtxResolution } from '../../config/ltx';

/**
 * LTX image-to-video.
 *
 * The precision chip picks a whole different graph rather than a setting -
 * gguf and fp8 are separate workflows - so storageKey is pinned to keep the
 * prompt and settings when you switch between them.
 */
const DEFAULT_NEGATIVE = 'blurry, low quality, deformed, jitter, artifacts';

export const LtxImg2VidPage = () => {
  const [precision, setPrecision] = usePersistentState<'gguf' | 'fp8'>('ltx_img2vid_precision', 'gguf');

  return (
    <WorkflowPage
      workflowId={precision === 'gguf' ? 'ltx-img2vid-gguf' : 'ltx-img2vid'}
      storageKey="ltx-img2vid"
      family="LTX 2.3"
      capability="Image to Video"
      description="Animate a still with LTX 2.3."
      icon={Play}
      output="video"
      inputs={[{ key: 'image', kind: 'image', label: 'Input', hint: 'The still to animate' }]}
      prompt={{
        context: 'ltx-img2vid',
        label: 'Motion Prompt',
        placeholder: 'Describe the motion…',
        negative: { placeholder: DEFAULT_NEGATIVE },
        rows: 4,
      }}
      // LoRAs under ltx/ only, and the first frame is what gets read.
      promptBuilder={{ loraPrefix: 'ltx', imageKey: 'image' }}
      settings={[
        {
          kind: 'chips',
          key: 'aspect_ratio',
          label: 'Aspect Ratio',
          defaultValue: '16:9',
          options: LTX_RATIOS.map((r) => ({ label: r, value: r })),
        },
        {
          kind: 'chips',
          key: 'resolution',
          label: 'Resolution',
          defaultValue: 'M',
          options: LTX_RESOLUTIONS.map((r) => ({ label: r, value: r })),
        },
        { kind: 'slider', key: 'length_seconds', label: 'Length (s)', min: 2, max: 15, defaultValue: 5 },
        { kind: 'seed', key: 'seed' },
      ]}
      loras={[
        { key: 'ltx1', label: 'LTX LoRA', match: ['ltx'] },
        { key: 'ltx2', label: 'LTX LoRA 2', match: ['ltx'] },
      ]}
      loraArrayKey="loras"
      extraParams={(values) => {
        const dims = getLtxDimensions(String(values.aspect_ratio ?? '16:9'), values.resolution as LtxResolution);
        return { width: dims.width, height: dims.height };
      }}
      // Owned by the page, not a setting: it chooses which graph runs, so it has
      // to take effect on click rather than at generate time.
      extraSections={(
        <div className="workflow-section">
          <div className="workflow-section-header">
            <div className="workflow-section-title">Model precision</div>
          </div>
          <div className="flex gap-1.5">
            {([['gguf', 'GGUF — lighter'], ['fp8', 'FP8 — sharper']] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setPrecision(value)}
                className={`rounded-md border px-3 py-1.5 text-[11px] font-semibold transition ${
                  precision === value
                    ? 'border-white/30 bg-white/10 text-white'
                    : 'border-white/10 text-white/45 hover:text-white/80'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
      generateLabel="Generate Video"
      generatingLabel="Generating video…"
      readyMessage="Video ready"
    />
  );
};
