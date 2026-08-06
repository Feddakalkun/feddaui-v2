import { Play } from 'lucide-react';
import { usePersistentState } from '../../hooks/usePersistentState';
import { WorkflowPage } from '../../components/layout/WorkflowPage';
import { LTX_RATIOS, LTX_RESOLUTIONS, getLtxDimensions, type LtxResolution } from '../../config/ltx';

/**
 * LTX text-to-video.
 *
 * Same graph as img2vid with i2v conditioning bypassed and the frame input
 * replaced by a generated stand-in, so there is no image to upload and nothing
 * that can fail validation on a machine that never had the file.
 */
const DEFAULT_NEGATIVE = 'blurry, low quality, deformed, jitter, artifacts';

export const LtxT2VPage = () => {
  const [precision, setPrecision] = usePersistentState<'gguf' | 'fp8'>('ltx_t2v_precision', 'gguf');

  return (
    <WorkflowPage
      workflowId={precision === 'gguf' ? 'ltx-txt2vid-gguf' : 'ltx-txt2vid'}
      storageKey="ltx-txt2vid"
      family="LTX 2.3"
      capability="Text to Video"
      description="Video straight from a prompt."
      icon={Play}
      output="video"
      inputs={[]}
      prompt={{
        context: 'ltx-img2vid',
        label: 'Motion Prompt',
        placeholder: 'Describe the scene and the motion…',
        negative: { placeholder: DEFAULT_NEGATIVE },
        rows: 4,
      }}
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
