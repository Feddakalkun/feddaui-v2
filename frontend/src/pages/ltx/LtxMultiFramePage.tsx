import { useEffect, useState } from 'react';
import { Loader2, Play, Wand2 } from 'lucide-react';
import { PromptAssistant } from '../../components/ui/PromptAssistant';
import { LoraSelector } from '../../components/ui/LoraSelector';
import { useToast } from '../../components/ui/Toast';
import { BACKEND_API } from '../../config/api';
import { usePersistentState } from '../../hooks/usePersistentState';
import { useWorkflowRun } from '../../hooks/useWorkflowRun';
import { comfyService } from '../../services/comfyService';
import { Field } from '../../components/ui/FeddaPrimitives';
import { WorkflowShell, WorkflowSection } from '../../components/layout/WorkflowShell';
import { WorkflowVideoPreviewStrip } from '../../components/layout/WorkflowVideoPreviewStrip';
import { LiveSamplingPreview } from '../../components/workflows/LiveSamplingPreview';
import { BatchQueuePanel, ChipGroup, GenerateButton, SeedField, SliderField, UploadSlot } from '../../components/ui/WorkflowControls';
import { useComfyExecution } from '../../contexts/ComfyExecutionContext';
import { LTX_RATIOS, LTX_RESOLUTIONS, getLtxDimensions, getSafeLtxAspect, type LtxRatio, type LtxResolution } from '../../config/ltx';

const DIRECTIONS = ['Horizontal', 'Vertical'] as const;
const KF_COUNTS = ['2', '3', '4', '5'] as const;
const MAX_KF = 5;

/**
 * LTXVAddGuide snaps frame_idx to 0 or (8n + 1) — see get_latent_index() in
 * comfy_extras/nodes_lt.py, which does `(frame_idx - 1) // 8 * 8 + 1`. Snapping
 * here means the number shown in the UI is the frame actually used, instead of
 * silently drifting (24 would become 17, 48 -> 41, 96 -> 89).
 */
const snapFrame = (v: number) => (v <= 0 ? 0 : Math.max(1, Math.round((v - 1) / 8) * 8 + 1));

/** Evenly spread `count` keyframes across the clip, snapped to legal positions. */
const defaultFrames = (count: number, lengthSec: number) => {
  const span = snapFrame(Math.max(1, lengthSec * 24));
  return Array.from({ length: MAX_KF }, (_, i) =>
    i === 0 ? 0 : i < count ? snapFrame(Math.round((i * span) / (count - 1))) : span,
  );
};

export const LtxMultiFramePage = () => {
  const [prompt, setPrompt] = usePersistentState('ltx_mf_prompt', '');
  const [batchRaw, setBatchRaw] = usePersistentState('ltx_mf_batch_raw', '');
  const [aspectRatio, setAspectRatio] = usePersistentState('ltx_mf_ar', '16:9');
  const [resolution, setResolution] = usePersistentState<LtxResolution>('ltx_mf_res', 'M');
  const [direction, setDirection] = usePersistentState('ltx_mf_dir', 'Horizontal');
  const [lengthSec, setLengthSec] = usePersistentState('ltx_mf_len', 5);
  const [seed, setSeed] = usePersistentState('ltx_mf_seed', -1);
  const [kfCount, setKfCount] = usePersistentState<number>('ltx_mf_count', 3);
  const [guides, setGuides] = usePersistentState<number[]>('ltx_mf_guides', [0.9, 0.9, 0.9, 0.9, 0.9]);
  const [frames, setFrames] = usePersistentState<number[]>('ltx_mf_frames', defaultFrames(3, 5));
  const [files, setFiles] = usePersistentState<(string | null)[]>('ltx_mf_files', [null, null, null, null, null]);
  const [loraName, setLoraName] = usePersistentState('ltx_mf_lora_name', '');
  const [loraStrength, setLoraStrength] = usePersistentState('ltx_mf_lora_strength', 1.0);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [uploading, setUploading] = useState<boolean[]>([false, false, false, false, false]);
  const [availableLoras, setAvailableLoras] = useState<string[]>([]);

  const { toast } = useToast();
  const { previewUrl } = useComfyExecution();
  const run = useWorkflowRun({
    workflowId: 'ltx-flf3',
    currentKey: 'ltx_mf_current_video',
    historyKey: 'ltx_mf_history',
    outputKind: 'video',
    readyMessage: 'Video ready',
  });

  useEffect(() => {
    comfyService.getLoras().then((loras) => {
      setAvailableLoras(loras.filter((l) => l.replace(/\\/g, '/').toLowerCase().includes('ltx')));
    }).catch(() => {});
  }, []);

  const setAt = <T,>(arr: T[], i: number, v: T) => arr.map((x, j) => (j === i ? v : x));

  const uploadTo = async (index: number, file: File) => {
    setUploading((u) => setAt(u, index, true));
    try {
      const form = new FormData();
      form.append('file', file);
      const response = await fetch(`${BACKEND_API.BASE_URL}/api/upload`, { method: 'POST', body: form });
      const data = await response.json();
      if (!data.success) throw new Error(data.detail || 'Upload failed');
      setFiles((f) => setAt(f, index, data.filename));
    } catch (err: any) {
      toast(err.message || 'Upload failed', 'error');
    } finally {
      setUploading((u) => setAt(u, index, false));
    }
  };

  const uploadUrlTo = async (index: number, url: string) => {
    setUploading((u) => setAt(u, index, true));
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to fetch image (${res.status})`);
      const blob = await res.blob();
      await uploadTo(index, new File([blob], 'gallery-image.png', { type: blob.type || 'image/png' }));
    } catch (err: any) {
      toast(err.message || 'Could not load image from URL', 'error');
    } finally {
      setUploading((u) => setAt(u, index, false));
    }
  };

  const active = files.slice(0, kfCount);
  const allFilled = active.every(Boolean);

  const buildParams = (promptText: string) => {
    const dimsNow = getLtxDimensions(aspectRatio, resolution);
    // The workflow hardwires 5 LoadImage nodes, so every one needs a real file or
    // ComfyUI rejects the prompt outright. Unused slots reuse the last supplied
    // image and get strength 0, which makes their guide a no-op.
    const lastUsed = active[kfCount - 1] || active[0]!;
    const params: Record<string, unknown> = {
      prompt: promptText.trim(),
      aspect_ratio: getSafeLtxAspect(aspectRatio),
      direction,
      width: dimsNow.width,
      height: dimsNow.height,
      length_seconds: lengthSec,
      seed: seed === -1 ? Math.floor(Math.random() * 10_000_000_000) : seed,
      ...(loraName ? { lora_slot2: { on: true, lora: loraName, strength: loraStrength } } : {}),
    };
    for (let i = 0; i < MAX_KF; i++) {
      const inUse = i < kfCount;
      params[`image_${i + 1}`] = inUse ? files[i] : lastUsed;
      params[`guide_strength_${i + 1}`] = inUse ? guides[i] : 0;
      if (i > 0) {
        // The final keyframe uses -1 (= last frame), never an absolute index: the
        // real frame count comes from length_seconds inside the graph, so a computed
        // absolute could land past the end. Unused slots also get -1 — harmless at
        // strength 0 and always in range.
        const isLastActive = i === kfCount - 1;
        params[`frame_idx_${i + 1}`] = inUse && !isLastActive ? snapFrame(frames[i]) : -1;
      }
    }
    return params;
  };

  const handleGenerate = () => {
    if (!allFilled || !prompt.trim() || run.isGenerating) return;
    run.start(buildParams(prompt));
  };

  const handleBatchRun = (prompts: string[]) => {
    if (run.isGenerating) return;
    if (!allFilled) {
      toast(`Upload all ${kfCount} keyframes first`, 'error');
      return;
    }
    void run.startBatch(prompts.map(buildParams));
  };

  const applyCount = (n: number) => {
    setKfCount(n);
    setFrames(defaultFrames(n, lengthSec));
  };

  /**
   * Caption the keyframes and write the motion prompt, same as First/Last.
   * /api/ollama/flf-prompt takes exactly two images, so we send the first and the
   * last ACTIVE keyframe — the overall arc of the clip. The intermediate frames
   * shape the path but not the description, which is what you want in a prompt.
   */
  const [writingPrompt, setWritingPrompt] = useState(false);
  const writePromptFromFrames = async () => {
    if (!allFilled || writingPrompt) return;
    setWritingPrompt(true);
    try {
      const res = await fetch(`${BACKEND_API.BASE_URL}/api/ollama/flf-prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_first: files[0], image_last: files[kfCount - 1] }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.detail || 'Could not read the frames');
      if (data.prompt) setPrompt(data.prompt);
      toast(data.model ? `Prompt written with ${data.model}` : 'Prompt written from the keyframes', 'success');
    } catch (err: any) {
      toast(err.message || 'Could not write a prompt from the frames', 'error');
    } finally {
      setWritingPrompt(false);
    }
  };

  const canGenerate = allFilled && !!prompt.trim() && !run.isGenerating;
  const dims = getLtxDimensions(aspectRatio, resolution);

  return (
    <WorkflowShell
      title="Multi-Keyframe"
      eyebrow="LTX 2.3"
      description="Drive the whole clip through up to 5 keyframes — the sampler is pinned to every image you supply."
      icon={Play}
      isGenerating={run.isGenerating}
      canGenerate={canGenerate}
      workflowId="ltx-flf3"
      output={(
        <LiveSamplingPreview
          previewUrl={previewUrl}
          isRunning={run.isGenerating}
          hasOutput={!!run.currentMedia || run.history.length > 0}
          emptyState={
            <div className="flex min-h-[320px] items-center justify-center rounded-xl border border-dashed border-white/10 bg-black/20 p-3">
              <div className="text-center text-zinc-500">
                {run.isGenerating ? (
                  <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin opacity-60" />
                ) : (
                  <Play className="mx-auto mb-3 h-8 w-8 opacity-60" />
                )}
                <div className="text-sm font-semibold text-zinc-400">
                  {run.isGenerating ? 'Waiting for motion output' : 'No motion output yet'}
                </div>
                <div className="mt-1 text-xs text-zinc-600">
                  {run.isGenerating ? 'Motion frames will appear here while sampling progresses.' : `Fill ${kfCount} keyframes and generate.`}
                </div>
              </div>
            </div>
          }
        >
          <WorkflowVideoPreviewStrip
            title="LTX Multi-Keyframe Output"
            currentVideo={run.currentMedia}
            history={run.history}
            isGenerating={run.isGenerating}
            onSelectVideo={run.setCurrentMedia}
            onRemoveVideo={(url) => run.setHistory((prev) => prev.filter((v) => v !== url))}
            emptyHint={`Fill ${kfCount} keyframes and generate.`}
          />
        </LiveSamplingPreview>
      )}
    >
      <div className="space-y-4">
        <WorkflowSection
          title="Keyframes"
          actions={<ChipGroup options={KF_COUNTS} value={String(kfCount) as typeof KF_COUNTS[number]} onChange={(n) => applyCount(Number(n))} />}
        >
          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${kfCount}, minmax(0, 1fr))` }}>
            {Array.from({ length: kfCount }, (_, i) => (
              <div key={i}>
                <UploadSlot
                  preview={files[i] ? `/comfy/view?filename=${encodeURIComponent(files[i]!)}&type=input` : null}
                  uploading={uploading[i]}
                  onFile={(file) => uploadTo(i, file)}
                  onUrl={(url) => uploadUrlTo(i, url)}
                  label={`KF${i + 1}`}
                  hint={i === 0 ? 'Start' : i === kfCount - 1 ? 'End' : `Frame ${snapFrame(frames[i])}`}
                  height={124}
                />
              </div>
            ))}
          </div>
          <p className="mt-2 font-mono text-[9px] text-zinc-600">
            {allFilled
              ? `${kfCount} keyframes ready — frames ${frames.slice(0, kfCount).map((f, i) => (i === kfCount - 1 ? 'end' : snapFrame(f))).join(' → ')}`
              : `${active.filter(Boolean).length}/${kfCount} keyframes uploaded`}
          </p>
        </WorkflowSection>

        <WorkflowSection title="Motion Prompt">
          <button
            type="button"
            onClick={writePromptFromFrames}
            disabled={!allFilled || writingPrompt}
            className="mb-2 inline-flex items-center gap-1.5 rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-1.5 text-[11px] font-semibold text-violet-200 transition hover:border-violet-400/50 hover:bg-violet-500/15 disabled:cursor-not-allowed disabled:opacity-50"
            title="Caption the first and last keyframe and write the motion prompt between them"
          >
            {writingPrompt ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
            {writingPrompt ? 'Reading keyframes…' : 'Write prompt from frames'}
          </button>
          <PromptAssistant
            context="ltx-flf"
            value={prompt}
            onChange={setPrompt}
            placeholder="Describe the motion across the keyframes..."
            minRows={4}
            accent="violet"
            label="Motion Prompt"
            enableCaption={false}
          />
          <div className="mt-3">
            <BatchQueuePanel
              value={batchRaw}
              onChange={setBatchRaw}
              onRun={handleBatchRun}
              isGenerating={run.isGenerating}
              progress={run.batchProgress}
              autoFillContext="ltx-flf"
            />
          </div>
        </WorkflowSection>

        <WorkflowSection
          title="Run Settings"
          actions={(
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-600 transition hover:text-zinc-400"
            >
              {showAdvanced ? '− Per-keyframe' : '+ Per-keyframe'}
            </button>
          )}
        >
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-3">
              <Field label="Aspect Ratio">
                <ChipGroup options={LTX_RATIOS} value={aspectRatio as LtxRatio} onChange={setAspectRatio} />
              </Field>
              <Field label={`Resolution — ${dims.width}×${dims.height}`}>
                <ChipGroup options={LTX_RESOLUTIONS} value={resolution} onChange={setResolution} />
              </Field>
              <Field label="Direction">
                <ChipGroup options={DIRECTIONS} value={direction as typeof DIRECTIONS[number]} onChange={setDirection} />
              </Field>
              <SliderField
                label="Length"
                value={lengthSec}
                onChange={(v) => { setLengthSec(v); setFrames(defaultFrames(kfCount, v)); }}
                min={2}
                max={15}
                step={1}
                format={(v) => `${v}s`}
              />
            </div>

            <div className="space-y-3">
              <LoraSelector
                label="LTX LoRA"
                value={loraName}
                onChange={setLoraName}
                strength={loraStrength}
                onStrengthChange={setLoraStrength}
                options={availableLoras}
                accent="violet"
              />
              <Field label="Seed (-1 = random)">
                <SeedField value={seed} onChange={setSeed} />
              </Field>
            </div>
          </div>

          {showAdvanced && (
            <div className="mt-4 space-y-3">
              {Array.from({ length: kfCount }, (_, i) => (
                <div key={i} className="grid grid-cols-2 gap-4">
                  <SliderField
                    label={`KF${i + 1} guide`}
                    value={guides[i]}
                    onChange={(v) => setGuides((g) => setAt(g, i, v))}
                    min={0}
                    max={1}
                    step={0.05}
                  />
                  {i === 0 ? (
                    <Field label="KF1 frame">
                      <p className="font-mono text-[11px] text-zinc-500">0 (start, fixed)</p>
                    </Field>
                  ) : (
                    <SliderField
                      label={`KF${i + 1} frame — ${snapFrame(frames[i])}`}
                      value={frames[i]}
                      onChange={(v) => setFrames((f) => setAt(f, i, v))}
                      min={1}
                      max={Math.max(9, lengthSec * 24)}
                      step={8}
                    />
                  )}
                </div>
              ))}
              <p className="font-mono text-[9px] text-zinc-600">
                LTX only accepts frame 0 or 8n+1 — values snap, so the number shown is the frame used.
              </p>
            </div>
          )}

          <div className="mt-4">
            <GenerateButton
              onClick={handleGenerate}
              disabled={!canGenerate}
              isGenerating={run.isGenerating}
          onCancel={run.cancel}
              label="Generate Video"
              requirementHint={`Upload all ${kfCount} keyframes and enter a motion prompt`}
            />
          </div>
        </WorkflowSection>
      </div>
    </WorkflowShell>
  );
};
