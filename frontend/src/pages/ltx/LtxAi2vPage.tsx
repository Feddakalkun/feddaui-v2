import { useEffect, useState } from 'react';
import { Loader2, Music, Volume2, Wand2 } from 'lucide-react';
import { AudioTimeline } from '../../components/ui/AudioTimeline';
import { InfoTip } from '../../components/ui/InfoTip';
import { PromptAssistant } from '../../components/ui/PromptAssistant';
import { useToast } from '../../components/ui/Toast';
import { BACKEND_API } from '../../config/api';
import { usePersistentState } from '../../hooks/usePersistentState';
import { useWorkflowRun } from '../../hooks/useWorkflowRun';
import { consumeHandoff } from '../../utils/workflowHandoff';
import { Field, NeutralButton } from '../../components/ui/FeddaPrimitives';
import { WorkflowShell, WorkflowSection } from '../../components/layout/WorkflowShell';
import { WorkflowVideoPreviewStrip } from '../../components/layout/WorkflowVideoPreviewStrip';
import { LiveSamplingPreview } from '../../components/workflows/LiveSamplingPreview';
import { BatchQueuePanel, ChipGroup, GenerateButton, SeedField, SliderField, UploadSlot } from '../../components/ui/WorkflowControls';
import { useComfyExecution } from '../../contexts/ComfyExecutionContext';
import { cn, inputBase } from '../../lib/styles';

const WIDTH_PRESETS = ['512', '640', '768', '1024', '1280'] as const;

// Younger / casual-sounding Edge voices surfaced at the top of the picker
export const SUGGESTED_EDGE_VOICES = [
  'en-US-AnaNeural',
  'en-GB-MaisieNeural',
  'en-US-JennyNeural',
  'en-US-AriaNeural',
  'en-US-AvaNeural',
  'en-US-EmmaNeural',
  'en-AU-NatashaNeural',
  'nb-NO-PernilleNeural',
  'nb-NO-IselinNeural',
];
const DEFAULT_NEGATIVE = 'blurry, low quality, still frame, frames, watermark, overlay, titles, has blurbox, has subtitles';

// The image says who, the audio says what - the prompt only picks how it is
// performed, and there are really only two answers. Presets instead of asking
// everyone to write the same two sentences.
const TALKING = 'close-up, she is talking, her lips moving in sync with the audio, natural mouth and jaw movement, subtle head motion and blinking, expressive face';
const SINGING = 'close-up, she is singing, mouth opening wide on sustained notes, lips and jaw moving in sync with the vocal, head swaying with the rhythm, eyes closing on the held notes, expressive performance';
const PERFORMANCE_PRESETS = [
  { label: 'Talking', text: TALKING },
  { label: 'Singing', text: SINGING },
];

export const LtxAi2vPage = () => {
  const [prompt, setPrompt] = usePersistentState('ltx_ai2v_prompt', TALKING);
  const [promptOpen, setPromptOpen] = useState(false);
  const [batchRaw, setBatchRaw] = usePersistentState('ltx_ai2v_batch_raw', '');
  const [negative, setNegative] = usePersistentState('ltx_ai2v_negative', DEFAULT_NEGATIVE);
  const [seed, setSeed] = usePersistentState('ltx_ai2v_seed', -1);
  const [steps, setSteps] = usePersistentState('ltx_ai2v_steps', 4);
  // default 0 = match the full audio length (new key resets the old stuck default of 5)
  const [duration, setDuration] = usePersistentState('ltx_ai2v_duration_v2', 0);
  const [audioStart, setAudioStart] = usePersistentState('ltx_ai2v_audio_start', 0);
  // Measured by AudioTimeline once it decodes the clip. Null until then, which
  // is why every check below is written to pass when it is not known yet.
  const [audioSeconds, setAudioSeconds] = useState<number | null>(null);
  const [width, setWidth] = usePersistentState('ltx_ai2v_width', '1024');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [imageFilename, setImageFilename] = usePersistentState<string | null>('ltx_ai2v_image_file', null);
  const [imageUploading, setImageUploading] = useState(false);
  const [audioFilename, setAudioFilename] = usePersistentState<string | null>('ltx_ai2v_audio_file', null);
  const [audioUploading, setAudioUploading] = useState(false);
  const [referenceCaptioning, setReferenceCaptioning] = useState(false);

  // In-page text-to-speech for the audio slot (Edge = fast, Chatterbox = natural GPU voice)
  const [ttsText, setTtsText] = usePersistentState('ltx_ai2v_tts_text', '');
  const [ttsVoice, setTtsVoice] = usePersistentState('ltx_ai2v_tts_voice', 'en-US-AvaNeural');
  const [ttsEngine, setTtsEngine] = usePersistentState<'edge' | 'chatterbox' | 'venice'>('ltx_ai2v_tts_engine', 'edge');
  // Venice writes its wav into ComfyUI's input directory itself, so this branch
  // skips the base64 -> File -> upload dance the local engines need.
  const [vnModels, setVnModels] = useState<{ id: string; voices: string[] }[]>([]);
  const [vnModel, setVnModel] = usePersistentState('ltx_ai2v_venice_model', 'tts-kokoro');
  const [vnVoice, setVnVoice] = usePersistentState('ltx_ai2v_venice_voice_v2', 'bf_lily');
  const [ttsCbVoice, setTtsCbVoice] = usePersistentState('ltx_ai2v_tts_cb_voice', '');
  const [ttsGenerating, setTtsGenerating] = useState(false);
  // Clone a voice out of a stretch of a public video. The range matters more
  // than the URL: a clone wants one speaker for a few clean seconds, and a
  // whole track with music under it produces a worse voice than ten good ones.
  const [cloneUrl, setCloneUrl] = usePersistentState('ltx_ai2v_clone_url', '');
  const [cloneStart, setCloneStart] = usePersistentState('ltx_ai2v_clone_start', 0);
  const [cloneEnd, setCloneEnd] = usePersistentState('ltx_ai2v_clone_end', 12);
  const [cloneName, setCloneName] = usePersistentState('ltx_ai2v_clone_name', '');
  const [cloning, setCloning] = useState(false);
  // Lipsync has had these since it was written; this page never got them,
  // so the same backend fields sat unused behind an identical voice picker.
  const [ttsRate, setTtsRate] = usePersistentState('ltx_ai2v_tts_rate', 1.0);
  const [ttsPitch, setTtsPitch] = usePersistentState('ltx_ai2v_tts_pitch', 0);
  const [edgeVoices, setEdgeVoices] = useState<Array<{ id: string; name: string }>>([]);
  const [cbVoices, setCbVoices] = useState<Array<{ id: string; name: string }>>([]);

  // Upscale (ImageScaleBy 1.5x) runs over EVERY frame at once on the GPU — on long
  // clips (a full song) that batch OOMs. Let the user skip it. Off => no-upscale graph.
  const [upscale, setUpscale] = usePersistentState('ltx_ai2v_upscale', true);

  const { toast } = useToast();
  const { previewUrl } = useComfyExecution();
  const run = useWorkflowRun({
    workflowId: upscale ? 'ltx-ai2v' : 'ltx-ai2v-noupscale',
    currentKey: 'ltx_ai2v_current_video',
    historyKey: 'ltx_ai2v_history',
    outputKind: 'video',
    readyMessage: 'Video ready',
  });

  const imagePreview = imageFilename ? `/comfy/view?filename=${encodeURIComponent(imageFilename)}&type=input` : null;
  const audioPreview = audioFilename ? `/comfy/view?filename=${encodeURIComponent(audioFilename)}&type=input` : null;

  const uploadTo = async (
    file: File,
    setFile: (filename: string) => void,
    setUploading: (value: boolean) => void,
  ) => {
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const response = await fetch(`${BACKEND_API.BASE_URL}/api/upload`, { method: 'POST', body: form });
      const data = await response.json();
      if (!data.success) throw new Error(data.detail || 'Upload failed');
      setFile(data.filename);
    } catch (err: any) {
      toast(err.message || 'Upload failed', 'error');
    } finally {
      setUploading(false);
    }
  };

  const uploadFromUrl = async (
    url: string,
    setFile: (filename: string) => void,
    setUploading: (value: boolean) => void,
    fallbackName: string,
  ) => {
    setUploading(true);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to fetch (${res.status})`);
      const blob = await res.blob();
      await uploadTo(new File([blob], fallbackName, { type: blob.type || 'application/octet-stream' }), setFile, setUploading);
    } catch (err: any) {
      toast(err.message || 'Could not load file from URL', 'error');
      setUploading(false);
    }
  };

  useEffect(() => {
    fetch(`${BACKEND_API.BASE_URL}/api/tts/edge-voices`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.success && Array.isArray(data.voices)) setEdgeVoices(data.voices);
      })
      .catch(() => {});
    fetch(`${BACKEND_API.BASE_URL}/api/tts/voices`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.success && Array.isArray(data.voices)) setCbVoices(data.voices);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (ttsEngine !== 'venice' || vnModels.length) return;
    fetch(`${BACKEND_API.BASE_URL}/api/venice/models?type=tts`)
      .then((r) => r.json())
      .then((d) => {
        if (d?.success === false) return;
        const rows = (d?.data || [])
          .map((m: any) => ({ id: String(m.id), voices: (m?.model_spec?.voices || []).map(String) }))
          .filter((m: any) => m.voices.length);
        if (!rows.length) return;
        setVnModels(rows);
        const current = rows.find((m: any) => m.id === vnModel) || rows[0];
        setVnModel(current.id);
        if (!current.voices.includes(vnVoice)) setVnVoice(current.voices[0]);
      })
      .catch(() => {});
  }, [ttsEngine]);

  /** Generates the TTS clip and loads it into the audio slot; returns the uploaded filename. */
  const generateVoiceClip = async (): Promise<string | null> => {
    if (!ttsText.trim() || ttsGenerating) return null;
    let uploadedName: string | null = null;
    setTtsGenerating(true);
    try {
      if (ttsEngine === 'venice') {
        const vr = await fetch(`${BACKEND_API.BASE_URL}/api/venice/speech`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: ttsText.trim(), model: vnModel, voice: vnVoice,
            speed: ttsRate || 1.0, format: 'wav',
          }),
        });
        const vd = await vr.json();
        if (!vr.ok || vd?.success === false) {
          throw new Error(vd?.detail || vd?.error || 'Venice speech failed');
        }
        uploadedName = vd.filename;
        setAudioFilename(vd.filename);
        toast(`Voice clip generated (${vd.voice})`, 'success');
        return uploadedName;
      }
      const res = await fetch(`${BACKEND_API.BASE_URL}/api/chat/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: ttsText.trim(),
          tts_engine: ttsEngine,
          voice_name: ttsVoice,
          reference_audio: ttsEngine === 'chatterbox' ? ttsCbVoice : '',
          cfg_scale: 0.5,
          speaking_rate: ttsRate,
          pitch: ttsPitch,
        }),
      });
      const data = await res.json();
      if (!data.success || !data.audio_base64) throw new Error(data.error || 'Voice generation failed');
      const bytes = Uint8Array.from(atob(data.audio_base64), (c) => c.charCodeAt(0));
      const file = new File([bytes], 'tts-voice.mp3', { type: data.mime_type || 'audio/mpeg' });
      await uploadTo(file, (name) => { uploadedName = name; setAudioFilename(name); }, setAudioUploading);
      toast('Voice clip generated and loaded', 'success');
    } catch (err: any) {
      toast(err.message || 'Voice generation failed', 'error');
    } finally {
      setTtsGenerating(false);
    }
    return uploadedName;
  };

  /** One click: generate the voice clip, then immediately start the video with it. */
  const voiceAndGenerate = async () => {
    if (!imageFilename || !prompt.trim() || run.isGenerating) return;
    const audioName = await generateVoiceClip();
    if (!audioName) return;
    run.start({ ...buildParams(prompt), audio: audioName });
  };

  // Consume a "Send to Workflow" handoff (image or TTS audio) on first mount
  useEffect(() => {
    const url = consumeHandoff('image');
    if (url) uploadFromUrl(url, setImageFilename, setImageUploading, 'handoff-image.png');
    const audioUrl = consumeHandoff('audio');
    if (audioUrl) uploadFromUrl(audioUrl, setAudioFilename, setAudioUploading, 'tts-voice.mp3');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buildPromptFromReference = async () => {
    if (!imageFilename || !imagePreview || referenceCaptioning) return;
    setReferenceCaptioning(true);
    try {
      const imageResponse = await fetch(imagePreview);
      if (!imageResponse.ok) throw new Error('Could not read reference image');
      const blob = await imageResponse.blob();
      const file = new File([blob], imageFilename, { type: blob.type || 'image/png' });
      const form = new FormData();
      form.append('file', file);
      form.append('context', 'ltx-lipsync');
      const response = await fetch(
        `${BACKEND_API.BASE_URL}${BACKEND_API.ENDPOINTS.OLLAMA_CAPTION}`,
        { method: 'POST', body: form },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.detail || 'Prompt caption failed');
      setPrompt(data.caption ?? '');
      toast(data.model ? `Prompt built with ${data.model}` : 'Prompt built from reference image', 'success');
    } catch (err: any) {
      toast(err.message || 'Could not build prompt from reference image', 'error');
    } finally {
      setReferenceCaptioning(false);
    }
  };

  /**
   * An offset chosen for a previous clip is not a setting worth keeping.
   *
   * It persists, so it outlives the audio it made sense for. Silently starting
   * from 0 would be surprising; leaving it produces an empty waveform and a
   * tensor-shape error several nodes downstream. Reset, and say why.
   */
  useEffect(() => {
    if (audioSeconds === null || audioStart === 0) return;
    if (audioStart < audioSeconds) return;
    setAudioStart(0);
    toast(
      `Audio start was ${audioStart}s, but this clip is only ${audioSeconds.toFixed(1)}s long - reset to 0`,
      'info',
    );
  }, [audioSeconds, audioStart]);

  /** Why this run cannot work, or null if it can. */
  const audioProblem = (): string | null => {
    if (audioSeconds === null) return null;
    if (audioStart >= audioSeconds) {
      return `Audio start (${audioStart}s) is at or past the end of a ${audioSeconds.toFixed(1)}s clip - there would be no audio to animate`;
    }
    return null;
  };

  /** Fetch the range, keep it as a named voice, and select it. */
  const cloneVoiceFromUrl = async () => {
    if (!cloneUrl.trim() || cloning) return;
    setCloning(true);
    try {
      const res = await fetch(`${BACKEND_API.BASE_URL}/api/tts/voices/from-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: cloneUrl.trim(),
          start: cloneStart,
          end: cloneEnd,
          name: cloneName.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || data?.success === false) {
        throw new Error(data?.detail || data?.error || 'Could not clone that voice');
      }
      // Refresh the list before selecting, or the new id has nothing to match.
      const listed = await fetch(`${BACKEND_API.BASE_URL}/api/tts/voices`).then((r) => r.json());
      setCbVoices(listed?.voices || []);
      setTtsEngine('chatterbox');
      setTtsCbVoice(data.voice.id);
      toast(`Voice "${data.voice.name}" cloned and selected`, 'success');
    } catch (err: any) {
      toast(err.message || 'Could not clone that voice', 'error');
    } finally {
      setCloning(false);
    }
  };

  const buildParams = (promptText: string) => ({
    image: imageFilename,
    audio: audioFilename,
    prompt: promptText.trim(),
    negative: negative.trim(),
    seed: seed === -1 ? Math.floor(Math.random() * 10_000_000_000) : seed,
    steps,
    width: parseInt(width, 10),
    // end_time is an absolute position: start + length; 0 = play to end of clip
    duration: duration === 0 ? 0 : audioStart + duration,
    audio_start: audioStart,
  });

  const handleGenerate = () => {
    if (!imageFilename || !audioFilename || !prompt.trim() || run.isGenerating) return;
    const problem = audioProblem();
    if (problem) { toast(problem, 'error'); return; }
    run.start(buildParams(prompt));
  };

  const handleBatchRun = (prompts: string[]) => {
    if (run.isGenerating) return;
    if (!imageFilename || !audioFilename) {
      toast('Upload a reference image and an audio clip first', 'error');
      return;
    }
    const problem = audioProblem();
    if (problem) { toast(problem, 'error'); return; }
    void run.startBatch(prompts.map(buildParams));
  };

  const canGenerate = !!imageFilename && !!audioFilename && !!prompt.trim() && !run.isGenerating;

  return (
    <WorkflowShell
      title="Audio to Video"
      eyebrow="LTX 2.3"
      description="Animate a reference image driven by an audio clip — motion and expression follow the audio track."
      icon={Music}
      isGenerating={run.isGenerating}
      canGenerate={canGenerate}
      workflowId={upscale ? 'ltx-ai2v' : 'ltx-ai2v-noupscale'}
      output={(
        <LiveSamplingPreview
          previewUrl={previewUrl}
          isRunning={run.isGenerating}
          hasOutput={!!run.currentMedia}
          emptyState={
            <div className="flex min-h-[320px] items-center justify-center rounded-xl border border-dashed border-white/10 bg-black/20 p-3">
              <div className="text-center text-zinc-500">
                {run.isGenerating ? (
                  <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin opacity-60" />
                ) : (
                  <Music className="mx-auto mb-3 h-8 w-8 opacity-60" />
                )}
                <div className="text-sm font-semibold text-zinc-400">
                  {run.isGenerating ? 'Waiting for video output' : 'No video output yet'}
                </div>
                <div className="mt-1 text-xs text-zinc-600">
                  {run.isGenerating ? 'Preview frames will appear here while sampling progresses.' : 'Upload an image and an audio clip, then generate to see results here.'}
                </div>
              </div>
            </div>
          }
        >
          <WorkflowVideoPreviewStrip
            currentVideo={run.currentMedia}
            history={run.history}
            onSelectVideo={run.setCurrentMedia}
            onRemoveVideo={(url) => run.setHistory((prev) => prev.filter((v) => v !== url))}
            isGenerating={run.isGenerating}
            title="LTX AI2V Output"
            emptyHint="Upload an image and an audio clip, then generate to see results here."
          />
        </LiveSamplingPreview>
      )}
    >
      <div className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-2">
          <WorkflowSection title="Reference Image">
            <UploadSlot
              preview={imagePreview}
              uploading={imageUploading}
              onFile={(file) => uploadTo(file, setImageFilename, setImageUploading)}
              onUrl={(url) => uploadFromUrl(url, setImageFilename, setImageUploading, 'gallery-image.png')}
              label="Reference Image"
              hint="Click or drop jpg/png"
            />
            {imageFilename && <p className="mt-2 truncate font-mono text-[9px] text-zinc-600">{imageFilename}</p>}
          </WorkflowSection>

          <WorkflowSection title="Audio Clip">
            <UploadSlot
              preview={audioPreview}
              uploading={audioUploading}
              onFile={(file) => uploadTo(file, setAudioFilename, setAudioUploading)}
              onUrl={(url) => uploadFromUrl(url, setAudioFilename, setAudioUploading, 'gallery-audio.mp3')}
              accept="audio/*,video/*"
              label="Audio Clip"
              hint="Click or drop mp3/wav/mp4 — full clip is used"
              previewKind="audio"
              filename={audioFilename ?? undefined}
            />
            <div className="mt-3 space-y-2 rounded-lg border border-white/10 bg-black/20 p-2.5">
              <p className="text-[9px] font-black uppercase tracking-widest text-white/25">Or generate voice from text</p>
              <textarea
                value={ttsText}
                onChange={(e) => setTtsText(e.target.value)}
                placeholder="Write what she should say..."
                rows={2}
                className={cn(inputBase, 'min-h-[52px] resize-y text-[12px]')}
              />
              <div className="flex gap-2">
                <select
                  value={ttsEngine}
                  onChange={(e) => setTtsEngine(e.target.value as 'edge' | 'chatterbox' | 'venice')}
                  className={cn(inputBase, 'min-w-0 flex-1 basis-0 text-[11px]')}
                >
                  <option value="edge">Edge (fast)</option>
                  <option value="chatterbox">Chatterbox (natural)</option>
                  <option value="venice">Venice (cloud)</option>
                </select>
                {ttsEngine === 'venice' && (
                  <>
                    <select
                      value={vnModel}
                      onChange={(e) => {
                        setVnModel(e.target.value);
                        const m = vnModels.find((x) => x.id === e.target.value);
                        if (m && !m.voices.includes(vnVoice)) setVnVoice(m.voices[0]);
                      }}
                      className={cn(inputBase, 'w-[150px] text-[11px]')}
                    >
                      {(vnModels.length ? vnModels : [{ id: vnModel, voices: [] }]).map((m) => (
                        <option key={m.id} value={m.id}>{m.id}</option>
                      ))}
                    </select>
                    <select
                      value={vnVoice}
                      onChange={(e) => setVnVoice(e.target.value)}
                      className={cn(inputBase, 'w-[130px] text-[11px]')}
                    >
                      {(vnModels.find((m) => m.id === vnModel)?.voices || [vnVoice]).map((v) => (
                        <option key={v} value={v}>{v}</option>
                      ))}
                    </select>
                  </>
                )}
                {ttsEngine === 'chatterbox' && (
                  <select
                    value={ttsCbVoice}
                    onChange={(e) => setTtsCbVoice(e.target.value)}
                    className={cn(inputBase, 'min-w-0 flex-1 basis-0 text-[11px]')}
                  >
                    <option value="">Default — natural female</option>
                    {cbVoices.map((v) => (
                      <option key={v.id} value={v.id}>{v.name}</option>
                    ))}
                  </select>
                )}
                {ttsEngine === 'edge' && (
                  <select
                    value={ttsVoice}
                    onChange={(e) => setTtsVoice(e.target.value)}
                    className={cn(inputBase, 'flex-1 text-[11px]')}
                  >
                    {edgeVoices.length === 0 && <option value="en-US-AvaNeural">en-US-Ava (default)</option>}
                    {edgeVoices.length > 0 && (
                      <optgroup label="★ Suggested — young / casual">
                        {edgeVoices.filter((v) => SUGGESTED_EDGE_VOICES.includes(v.id)).map((v) => (
                          <option key={`s-${v.id}`} value={v.id}>{v.name}</option>
                        ))}
                      </optgroup>
                    )}
                    {edgeVoices.length > 0 && (
                      <optgroup label="All voices">
                        {edgeVoices.map((v) => (
                          <option key={v.id} value={v.id}>{v.name}</option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                )}
                {/* Edge accepts both and the backend already forwards them;
                    this page simply never offered them, while Lipsync did. */}
                {ttsEngine === 'edge' && (
                <div className="mt-2 grid grid-cols-2 gap-3">
                  {/* Number fields, not sliders. This column is 71px wide, so a
                      50-step range gave 1.4px per step - you cannot aim that,
                      and widening the range only made it worse. Typing 3 is
                      exact at any width, and the arrow keys still nudge. */}
                  {([
                    ['Speed', ttsRate, setTtsRate, 0.75, 1.25, 0.01, 'x'],
                    ['Pitch', ttsPitch, setTtsPitch, -25, 25, 0.01, 'Hz'],
                  ] as const).map(([label, val, set, min, max, step, unit]) => (
                    <label key={label} className="block">
                      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                        {label}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          value={val}
                          min={min}
                          max={max}
                          step={step}
                          onChange={(e) => {
                            const n = Number(e.target.value);
                            if (Number.isFinite(n)) set(Math.min(max, Math.max(min, n)));
                          }}
                          className={cn(inputBase, 'w-full text-[11px]')}
                        />
                        <span className="text-[10px] text-zinc-500">{unit}</span>
                      </div>
                    </label>
                  ))}
                </div>
                )}
                <button
                  type="button"
                  onClick={() => { void generateVoiceClip(); }}
                  disabled={!ttsText.trim() || ttsGenerating}
                  className="flex items-center gap-1.5 rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-violet-300 transition-all hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {ttsGenerating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Volume2 className="h-3 w-3" />}
                  Voice
                </button>
                <button
                  type="button"
                  onClick={() => { void voiceAndGenerate(); }}
                  disabled={!ttsText.trim() || !imageFilename || !prompt.trim() || ttsGenerating || run.isGenerating}
                  title="Generate the voice clip and immediately start the video with it"
                  className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-white transition-all hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {(ttsGenerating || run.isGenerating) ? <Loader2 className="h-3 w-3 animate-spin" /> : <Music className="h-3 w-3" />}
                  Voice + Video
                </button>
              </div>

              <div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-2.5">
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                  Clone a voice from a video
                </div>
                <input
                  value={cloneUrl}
                  onChange={(e) => setCloneUrl(e.target.value)}
                  placeholder="YouTube or other video URL…"
                  className={cn(inputBase, 'text-[11px]')}
                />
                <div className="mt-2 flex items-end gap-2">
                  {([
                    ['Start', cloneStart, setCloneStart],
                    ['End', cloneEnd, setCloneEnd],
                  ] as const).map(([label, val, set]) => (
                    <label key={label} className="block w-[74px] shrink-0">
                      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                        {label}
                      </span>
                      <input
                        type="number"
                        min={0}
                        step={0.1}
                        value={val}
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          if (Number.isFinite(n)) set(Math.max(0, n));
                        }}
                        className={cn(inputBase, 'text-[11px]')}
                      />
                    </label>
                  ))}
                  <label className="block min-w-0 flex-1">
                    <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                      Name
                    </span>
                    <input
                      value={cloneName}
                      onChange={(e) => setCloneName(e.target.value)}
                      placeholder="from the video title"
                      className={cn(inputBase, 'text-[11px]')}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => { void cloneVoiceFromUrl(); }}
                    disabled={!cloneUrl.trim() || cloning}
                    className="flex shrink-0 items-center gap-1.5 rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-violet-300 transition-all hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {cloning ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
                    Clone
                  </button>
                </div>
                <p className="mt-1.5 text-[10px] leading-relaxed text-zinc-600">
                  Seconds. Only the audio is downloaded. Pick a stretch where one
                  person is speaking with nothing under it — ten clean seconds make
                  a better voice than a whole track. End 0 takes all of it.
                </p>
              </div>
            </div>
          </WorkflowSection>
        </div>

        {/* Lipsync barely needs a prompt: the image fixes who and the audio
            fixes what they say, so the text only picks a performance. Two
            presets cover almost every run, and the writing surface folds away
            behind them instead of being the first thing on the page. */}
        <WorkflowSection
          title="Performance"
          actions={(
            <div className="flex items-center gap-2">
              {PERFORMANCE_PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => { setPrompt(p.text); setPromptOpen(false); }}
                  className={
                    'rounded border px-2.5 py-1 text-[11px] transition ' +
                    (prompt.trim() === p.text
                      ? 'border-violet-500/50 bg-violet-500/10 text-violet-300'
                      : 'border-white/10 bg-white/[0.03] text-zinc-400 hover:text-zinc-200')
                  }
                >
                  {p.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setPromptOpen((v) => !v)}
                className="rounded border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-zinc-500 transition hover:text-zinc-300"
              >
                {promptOpen ? 'Hide prompt' : 'Edit prompt'}
              </button>
            </div>
          )}
        >
          {!promptOpen && (
            <p className="truncate text-[12px] text-white/35">{prompt.trim() || 'No prompt set'}</p>
          )}
          <div className={promptOpen ? undefined : 'hidden'}>
          <div className="mb-3 flex justify-end">
            <NeutralButton
              onClick={buildPromptFromReference}
              disabled={!imageFilename || referenceCaptioning}
            >
              {referenceCaptioning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
              Build From Reference
            </NeutralButton>
          </div>
          <PromptAssistant
            context="ltx-lipsync"
            value={prompt}
            onChange={setPrompt}
            placeholder="Describe the expression, energy, and presence you want synced to the audio..."
            minRows={4}
            accent="violet"
            label="Prompt"
            enableCaption
          />
          <div className="mt-3">
            <BatchQueuePanel
              value={batchRaw}
              onChange={setBatchRaw}
              onRun={handleBatchRun}
              isGenerating={run.isGenerating}
              progress={run.batchProgress}
              autoFillContext="ltx-lipsync"
            />
          </div>
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
              {showAdvanced ? '− Seed' : '+ Seed'}
            </button>
          )}
        >
          <div className="grid gap-4 lg:grid-cols-2">
            <Field label="Negative Prompt">
              <div className="space-y-1.5">
                <textarea
                  value={negative}
                  onChange={(event) => setNegative(event.target.value)}
                  className={cn(inputBase, 'min-h-[72px] resize-y')}
                  placeholder="Artifacts to avoid..."
                />
                <button
                  type="button"
                  onClick={() => setNegative(DEFAULT_NEGATIVE)}
                  className="text-[10px] text-zinc-600 transition hover:text-zinc-400"
                >
                  Reset to default
                </button>
              </div>
            </Field>

            <div className="space-y-3">
              <Field
                label="Target Width — height follows the image's aspect ratio"
                hint={'Only the width is chosen; the height follows whatever shape your '
                  + 'reference image already is, so a portrait stays a portrait. Wider '
                  + 'costs memory across every frame at once, which is why a long clip '
                  + 'can run at 768 and fail at 1280 with nothing else changed.'}
              >
                <ChipGroup options={WIDTH_PRESETS} value={width} onChange={setWidth} />
              </Field>
              {/* Was two range sliders, 0-120s and 0-600s, asking which second
                  to cut at against nothing you could see or hear. The timeline
                  draws the decoded waveform and plays only the selection, so
                  the phrase you are aiming at is visible before it costs a
                  generation. `duration` keeps its meaning: 0 is "to the end". */}
              <AudioTimeline
                onDuration={setAudioSeconds}
                src={audioPreview}
                start={audioStart}
                end={duration === 0 ? 0 : audioStart + duration}
                onChange={(s, e) => {
                  setAudioStart(Math.max(0, Math.round(s * 10) / 10));
                  setDuration(e === 0 ? 0 : Math.max(0.2, Math.round((e - s) * 10) / 10));
                }}
              />
              <label className="mt-1 flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] text-white/70">
                <span className="flex items-center gap-1.5">
                  Upscale 1.5&times;
                  <InfoTip text={
                    'Runs over every frame of the clip at once rather than one at a time, '
                    + 'so its memory cost grows with length, not resolution. A few seconds '
                    + 'is fine; a whole song will run out. Turning it off switches to a '
                    + 'separate graph with no upscale rather than just skipping a step.'
                  } />
                  <span className="text-white/30">(off on long clips to avoid OOM)</span>
                </span>
                <input type="checkbox" checked={upscale} onChange={(e) => setUpscale(e.target.checked)} className="h-4 w-4 accent-violet-500" />
              </label>
              <SliderField
                label="Steps"
                hint={'This is a distilled turbo model, built to finish in about four steps '
                  + 'rather than the twenty a normal sampler wants. More is not better '
                  + 'here; past roughly eight it mostly costs time. Start at 4 and only '
                  + 'raise it if the motion looks unfinished.'}
                value={steps}
                onChange={setSteps}
                min={4}
                max={12}
                step={1}
                format={(v) => `${v} (distilled turbo — 4 is fastest)`}
              />
            </div>
          </div>

          {showAdvanced && (
            <div className="mt-4">
              <Field label="Seed (-1 = random)">
                <SeedField value={seed} onChange={setSeed} />
              </Field>
            </div>
          )}

          <div className="mt-4">
            <GenerateButton
              onClick={handleGenerate}
              disabled={!canGenerate}
              isGenerating={run.isGenerating}
          onCancel={run.cancel}
              label="Generate Video"
              requirementHint="Upload a reference image, an audio clip, and enter a prompt"
            />
          </div>
        </WorkflowSection>
      </div>
    </WorkflowShell>
  );
};
