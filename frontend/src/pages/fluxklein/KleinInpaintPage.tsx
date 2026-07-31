import { useEffect, useRef, useState } from 'react';
import { Eraser, Loader2 } from 'lucide-react';
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
 * FLUX2-KLEIN uncensored reference edit.
 *
 * No mask required: the graph runs InpaintModelConditioning with noise_mask
 * False alongside ReferenceLatent, so it behaves as a reference edit rather than
 * a masked inpaint - "replace the banana with X" or "make it nude" works on the
 * whole image. Painting a mask in ComfyUI still restricts the change if you want
 * that, but FEDDA has no brush UI and does not need one here.
 *
 * Generation is local rather than via useWorkflowRun, which is video-only.
 */
const WORKFLOW_ID = 'klein-inpaint';

export const KleinInpaintPage = () => {
  const [prompt, setPrompt] = usePersistentState('klein_ip_prompt', '');
  const [seed, setSeed] = usePersistentState('klein_ip_seed', -1);
  const [steps, setSteps] = usePersistentState('klein_ip_steps', 4);
  const [cfg, setCfg] = usePersistentState('klein_ip_cfg', 1);
  const [denoise, setDenoise] = usePersistentState('klein_ip_denoise', 1);
  const [loraStrength, setLoraStrength] = usePersistentState('klein_ip_lora', 0.3);
  const [imageFile, setImageFile] = usePersistentState<string | null>('klein_ip_image', null);
  const [history, setHistory] = usePersistentState<string[]>('klein_ip_history', []);
  const [currentImage, setCurrentImage] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const pollRef = useRef<number | null>(null);

  const { toast } = useToast();
  const { previewUrl } = useComfyExecution();

  useEffect(() => () => { if (pollRef.current) window.clearInterval(pollRef.current); }, []);

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`${BACKEND_API.BASE_URL}/api/upload`, { method: 'POST', body: form });
      const data = await res.json();
      if (!data.success) throw new Error(data.detail || 'Upload failed');
      setImageFile(data.filename);
    } catch (err: any) {
      toast(err.message || 'Upload failed', 'error');
    } finally {
      setUploading(false);
    }
  };

  const uploadUrl = async (url: string) => {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to fetch image (${res.status})`);
      const blob = await res.blob();
      await upload(new File([blob], 'gallery-image.png', { type: blob.type || 'image/png' }));
    } catch (err: any) {
      toast(err.message || 'Could not load image from URL', 'error');
    }
  };

  const canGenerate = !!imageFile && !!prompt.trim() && !isGenerating;

  const handleGenerate = async () => {
    if (!canGenerate) return;
    setIsGenerating(true);
    setCurrentImage(null);
    toast('Editing… this can take a moment', 'info');
    try {
      const res = await fetch(`${BACKEND_API.BASE_URL}${BACKEND_API.ENDPOINTS.GENERATE}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflow_id: WORKFLOW_ID,
          params: {
            image: imageFile,
            prompt: prompt.trim(),
            steps,
            cfg,
            denoise,
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
            toast('Done', 'success');
          } else {
            toast('Finished, but no image came back', 'error');
          }
        } catch {
          /* transient errors shouldn't abort the run */
        }
      }, 3000);
    } catch (err: any) {
      toast(err.message || 'Failed to generate', 'error');
      setIsGenerating(false);
    }
  };

  const preview = imageFile
    ? `/comfy/view?filename=${encodeURIComponent(imageFile)}&type=input`
    : null;

  return (
    <WorkflowShell
      title="NSFW Edit"
      eyebrow="FLUX2-KLEIN"
      description="Describe the change in plain language — the model finds what you mean and leaves the rest of the photo alone."
      icon={Eraser}
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
                  <Eraser className="mx-auto mb-3 h-8 w-8 opacity-60" />
                )}
                <div className="text-sm font-semibold text-zinc-400">
                  {isGenerating ? 'Working…' : 'No result yet'}
                </div>
                <div className="mt-1 text-xs text-zinc-600">
                  Load an image and describe the change.
                </div>
              </div>
            </div>
          }
        >
          <div className="space-y-3">
            {currentImage ? <img src={currentImage} alt="Result" className="w-full rounded-xl" /> : null}
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
        <div className="grid gap-4 lg:grid-cols-[minmax(260px,320px)_minmax(0,1fr)]">
          <WorkflowSection title="Source Image">
            <UploadSlot
              preview={preview}
              uploading={uploading}
              onFile={upload}
              onUrl={uploadUrl}
              label="Image"
              hint="Click or drop"
              height={170}
            />
          </WorkflowSection>

          <WorkflowSection title="Instruction">
            <PromptAssistant
              context="flux2-klein"
              value={prompt}
              onChange={setPrompt}
              placeholder="replace the banana with a penis / make it nude / ..."
              minRows={4}
              accent="violet"
              label="What to change"
              enableCaption={false}
            />
            <p className="mt-2 text-[10px] leading-relaxed text-zinc-600">
              Plain language, no mask. Name the thing and what it becomes — the model
              finds it and leaves the rest of the photo alone.
            </p>
          </WorkflowSection>
        </div>

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
              <SliderField label="Consistency LoRA" value={loraStrength} onChange={setLoraStrength} min={0} max={1} step={0.05} />
            </div>
            <div className="space-y-3">
              <Field label="Seed (-1 = random)">
                <SeedField value={seed} onChange={setSeed} />
              </Field>
            </div>
          </div>

          {showAdvanced && (
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <SliderField label="CFG" value={cfg} onChange={setCfg} min={1} max={8} step={0.5} />
              <SliderField label="Denoise" value={denoise} onChange={setDenoise} min={0.5} max={1} step={0.05} />
            </div>
          )}

          <div className="mt-4">
            <GenerateButton
              onClick={handleGenerate}
              disabled={!canGenerate}
              isGenerating={isGenerating}
              label="Replace"
              requirementHint="Load an image and describe the change"
            />
          </div>
        </WorkflowSection>
      </div>
    </WorkflowShell>
  );
};
