import { useEffect, useRef, useState } from 'react';
import { Loader2, Users } from 'lucide-react';
import { PromptAssistant } from '../../components/ui/PromptAssistant';
import { useToast } from '../../components/ui/Toast';
import { BACKEND_API } from '../../config/api';
import { usePersistentState } from '../../hooks/usePersistentState';
import { comfyService } from '../../services/comfyService';
import { Field } from '../../components/ui/FeddaPrimitives';
import { WorkflowShell, WorkflowSection } from '../../components/layout/WorkflowShell';
import { LiveSamplingPreview } from '../../components/workflows/LiveSamplingPreview';
import { GenerateButton, SeedField, SliderField, UploadSlot } from '../../components/ui/WorkflowControls';
import { useComfyExecution } from '../../contexts/ComfyExecutionContext';

/**
 * FLUX2-KLEIN head swap.
 *
 * The graph concatenates the base image and the face source, then edits in one pass
 * with the bfs-head LoRA — it is not a mask-and-composite pipeline, so the instruction
 * text is load-bearing: it names "Picture 1" (base) and "Picture 2" (face) and states
 * what to preserve from each. The shipped wording is the default because it is tuned.
 *
 * Generation is handled locally rather than via useWorkflowRun: that hook is
 * video-only (`type OutputKind = 'video'`) and Txt2ImgPage supports a single image
 * slot, while a head swap needs two. Keeping the submit/poll here avoids widening
 * either shared module.
 */
const DEFAULT_INSTRUCTION =
  'head_swap: start with Picture 1 as the base image, keeping its lighting, environment, and background. ' +
  'remove the head from Picture 1 completely and replace it with the head from Picture 2, strictly preserving ' +
  'the hair, eye color, nose structure of Picture 2. copy the direction of the eye, head rotation and expression ' +
  'from Picture 1. blend the neck and skin tone seamlessly so the result looks like a single natural photograph.';

const DEFAULT_NEGATIVE =
  'bad quality, noise, blurry, worst quality, low resolution, blur, distortion, unnatural skin, seam, double head';

const WORKFLOW_ID = 'flux-headswap';

export const FluxHeadSwapPage = () => {
  const [prompt, setPrompt] = usePersistentState('flux_hs_prompt', DEFAULT_INSTRUCTION);
  const [negative, setNegative] = usePersistentState('flux_hs_negative', DEFAULT_NEGATIVE);
  const [steps, setSteps] = usePersistentState('flux_hs_steps', 4);
  const [seed, setSeed] = usePersistentState('flux_hs_seed', -1);
  const [loraStrength, setLoraStrength] = usePersistentState('flux_hs_lora', 1.0);
  const [baseFile, setBaseFile] = usePersistentState<string | null>('flux_hs_base', null);
  const [faceFile, setFaceFile] = usePersistentState<string | null>('flux_hs_face', null);
  const [history, setHistory] = usePersistentState<string[]>('flux_hs_history', []);
  const [currentImage, setCurrentImage] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [busy, setBusy] = useState({ base: false, face: false });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const pollRef = useRef<number | null>(null);

  const { toast } = useToast();
  const { previewUrl } = useComfyExecution();

  useEffect(() => () => { if (pollRef.current) window.clearInterval(pollRef.current); }, []);

  const upload = async (slot: 'base' | 'face', file: File) => {
    setBusy((b) => ({ ...b, [slot]: true }));
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`${BACKEND_API.BASE_URL}/api/upload`, { method: 'POST', body: form });
      const data = await res.json();
      if (!data.success) throw new Error(data.detail || 'Upload failed');
      (slot === 'base' ? setBaseFile : setFaceFile)(data.filename);
    } catch (err: any) {
      toast(err.message || 'Upload failed', 'error');
    } finally {
      setBusy((b) => ({ ...b, [slot]: false }));
    }
  };

  const uploadUrl = async (slot: 'base' | 'face', url: string) => {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to fetch image (${res.status})`);
      const blob = await res.blob();
      await upload(slot, new File([blob], 'gallery-image.png', { type: blob.type || 'image/png' }));
    } catch (err: any) {
      toast(err.message || 'Could not load image from URL', 'error');
    }
  };

  const canGenerate = !!baseFile && !!faceFile && !!prompt.trim() && !isGenerating;

  const handleGenerate = async () => {
    if (!canGenerate) return;
    setIsGenerating(true);
    setCurrentImage(null);
    toast('Swapping… this can take a moment', 'info');
    try {
      const res = await fetch(`${BACKEND_API.BASE_URL}${BACKEND_API.ENDPOINTS.GENERATE}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflow_id: WORKFLOW_ID,
          params: {
            image_base: baseFile,
            image_face: faceFile,
            prompt: prompt.trim(),
            negative: negative.trim(),
            steps,
            lora_strength: loraStrength,
            seed: seed === -1 ? Math.floor(Math.random() * 10_000_000_000) : seed,
            client_id: comfyService.clientId,
          },
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.detail || 'Failed to start generation');

      const promptId = data.prompt_id;
      if (pollRef.current) window.clearInterval(pollRef.current);
      pollRef.current = window.setInterval(async () => {
        try {
          const r = await fetch(
            `${BACKEND_API.BASE_URL}${BACKEND_API.ENDPOINTS.GENERATE_STATUS}/${promptId}?workflow_id=${WORKFLOW_ID}`,
          );
          const s = await r.json();
          if (s.status !== 'completed') return;
          if (pollRef.current) window.clearInterval(pollRef.current);
          pollRef.current = null;
          setIsGenerating(false);
          const images: Array<{ filename: string; subfolder?: string; type?: string }> = s.images ?? [];
          if (images.length) {
            const img = images[images.length - 1];
            const url = `/comfy/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder || '')}&type=${img.type || 'output'}`;
            setCurrentImage(url);
            setHistory((prev) => (prev.includes(url) ? prev : [url, ...prev.slice(0, 29)]));
            toast('Head swap ready', 'success');
          } else {
            toast('Finished, but no image came back', 'error');
          }
        } catch {
          /* keep polling — a transient error shouldn't abort the run */
        }
      }, 3000);
    } catch (err: any) {
      toast(err.message || 'Failed to generate', 'error');
      setIsGenerating(false);
    }
  };

  const preview = (f: string | null) =>
    f ? `/comfy/view?filename=${encodeURIComponent(f)}&type=input` : null;

  return (
    <WorkflowShell
      title="Head Swap"
      eyebrow="FLUX2-KLEIN"
      description="Put the head from one portrait onto another image, keeping the base lighting and background."
      icon={Users}
      isGenerating={isGenerating}
      canGenerate={canGenerate}
      workflowId={WORKFLOW_ID}
      output={(
        <LiveSamplingPreview
          previewUrl={previewUrl}
          isRunning={isGenerating}
          hasOutput={!!currentImage || history.length > 0}
          emptyState={
            <div className="flex min-h-[320px] items-center justify-center rounded-xl border border-dashed border-white/10 bg-black/20 p-3">
              <div className="text-center text-zinc-500">
                {isGenerating ? (
                  <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin opacity-60" />
                ) : (
                  <Users className="mx-auto mb-3 h-8 w-8 opacity-60" />
                )}
                <div className="text-sm font-semibold text-zinc-400">
                  {isGenerating ? 'Swapping…' : 'No result yet'}
                </div>
                <div className="mt-1 text-xs text-zinc-600">Load a base image and a face, then generate.</div>
              </div>
            </div>
          }
        >
          <div className="space-y-3">
            {currentImage ? (
              <img src={currentImage} alt="Head swap result" className="w-full rounded-xl" />
            ) : null}
            {history.length > 1 ? (
              <div className="flex gap-2 overflow-x-auto">
                {history.map((url) => (
                  <button key={url} onClick={() => setCurrentImage(url)} className="shrink-0">
                    <img
                      src={url}
                      alt=""
                      className={`h-16 w-16 rounded-lg object-cover transition ${url === currentImage ? 'ring-2 ring-violet-400' : 'opacity-60 hover:opacity-100'}`}
                    />
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </LiveSamplingPreview>
      )}
    >
      <div className="space-y-4">
        <WorkflowSection title="Images">
          {/*
            Capped, not full-bleed. Two slots across 1540 px made each one 750x150
            - a 5:1 strip - so every portrait was cropped to a band regardless of
            what was uploaded. The shape was the bug, not the images.
          */}
          <div className="grid max-w-[760px] grid-cols-2 gap-3">
            <UploadSlot
              preview={preview(baseFile)}
              uploading={busy.base}
              onFile={(f) => upload('base', f)}
              onUrl={(u) => uploadUrl('base', u)}
              label="Base"
              hint="Picture 1 — body, lighting, background"
              height={300}
            />
            <UploadSlot
              preview={preview(faceFile)}
              uploading={busy.face}
              onFile={(f) => upload('face', f)}
              onUrl={(u) => uploadUrl('face', u)}
              label="Face"
              hint="Picture 2 — head to transplant"
              height={300}
            />
          </div>
          <p className="mt-2 font-mono text-[9px] text-zinc-600">
            {baseFile && faceFile
              ? 'Both images ready — the head from Face replaces the head in Base'
              : 'Base keeps its scene; Face supplies the head'}
          </p>
        </WorkflowSection>

        <WorkflowSection
          title="Instruction"
          actions={(
            <button
              type="button"
              onClick={() => setPrompt(DEFAULT_INSTRUCTION)}
              className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-600 transition hover:text-zinc-400"
            >
              Reset to default
            </button>
          )}
        >
          <PromptAssistant
            context="flux2-klein"
            value={prompt}
            onChange={setPrompt}
            placeholder="head_swap: ..."
            minRows={5}
            accent="violet"
            label="Instruction"
            enableCaption={false}
          />
          <p className="mt-2 text-[10px] leading-relaxed text-amber-300/70">
            Keep the “Picture 1” / “Picture 2” references — Picture 1 is the base, Picture 2 is the
            face. Swapping or removing them inverts the swap.
          </p>
        </WorkflowSection>

        <WorkflowSection
          title="Run Settings"
          actions={(
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-600 transition hover:text-zinc-400"
            >
              {showAdvanced ? '− Advanced' : '+ Advanced'}
            </button>
          )}
        >
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-3">
              <SliderField label="Steps" value={steps} onChange={setSteps} min={2} max={20} step={1} />
              <SliderField
                label="Head LoRA strength"
                value={loraStrength}
                onChange={setLoraStrength}
                min={0}
                max={1.5}
                step={0.05}
              />
            </div>
            <div className="space-y-3">
              <Field label="Seed (-1 = random)">
                <SeedField value={seed} onChange={setSeed} />
              </Field>
            </div>
          </div>

          {showAdvanced && (
            <div className="mt-4">
              <Field label="Negative prompt">
                <textarea
                  value={negative}
                  onChange={(e) => setNegative(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-zinc-300 outline-none transition focus:border-violet-400/40"
                />
              </Field>
            </div>
          )}

          <div className="mt-4">
            <GenerateButton
              onClick={handleGenerate}
              disabled={!canGenerate}
              isGenerating={isGenerating}
              label="Swap Head"
              requirementHint="Load a base image and a face source"
            />
          </div>
        </WorkflowSection>
      </div>
    </WorkflowShell>
  );
};
