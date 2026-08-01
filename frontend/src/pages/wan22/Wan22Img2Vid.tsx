import { Video } from 'lucide-react';
import { usePersistentState } from '../../hooks/usePersistentState';
import { WorkflowPage } from '../../components/layout/WorkflowPage';

/**
 * WAN 2.2 image-to-video.
 *
 * Precision picks a whole different graph rather than a setting, so it is a
 * page-owned control and storageKey is pinned - otherwise switching would key
 * the stored prompt to the other workflow id and lose it.
 *
 * Two LoRA slots: the model runs a high-noise and a low-noise pass.
 */
export const Wan22Img2Vid = () => {
  const [precision, setPrecision] = usePersistentState<'gguf' | 'fp8'>('wan22i2v_precision', 'gguf');
  const [nsfw, setNsfw] = usePersistentState('wan22i2v_nsfw', true);

  return (
    <WorkflowPage
      workflowId={precision === 'gguf' ? 'wan22-img2vid-gguf' : 'wan22-img2vid'}
      storageKey="wan22-img2vid"
      family="WAN 2.2"
      capability="Image to Video"
      description="Animate a still with WAN 2.2."
      icon={Video}
      output="video"
      inputs={[{ key: 'image', kind: 'image', label: 'Input', hint: 'The still to animate' }]}
      prompt={{
        context: 'wan-i2v',
        label: 'Motion Prompt',
        placeholder: 'Describe the motion…',
        rows: 4,
      }}
      settings={[
        { kind: 'slider', key: 'length_seconds', label: 'Length (s)', min: 2, max: 20, defaultValue: 5 },
        { kind: 'seed', key: 'seed' },
      ]}
      loras={[
        { key: 'lora_high', label: 'High-noise LoRA', match: ['wan'] },
        { key: 'lora_low', label: 'Low-noise LoRA', match: ['wan'] },
      ]}
      extraParams={() => ({ nsfw })}
      extraSections={(
        <div className="workflow-section">
          <div className="workflow-section-header">
            <div className="workflow-section-title">Model</div>
          </div>
          <div className="flex flex-wrap items-center gap-4">
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
            <button
              type="button"
              onClick={() => setNsfw(!nsfw)}
              className={`rounded-md border px-3 py-1.5 text-[11px] font-semibold transition ${
                nsfw
                  ? 'border-rose-500/40 bg-rose-500/10 text-rose-200'
                  : 'border-white/10 text-white/45 hover:text-white/80'
              }`}
            >
              NSFW {nsfw ? 'on' : 'off'}
            </button>
          </div>
        </div>
      )}
      generateLabel="Generate Video"
      generatingLabel="Generating video…"
      readyMessage="Video ready"
    />
  );
};
