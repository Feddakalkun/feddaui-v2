import { Music } from 'lucide-react';
import { usePersistentState } from '../../hooks/usePersistentState';
import { WorkflowPage } from '../../components/layout/WorkflowPage';

/**
 * LTX audio-to-video: a still plus an audio clip.
 *
 * Upscaling picks a different graph rather than being a setting, so it is a
 * page-owned control with storageKey pinned - otherwise toggling would key the
 * stored prompt to the other workflow id and lose it.
 */
const DEFAULT_NEGATIVE = 'blurry, low quality, deformed, jitter, artifacts';

export const LtxAi2vPage = () => {
  const [upscale, setUpscale] = usePersistentState('ltx_ai2v_upscale', true);

  return (
    <WorkflowPage
      workflowId={upscale ? 'ltx-ai2v' : 'ltx-ai2v-noupscale'}
      storageKey="ltx-ai2v"
      family="LTX 2.3"
      capability="Audio to Video"
      description="Drive motion from an audio clip over a still."
      icon={Music}
      output="video"
      inputs={[
        { key: 'image', kind: 'image', label: 'Image', hint: 'The still to animate' },
        { key: 'audio', kind: 'audio', label: 'Audio', hint: 'Drives the motion' },
      ]}
      prompt={{
        context: 'ltx-img2vid',
        label: 'Motion Prompt',
        placeholder: 'Describe the motion…',
        negative: { placeholder: DEFAULT_NEGATIVE },
        rows: 4,
      }}
      settings={[
        { kind: 'slider', key: 'width', label: 'Width', min: 512, max: 1280, step: 32, defaultValue: 768, asString: true },
        { kind: 'slider', key: 'steps', label: 'Steps', min: 4, max: 40, defaultValue: 20 },
        { kind: 'seed', key: 'seed' },
        { kind: 'slider', key: 'audio_start', label: 'Audio start (s)', min: 0, max: 60, defaultValue: 0, advanced: true },
        { kind: 'slider', key: 'length', label: 'Length (s) — 0 plays to the end', min: 0, max: 30, defaultValue: 0, advanced: true },
      ]}
      extraParams={(values) => {
        // duration is an absolute end position, not a length: start + length,
        // with 0 meaning play to the end of the clip.
        const start = Number(values.audio_start ?? 0);
        const length = Number(values.length ?? 0);
        return { duration: length === 0 ? 0 : start + length };
      }}
      extraSections={(
        <div className="workflow-section">
          <div className="workflow-section-header">
            <div className="workflow-section-title">Output</div>
          </div>
          <button
            type="button"
            onClick={() => setUpscale(!upscale)}
            className={`rounded-md border px-3 py-1.5 text-[11px] font-semibold transition ${
              upscale
                ? 'border-white/30 bg-white/10 text-white'
                : 'border-white/10 text-white/45 hover:text-white/80'
            }`}
          >
            Upscale {upscale ? 'on' : 'off'}
          </button>
        </div>
      )}
      generateLabel="Generate Video"
      generatingLabel="Generating video…"
      readyMessage="Video ready"
    />
  );
};
