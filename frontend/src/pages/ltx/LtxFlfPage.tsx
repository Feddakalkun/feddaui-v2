import { useState } from 'react';
import { Loader2, Play, Wand2 } from 'lucide-react';
import { WorkflowPage } from '../../components/layout/WorkflowPage';
import { useToast } from '../../components/ui/Toast';
import { BACKEND_API } from '../../config/api';
import { usePersistentState } from '../../hooks/usePersistentState';
import { LTX_RATIOS, LTX_RESOLUTIONS, getLtxDimensions, getSafeLtxAspect } from '../../config/ltx';

/**
 * LTX first/last frame.
 *
 * Aspect and resolution are two chips whose combination decides width/height,
 * so those are derived in extraParams rather than being controls of their own.
 * Guide strengths sit behind + Advanced: 0.9 is how hard the sampler is pinned
 * to the keyframes, and below ~0.7 it invents its own middle instead of
 * morphing between them.
 */
export const LtxFlfPage = () => {
  const { toast } = useToast();
  const [prompt, setPrompt] = usePersistentState('wf_ltx-flf_prompt', '');
  const [firstFile] = usePersistentState<Record<string, string | null>>('wf_ltx-flf_inputs', {});
  const [writing, setWriting] = useState(false);

  const writePromptFromFrames = async () => {
    const first = firstFile?.image_first;
    const last = firstFile?.image_last;
    if (!first || !last || writing) return;
    setWriting(true);
    try {
      const res = await fetch(`${BACKEND_API.BASE_URL}/api/ollama/flf-prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_first: first, image_last: last }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.detail || 'Could not read the frames');
      if (data.prompt) setPrompt(data.prompt);
      toast(data.model ? `Prompt written with ${data.model}` : 'Prompt written from the two frames', 'success');
    } catch (err: any) {
      toast(err.message || 'Could not write a prompt from the frames', 'error');
    } finally {
      setWriting(false);
    }
  };

  const bothFrames = Boolean(firstFile?.image_first && firstFile?.image_last);

  return (
    <WorkflowPage
      workflowId="ltx-flf"
      family="LTX 2.3"
      capability="First / Last Frame"
      description="Generate motion between two keyframes with controlled duration and direction."
      icon={Play}
      output="video"
      inputs={[
        { key: 'image_first', kind: 'image', label: 'First Frame', hint: 'Where the motion starts' },
        { key: 'image_last', kind: 'image', label: 'Last Frame', hint: 'Where it ends up' },
      ]}
      prompt={{
        context: 'ltx-flf',
        label: 'Motion Prompt',
        placeholder: 'Describe the motion between the two frames…',
        rows: 4,
      }}
      promptActions={(
        <button
          type="button"
          onClick={writePromptFromFrames}
          disabled={!bothFrames || writing}
          title="Caption both frames and write the motion prompt between them"
          className="inline-flex items-center gap-1.5 rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-1.5 text-[11px] font-semibold text-violet-200 transition hover:border-violet-400/50 hover:bg-violet-500/15 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {writing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
          {writing ? 'Reading both frames…' : 'Write prompt from frames'}
        </button>
      )}
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
        {
          kind: 'chips',
          key: 'direction',
          label: 'Direction',
          defaultValue: 'Horizontal',
          options: [
            { label: 'Horizontal', value: 'Horizontal' },
            { label: 'Vertical', value: 'Vertical' },
          ],
        },
        { kind: 'slider', key: 'length_seconds', label: 'Length (s)', min: 2, max: 15, defaultValue: 5 },
        { kind: 'seed', key: 'seed' },
        { kind: 'slider', key: 'guide_strength_first', label: 'First Frame Guide', min: 0, max: 1, step: 0.05, defaultValue: 0.9, advanced: true },
        { kind: 'slider', key: 'guide_strength_last', label: 'Last Frame Guide', min: 0, max: 1, step: 0.05, defaultValue: 0.9, advanced: true },
      ]}
      loras={[{ key: 'lora_slot2', label: 'LTX LoRA', match: ['ltx'] }]}
      extraParams={(values) => {
        const dims = getLtxDimensions(String(values.aspect_ratio ?? '16:9'), values.resolution as any);
        return {
          aspect_ratio: getSafeLtxAspect(String(values.aspect_ratio ?? '16:9')),
          width: dims.width,
          height: dims.height,
        };
      }}
      generateLabel="Generate Video"
      generatingLabel="Generating video…"
      readyMessage="Video ready"
    />
  );
};
