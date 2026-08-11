/**
 * PromptAssistant — AI-powered prompt helper for all generation pages.
 *
 * Features:
 *  - ✦ Enhance  : rewrites the current prompt to be more cinematic/detailed
 *  - Drag & drop image onto the textarea → Ollama vision model captions it → fills the prompt
 *
 * Streams tokens directly into the textarea as they arrive so the user sees
 * the prompt being written word-by-word.
 *
 * Usage:
 *   <PromptAssistant context="zimage" value={prompt} onChange={setPrompt} accent="emerald" />
 *   <PromptAssistant context="wan-scene" value={v} onChange={set} compact />
 */

import { useRef, useState, useCallback } from 'react';
import type { DragEvent, ClipboardEvent } from 'react';
import { Wand2, Loader2, ImageIcon, X, Library } from 'lucide-react';
import { PromptLibraryPicker } from './PromptLibraryPicker';
import { BACKEND_API } from '../../config/api';

// ─── Types ───────────────────────────────────────────────────────────────────
export type PromptContext =
  | 'zimage'
  | 'ltx-img2vid' | 'ltx-flf' | 'ltx-lipsync'
  | 'wan-scene' | 'wan-i2v' | 'wan-story'
  | 'hunyuan-i2v'
  | 'flux2-klein'
  | 'qwen'
  | 'firered'
  | 'ideogram'
  | 'sdxl-inpaint' | 'sdxl-outpaint' | 'sdxl-depth' | 'sdxl-openpose'
  | 'steady-dancer'
  | 'minimax-h3';
export type AccentColor   = 'emerald' | 'violet' | 'sky';

interface PromptAssistantProps {
  context: PromptContext;
  workflowId?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  minRows?: number;       // textarea min-height in rows  (default 5)
  accent?: AccentColor;   // colour theme                 (default 'violet')
  enableCaption?: boolean; // allow image drag-to-caption (default true)
  label?: string;          // section label text          (default 'Prompt')
  compact?: boolean;       // minimal mode for scene accordions
  /** Single = one prompt. Multiple = one prompt per line, run as a batch. */
  mode?: 'single' | 'multiple';
  /** Omit to hide the Single/Multiple tabs entirely (pages with no batch support). */
  onModeChange?: (mode: 'single' | 'multiple') => void;
}

// ─── Accent colour helpers ────────────────────────────────────────────────────
const ACCENT_FOCUS: Record<AccentColor, string> = {
  emerald: 'focus:border-emerald-500/30 focus:bg-white/[0.04]',
  violet:  'focus:border-white/25      focus:bg-white/[0.04]',
  sky:     'focus:border-sky-500/30     focus:bg-white/[0.04]',
};
const ACCENT_RING: Record<AccentColor, string> = {
  emerald: 'ring-emerald-500/40',
  violet:  'ring-white/25',
  sky:     'ring-sky-500/40',
};
const ACCENT_BTN: Record<AccentColor, string> = {
  emerald: 'hover:text-emerald-400 hover:bg-emerald-500/10',
  violet:  'hover:text-zinc-100     hover:bg-white/[0.08]',
  sky:     'hover:text-sky-400     hover:bg-sky-500/10',
};
const ACCENT_SPIN: Record<AccentColor, string> = {
  emerald: 'text-emerald-400',
  violet:  'text-zinc-300',
  sky:     'text-sky-400',
};

// Strip LLM chatter: a leading "Here is a prompt...:" style preamble and wrapping quotes.
function cleanPrompt(s: string): string {
  let t = s.trim();
  t = t.replace(/^\s*(here\b|here's|sure\b|okay\b|ok\b|certainly\b|of course\b)[^\n]*:\s*/i, '').trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith('“') && t.endsWith('”')) || (t.startsWith("'") && t.endsWith("'"))) {
    t = t.slice(1, -1).trim();
  }
  return t;
}

// ─── SSE stream helper ────────────────────────────────────────────────────────
async function streamPrompt(
  url: string,
  body: object,
  onToken: (partial: string) => void,
  signal: AbortSignal,
): Promise<string> {
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ detail: resp.statusText }));
    throw new Error(err.detail || `HTTP ${resp.status}`);
  }

  const reader = resp.body!.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let result = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6);
      if (data === '[DONE]') return result;
      try {
        const parsed = JSON.parse(data);
        if (parsed.error) throw new Error(parsed.error);
        if (parsed.token) { result += parsed.token; onToken(result); }
      } catch (e) {
        if ((e as Error).message !== 'Unexpected end of JSON input') throw e;
      }
    }
  }
  return result;
}

// ─── Component ────────────────────────────────────────────────────────────────
export const PromptAssistant = ({
  context,
  workflowId,
  value,
  onChange,
  placeholder = 'Describe the scene...',
  minRows = 5,
  accent = 'violet',
  enableCaption = true,
  label = 'Prompt',
  compact = false,
  // Aliased: this component already has its own `mode` for the AI actions.
  mode: promptMode = 'single',
  onModeChange,
}: PromptAssistantProps) => {
  const [mode, setMode] = useState<'enhance' | 'caption' | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [captionModel, setCaptionModel] = useState<string | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const captionInputRef = useRef<HTMLInputElement | null>(null);
  const dragDepthRef = useRef(0);

  const hasImageInDataTransfer = useCallback((dt: DataTransfer | null) => {
    if (!dt) return false;
    if (dt.files?.length) {
      return Array.from(dt.files).some(file => file.type.startsWith('image/'));
    }
    if (dt.items?.length) {
      return Array.from(dt.items).some(
        item => item.kind === 'file' && item.type.startsWith('image/')
      );
    }
    return false;
  }, []);

  // ── Stream trigger ──────────────────────────────────────────────────────────
  const runStream = useCallback(async (reqMode: 'enhance') => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setMode(reqMode);
    onChange(''); // clear so the user sees fresh text streaming in

    try {
      const final = await streamPrompt(
        `${BACKEND_API.BASE_URL}${BACKEND_API.ENDPOINTS.OLLAMA_PROMPT}`,
        { context, mode: reqMode, current_prompt: value, workflow_id: workflowId },
        onChange,
        abortRef.current.signal,
      );
      const cleaned = cleanPrompt(final);
      if (cleaned !== final) onChange(cleaned); // drop any "Here is a prompt:" preamble / wrapping quotes
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        // Put the original prompt back on error
        onChange(value);
        console.error('[PromptAssistant]', err.message);
      }
    } finally {
      setMode(null);
    }
  }, [context, workflowId, value, onChange]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    setMode(null);
  }, []);

  // ── Image captioning ────────────────────────────────────────────────────────
  const captionFile = useCallback(async (file: File) => {
    abortRef.current?.abort();
    setMode('caption');
    const prevPrompt = value;

    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('context', context);
      const resp = await fetch(
        `${BACKEND_API.BASE_URL}${BACKEND_API.ENDPOINTS.OLLAMA_CAPTION}`,
        { method: 'POST', body: fd },
      );
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ detail: resp.statusText }));
        throw new Error(err.detail || 'Caption failed');
      }
      const data = await resp.json();
      const caption = String(data.caption ?? '').trim();
      // Append rather than replace. Dropping a reference onto a prompt you are
      // halfway through writing used to delete it, which made the feature
      // something you learned once and then avoided.
      const existing = prevPrompt.trim();
      onChange(existing && caption ? `${existing}, ${caption}` : caption || existing);
      if (data.model) setCaptionModel(data.model);
    } catch (err: any) {
      onChange(prevPrompt);
      console.error('[PromptAssistant caption]', err.message);
    } finally {
      setMode(null);
    }
  }, [context, onChange, value]);

  const handleDrop = useCallback((e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = 0;
    setDragOver(false);
    if (!enableCaption) return;
    const file = Array.from(e.dataTransfer.files).find(f => f.type.startsWith('image/'));
    if (file) captionFile(file);
  }, [enableCaption, captionFile]);

  const handleDragEnter = useCallback((e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    if (!enableCaption) return;
    if (!hasImageInDataTransfer(e.dataTransfer)) return;
    dragDepthRef.current += 1;
    setDragOver(true);
  }, [enableCaption, hasImageInDataTransfer]);

  const handleDragOver = useCallback((e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    if (!enableCaption) return;
    if (!hasImageInDataTransfer(e.dataTransfer)) return;
    if (!dragOver) setDragOver(true);
  }, [enableCaption, hasImageInDataTransfer, dragOver]);

  const handleDragLeave = useCallback((e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    if (!enableCaption) return;
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setDragOver(false);
  }, [enableCaption]);

  const handlePaste = useCallback((e: ClipboardEvent<HTMLTextAreaElement>) => {
    if (!enableCaption) return;
    const item = Array.from(e.clipboardData.items).find(i => i.type.startsWith('image/'));
    if (item) {
      e.preventDefault();
      const file = item.getAsFile();
      if (file) captionFile(file);
    }
  }, [enableCaption, captionFile]);

  // ── Drag styling ────────────────────────────────────────────────────────────
  const isLoading = mode !== null;
  const ringClass = dragOver ? `ring-2 ${ACCENT_RING[accent]}` : '';

  // ── Compact mode (WAN scene prompts) ────────────────────────────────────────
  if (compact) {
    return (
      <div className="relative">
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          rows={minRows}
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onPaste={handlePaste}
          className={`w-full bg-black/30 border border-white/5 rounded-xl p-3 text-sm text-white/90
            placeholder-white/15 resize-none outline-none transition-all
            ${ACCENT_FOCUS[accent]} ${isLoading ? 'opacity-70' : ''} ${ringClass}`}
        />
        <PromptLibraryPicker
          open={libraryOpen}
          onClose={() => setLibraryOpen(false)}
          onPick={(positive) => onChange(positive)}
        />
        {/* Floating AI buttons top-right of textarea */}
        <div className="absolute top-2 right-2 flex items-center gap-1">
          {isLoading ? (
            <button onClick={stop}
              className={`p-1 rounded-lg bg-black/60 border border-white/10 ${ACCENT_SPIN[accent]} hover:opacity-70 transition-all`}
              title="Stop">
              <X className="w-3 h-3" />
            </button>
          ) : (
            <>
              <button onClick={() => setLibraryOpen(true)} title="Reuse a prompt that already worked"
                className={`p-1 rounded-lg bg-black/60 border border-white/10 text-white/25 transition-all ${ACCENT_BTN[accent]}`}>
                <Library className="w-3 h-3" />
              </button>
              <button onClick={() => runStream('enhance')} title="Enhance with AI"
                className={`p-1 rounded-lg bg-black/60 border border-white/10 text-white/25 transition-all ${ACCENT_BTN[accent]}`}>
                <Wand2 className="w-3 h-3" />
              </button>
            </>
          )}
        </div>
        {/* Spinner overlay while generating */}
        {isLoading && (
          <div className="absolute bottom-2 left-3">
            <Loader2 className={`w-3 h-3 animate-spin ${ACCENT_SPIN[accent]}`} />
          </div>
        )}
        {/* Drop overlay */}
        {dragOver && enableCaption && (
          <div className={`pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl border-2 border-dashed bg-black/70 ${ACCENT_RING[accent]}`}>
            <div className="flex items-center gap-2 text-white/60">
              <ImageIcon className="w-4 h-4" />
              <span className="text-[10px] font-black uppercase tracking-widest">Drop to caption</span>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Full mode ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-2">
      <PromptLibraryPicker
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        onPick={(positive) => onChange(positive)}
      />
      {/* Label row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* WorkflowSection already titles this block "Prompt", so printing
              the default again put PROMPT directly under PROMPT. Only a label
              that actually says something different is shown. */}
          {label && label !== 'Prompt' && (
            <label className="text-[13px] font-black text-slate-400 uppercase tracking-[0.2em]">
              {label}
            </label>
          )}
          {/*
            Batch used to be its own section with a second textarea. It is a
            mode of this one card instead: Multiple treats each line as a
            separate job, Single leaves a multi-line prompt as one prompt so
            nobody gets N jobs for pressing Enter.
          */}
          {onModeChange && (
            <div className="flex items-center rounded-lg border border-white/10 bg-black/30 p-0.5">
              {(['single', 'multiple'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => onModeChange(m)}
                  className={`rounded-md px-3 py-1 text-[12px] font-black uppercase tracking-widest transition-colors ${
                    promptMode === m ? 'bg-white/10 text-white/70' : 'text-white/25 hover:text-white/50'
                  }`}
                >
                  {m === 'single' ? 'Single' : 'Multiple'}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {isLoading ? (
            <>
              <Loader2 className={`w-3 h-3 animate-spin ${ACCENT_SPIN[accent]}`} />
              <button onClick={stop}
                className="px-2 py-0.5 rounded-lg bg-white/5 border border-white/10 text-[9px] font-black uppercase tracking-widest text-white/30 hover:text-red-400 transition-colors flex items-center gap-1">
                <X className="w-3.5 h-3.5" /> Stop
              </button>
            </>
          ) : (
            <>
              {/* Enhance and "Prompt from image" both lived here and both are
                  gone. The agent beside this box does the same two jobs and
                  does not wait to be clicked: it opens itself when an image
                  lands and says what it sees. Three buttons for one job is
                  what made this section unreadable.

                  Dropping or pasting an image onto the textarea still captions
                  it - that behaviour is kept, it just no longer needs a button
                  advertising it. */}
              {/* One button, for the one job nothing else here does: reuse a
                  prompt that already produced something. The agent beside this
                  box writes new ones; it cannot hand you an old one back. */}
              <button
                type="button"
                onClick={() => setLibraryOpen(true)}
                title="Reuse a prompt that already worked"
                className="px-2 py-0.5 rounded-lg bg-white/5 border border-white/10 text-[9px] font-black uppercase tracking-widest text-white/30 hover:text-white/70 transition-colors flex items-center gap-1"
              >
                <Library className="w-3 h-3" /> Library
              </button>
              {/* Char count */}
              <span className="text-white/10 font-mono text-[10px] ml-1">{value.length}</span>
            </>
          )}
        </div>
      </div>

      <input
        ref={captionInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void captionFile(file);
          e.target.value = ''; // let the same file be picked twice
        }}
      />

      {/* Textarea with drop zone */}
      <div
        className={`relative rounded-2xl transition-all ${ringClass}`}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={isLoading ? '' : placeholder}
          rows={minRows}
          onPaste={handlePaste}
          className={`w-full bg-white/[0.02] border border-white/5 rounded-2xl p-4 text-sm tracking-wide
            text-white/90 placeholder-white/10 resize-none outline-none transition-all font-medium
            ${ACCENT_FOCUS[accent]} ${isLoading ? 'caret-transparent' : ''}`}
        />

        {/* Caption hint when a vision model is available & idle */}
        {/* Shown whether or not there is text: hiding it once you started
            typing meant nobody discovered it, since an empty box is exactly
            when you have not thought about references yet. */}
        {enableCaption && !isLoading && (
          <div className="absolute bottom-3 right-3 flex items-center gap-1 text-white/10 pointer-events-none">
            <ImageIcon className="w-3 h-3" />
            <span className="text-[8px] font-bold uppercase tracking-widest">
              {value ? 'Drop image to add' : 'Drop or paste image'}
            </span>
          </div>
        )}

        {/* Model badge after caption */}
        {captionModel && !isLoading && (
          <div className="absolute top-2 right-2">
            <span className="text-[7px] font-mono text-white/15 bg-black/40 px-1.5 py-0.5 rounded-md">
              {captionModel.split(':')[0]}
            </span>
          </div>
        )}

        {/* Drop image overlay */}
        {dragOver && enableCaption && (
          <div className={`pointer-events-none absolute inset-0 flex flex-col items-center justify-center rounded-2xl
            border-2 border-dashed bg-black/75 backdrop-blur-sm gap-2`}>
            <ImageIcon className={`w-6 h-6 ${ACCENT_SPIN[accent]}`} />
            <span className="text-[10px] font-black uppercase tracking-widest text-white/60">
              Drop image to caption
            </span>
            <span className="text-[8px] text-white/25 font-medium">
              Ollama vision model will describe it
            </span>
          </div>
        )}

        {/* Generating animation overlay */}
        {isLoading && (
          <div className="absolute top-3 right-3 pointer-events-none">
            <Loader2 className={`w-3.5 h-3.5 animate-spin ${ACCENT_SPIN[accent]}`} />
          </div>
        )}
      </div>

      {/* Status line */}
      {isLoading && (
        <p className={`text-[9px] font-bold uppercase tracking-widest ${ACCENT_SPIN[accent]} opacity-70`}>
          {mode === 'caption' ? 'Analysing image…' : mode === 'enhance' ? 'Enhancing prompt…' : 'Generating prompt…'}
        </p>
      )}
    </div>
  );
};
