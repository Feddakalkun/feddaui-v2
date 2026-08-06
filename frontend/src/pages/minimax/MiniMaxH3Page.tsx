import { Film } from 'lucide-react';
import { usePersistentState } from '../../hooks/usePersistentState';
import { WorkflowPage } from '../../components/layout/WorkflowPage';

/**
 * MiniMax H3 - video with synchronised audio, in three modes.
 *
 * One component rather than three pages: the graphs differ only in what goes
 * in. Everything past that - prompt, size, sampler, output - is identical, and
 * three near-copies would drift the moment one of them was touched.
 *
 * Video Edit takes its length and height from the source clip (the graph reads
 * them off VHS_VideoInfo), so it offers neither.
 */

type Mode = 'txt2vid' | 'img2vid' | 'videdit';

const DEFAULT_NEGATIVE = 'blurry, low quality, deformed, jitter, artifacts';

const MODES = {
  txt2vid: {
    workflowId: 'minimax-h3-txt2vid',
    capability: 'Text to Video',
    description: 'Video and synchronised audio straight from a prompt.',
    inputs: [] as { key: string; kind: 'image' | 'video'; label: string; hint: string }[],
    sized: true,
    lengthed: true,
  },
  img2vid: {
    workflowId: 'minimax-h3-img2vid',
    capability: 'Image to Video',
    description: 'Driven by one or two reference images.',
    inputs: [
      { key: 'image', kind: 'image' as const, label: 'Reference', hint: 'The subject to animate' },
      { key: 'image2', kind: 'image' as const, label: 'Second', hint: 'Optional pose or style reference' },
    ],
    sized: true,
    lengthed: true,
  },
  videdit: {
    workflowId: 'minimax-h3-videdit',
    capability: 'Video Edit',
    description: 'Re-drive an existing clip.',
    inputs: [
      { key: 'video', kind: 'video' as const, label: 'Source', hint: 'The clip to re-drive' },
    ],
    // Height and frame count come off the source clip inside the graph.
    sized: false,
    lengthed: false,
  },
} as const;

export const MiniMaxH3Page = ({ mode }: { mode: Mode }) => {
  const config = MODES[mode];
  // Quantised by default: the fp8 pair is 35 GB of weights and does not run on
  // a 24 GB card at all, so offering it first would hand most people an OOM.
  const [quant, setQuant] = usePersistentState<'gguf' | 'fp8'>('minimax_quant', 'gguf');

  return (
    <WorkflowPage
      workflowId={quant === 'gguf' ? `${config.workflowId}-gguf` : config.workflowId}
      storageKey={`minimax-h3-${mode}`}
      family="MiniMax H3"
      capability={config.capability}
      description={config.description}
      icon={Film}
      output="video"
      inputs={[...config.inputs]}
      prompt={{
        context: 'minimax-h3',
        label: 'Prompt',
        placeholder: 'Describe the scene, the motion and the sound…',
        negative: { placeholder: DEFAULT_NEGATIVE },
        rows: 4,
      }}
      promptBuilder={{ imageKey: mode === 'img2vid' ? 'image' : undefined }}
      settings={[
        { kind: 'slider', key: 'width', label: 'Width', min: 256, max: 1536, step: 32, defaultValue: 768 },
        ...(config.sized
          ? [{ kind: 'slider' as const, key: 'height', label: 'Height', min: 256, max: 1536, step: 32, defaultValue: 1344 }]
          : []),
        ...(config.lengthed
          ? [{ kind: 'slider' as const, key: 'length', label: 'Frames', min: 25, max: 200, step: 1, defaultValue: 124 }]
          : []),
        { kind: 'slider', key: 'frame_rate', label: 'FPS', min: 8, max: 30, defaultValue: 24 },
        { kind: 'slider', key: 'steps', label: 'Steps', min: 4, max: 50, defaultValue: 20, advanced: true },
        { kind: 'seed', key: 'seed' },
      ]}
      // Owned by the page, not a setting: it picks which graph runs.
      extraSections={(
        <div className="workflow-section">
          <div className="workflow-section-header">
            <div className="workflow-section-title">Model size</div>
          </div>
          <div className="flex gap-1.5">
            {([['gguf', 'Quantised — fits 24 GB'], ['fp8', 'Full — needs 32 GB+']] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setQuant(value)}
                className={`rounded-md border px-3 py-1.5 text-[11px] font-semibold transition ${
                  quant === value
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
