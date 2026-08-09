import { Film } from 'lucide-react';
import { usePersistentState } from '../../hooks/usePersistentState';
import { InfoTip } from '../../components/ui/InfoTip';
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
    inputs: [] as { key: string; kind: 'image' | 'video'; label: string; hint: string; optional?: boolean }[],
    sized: true,
    lengthed: true,
  },
  img2vid: {
    workflowId: 'minimax-h3-img2vid',
    capability: 'Image to Video',
    description: 'Driven by one or two reference images.',
    inputs: [
      { key: 'image', kind: 'image' as const, label: 'Reference', hint: 'The subject to animate' },
      { key: 'image2', kind: 'image' as const, label: 'Second',
        hint: 'Optional pose or style reference', optional: true },
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
  // Both builds now share the full text encoder; only the diffusion model
  // differs. The encoder is pinned to `device: cpu` in the graph, so
  // quantising it saved no VRAM whatsoever - it cost prompt fidelity for
  // nothing, which is what made the Q2 pairing produce poor video.
  //
  // The labels quote weights, not peak: a 480x768x124 latent needs several GB
  // of activations on top, which is why 19 GB of int8 weights OOMs on a 24 GB
  // card even when the card starts empty.
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
          ? [{ kind: 'slider' as const, key: 'length', label: 'Frames', min: 25, max: 200, step: 1, defaultValue: 124,
              hint: 'Frames times width times height is what fills the card. Around 45 million total has run here; 47 million ran out of memory. Fewer frames is usually the cheapest way back under the line, since resolution costs quality faster than length does.' }]
          : []),
        { kind: 'slider', key: 'frame_rate', label: 'FPS', min: 8, max: 30, defaultValue: 24 },
        { kind: 'slider', key: 'steps', label: 'Steps', min: 4, max: 50, defaultValue: 20,
          hint: 'A straight multiplier on render time - measured here at about 19 seconds per step, so 20 steps is roughly six and a half minutes and 8 steps is under three. Try lowering it before you lower the resolution; if quality holds, the time was free.' },
        // The encoder is 15 GB and has finished its work before sampling
        // starts, so where it sits is a straight trade rather than a setting
        // with a right answer. On a 24 GB card holding it on the GPU leaves
        // too little for the Int8 model - measured: the UNet came up 728 MB
        // short with the encoder resident. On CPU the encode costs a couple of
        // minutes of silence. With more VRAM neither is true, so it is a
        // choice, not a default to argue about.
        {
          kind: 'chips',
          key: 'encoder_device',
          label: 'Text encoder',
          defaultValue: 'cpu',
          hint: 'The encoder is 15 GB. On CPU it takes a few minutes to load and read '
              + 'the prompt before anything appears to happen - that silence is normal, '
              + 'not a hang - but it leaves the GPU free for the larger Int8 model. On '
              + 'GPU it is seconds, and only fits alongside Q3 on a 24 GB card.',
          options: [
            { label: 'CPU — slow encode, frees 15 GB', value: 'cpu' },
            { label: 'GPU — fast, needs headroom', value: 'default' },
          ],
        },
        { kind: 'seed', key: 'seed' },
      ]}
      // Owned by the page, not a setting: it picks which graph runs.
      extraSections={(
        <div className="workflow-section">
          <div className="workflow-section-header">
            <div className="workflow-section-title flex items-center gap-1.5">
              Model size
              <InfoTip text={
                'Q3 is 3-bit and fits easily, but the precision loss shows first in bodies '
                + 'and hands - limbs melt on image-to-video long before a text-only clip '
                + 'looks wrong. Int8 holds together far better and needs about 4 GB more, '
                + 'which on a 24 GB card means something else has to give: keep the text '
                + 'encoder on CPU, and expect to trade some frames or resolution for it.'
              } />
            </div>
          </div>
          <div className="flex gap-1.5">
            {([['gguf', 'Q3 — 15 GB weights'], ['fp8', 'Int8 — 19 GB weights, tight']] as const).map(([value, label]) => (
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
