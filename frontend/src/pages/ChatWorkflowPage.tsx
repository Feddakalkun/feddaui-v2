import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import {
  ChevronDown, ChevronRight, ImagePlus, Loader2, Play, RotateCcw, Send, Undo2, Upload,
} from 'lucide-react';
import { BACKEND_API } from '../config/api';
import { ChatImage } from '../components/chat/ChatImage';
import { useComfyExecution } from '../contexts/ComfyExecutionContext';
import { cn } from '../lib/styles';

/**
 * The one conversational agent. Runs ANY workflow.
 *
 * Nothing here is workflow-specific: `workflow_api.json` declares each
 * workflow's typed, labelled inputs, the backend classifies them into controls
 * and reads their defaults from the graph, and this drives the conversation on
 * top. A workflow becomes chat-runnable the moment it is declared.
 *
 * It replaces a Qwen-only edit page that had grown its own copy of the chat,
 * session handling, model picker and undo. Keeping two meant the good ideas
 * only ever existed on one of them - the result-feeds-forward loop below was
 * Qwen's alone, though it was never Qwen-specific.
 */

const MODEL_KEY = 'fedda.chat.model';

type Field = {
  key: string;
  label: string;
  control: 'file' | 'text' | 'chips' | 'number';
  required?: boolean;
  options?: string[];
  default?: string | number;
  accept?: 'image' | 'audio' | 'video';
};

type Msg = {
  role: 'user' | 'agent';
  text: string;
  image?: string;
  pending?: boolean;
  /** A result that could become the next source, once the user says so. */
  chained?: { filename: string; subfolder?: string; type?: string };
};

/**
 * What the agent says before anything has happened.
 *
 * It used to be "<workflow>. What are we making?" for every workflow, which
 * reads as an invitation to describe a picture - wrong when the workflow
 * cannot start until a photo is dropped in, and the reason a first-time user
 * types a description and gets asked for a file instead.
 *
 * Derived from the schema rather than written per workflow: whatever the
 * backend says is required and unfillable by typing is what gets asked for.
 */
const openingLine = (name: string, fields: Field[]): string => {
  const needed = fields.filter((f) => f.required && f.control === 'file');
  if (!needed.length) return `${name}. Describe what you want and I'll make it.`;
  const what = needed
    .map((f) => f.label.toLowerCase())
    .join(' and ');
  return `${name}. Drop in ${needed.length > 1 ? '' : 'a '}${what} - paste, drag it anywhere, `
    + `or use the slot below - then tell me what to change.`;
};

const viewUrl = (filename: string, subfolder = '', type = 'output') =>
  `/comfy/view?filename=${encodeURIComponent(filename)}` +
  `&subfolder=${encodeURIComponent(subfolder)}&type=${type}`;

/**
 * Several graphs pin their scaler to a square (Qwen Edit is hardcoded to
 * 768x768), so a portrait comes back squashed unless width/height are sent.
 * The budget matches that square, keeping speed and VRAM where the workflow
 * author put them, and both sides snap to 16 because the sampler works in
 * latent blocks.
 */
const PIXEL_BUDGET = 768 * 768;

const fitToBudget = (w: number, h: number) => {
  if (!w || !h) return null;
  const scale = Math.sqrt(PIXEL_BUDGET / (w * h));
  const snap = (v: number) => Math.max(256, Math.round((v * scale) / 16) * 16);
  return { width: snap(w), height: snap(h) };
};

const measure = (src: string) =>
  new Promise<{ w: number; h: number } | null>((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = src;
  });

interface Props {
  workflowId: string;
  /** Session to load on mount, or null for a fresh chat. */
  openId?: string | null;
  /** Told when a chat is saved so the shell can refresh the sidebar. */
  onSaved?: (id: string) => void;
}

export const ChatWorkflowPage = ({ workflowId, openId = null, onSaved }: Props) => {
  const [fields, setFields] = useState<Field[]>([]);
  const [name, setName] = useState('');
  const [values, setValues] = useState<Record<string, string | number>>({});
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragField, setDragField] = useState<string | null>(null);
  // Dragging over the whole pane. Counted rather than boolean: dragenter fires
  // again for every child the cursor crosses and each one answers with a
  // dragleave, so a plain flag flickers off while the file is still overhead.
  const [dragDepth, setDragDepth] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [model, setModel] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [history, setHistory] = useState<Record<string, string | number>[]>([]);
  const scroller = useRef<HTMLDivElement>(null);

  // /api/generate skips queueWorkflow, so the execution context has to be told
  // a job started or the output strip and live preview stay dead here.
  const { registerNodeMap, startExecution, previewUrl } = useComfyExecution();

  const fileFields = useMemo(() => fields.filter((f) => f.control === 'file'), [fields]);
  const settingFields = useMemo(() => fields.filter((f) => f.control !== 'file'), [fields]);
  const hasSize = useMemo(() => fields.some((f) => f.key === 'width'), [fields]);

  /**
   * The slot a result can be fed back into, so the next message edits what the
   * last one produced.
   *
   * Only when there is exactly one image input: with several (LTX First/Last,
   * Head Swap) there is no answer to "which one", and guessing would quietly
   * overwrite a frame the user chose.
   *
   * A single image input is not enough on its own - WAN Img2Vid has one and
   * returns video. The run below only feeds back when the result is an image,
   * so a video lands in the transcript and the input slot is left alone.
   */
  const loopField = useMemo(() => {
    const imgs = fileFields.filter((f) => (f.accept ?? 'image') === 'image');
    return imgs.length === 1 ? imgs[0].key : null;
  }, [fileFields]);

  const missing = fields.filter((f) => f.required && !values[f.key]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  // Schema for this workflow, with the graph's own defaults seeded in.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setError(null);
      try {
        const res = await fetch(
          `${BACKEND_API.BASE_URL}/api/chat-workflow/schema/${encodeURIComponent(workflowId)}`);
        if (!res.ok) throw new Error((await res.json()).detail || 'Could not load workflow');
        const data = await res.json();
        if (cancelled) return;
        setFields(data.fields);
        setName(data.name);
        const seeded: Record<string, string | number> = {};
        for (const f of data.fields as Field[]) {
          if (f.control !== 'file' && f.default !== undefined && f.default !== null) {
            seeded[f.key] = f.default;
          }
        }
        setValues(seeded);
        if (!openId) setMessages([{ role: 'agent', text: openingLine(data.name, data.fields || []) }]);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { cancelled = true; };
  }, [workflowId, openId]);

  // Which local model drives the agent. Empty means the backend default, and a
  // per-user override is remembered so it does not reset on every visit.
  useEffect(() => {
    (async () => {
      let saved = '';
      try { saved = localStorage.getItem(MODEL_KEY) || ''; } catch { /* private mode */ }
      try {
        const res = await fetch(`${BACKEND_API.BASE_URL}/api/ollama/models`);
        const data = await res.json();
        const available: string[] = Array.isArray(data.models) ? data.models : [];
        setModels(available);
        setModel(saved && available.includes(saved) ? saved : (data.text_model || ''));
      } catch { setModels([]); }
    })();
  }, []);

  const chooseModel = (n: string) => {
    setModel(n);
    try { localStorage.setItem(MODEL_KEY, n); } catch { /* private mode */ }
  };

  /**
   * Clear for a new chat.
   *
   * Split from the load below and keyed on `openId` alone. Together they raced:
   * loading depends on `loopField`, which changes when the workflow does, so
   * switching workflow re-ran the clear *after* the schema had written its
   * greeting - landing you in an empty chat with no sign of what happened.
   */
  useEffect(() => {
    if (openId) return;
    setSessionId(null);
    setHistory([]);
    setDims(null);
    setError(null);
  }, [openId]);

  // Reopen a saved chat.
  useEffect(() => {
    let cancelled = false;
    if (!openId) return undefined;
    (async () => {
      try {
        const res = await fetch(
          `${BACKEND_API.BASE_URL}/api/chat-edit/sessions/${encodeURIComponent(openId)}`);
        if (!res.ok || cancelled) return;
        const s = await res.json();
        if (cancelled) return;
        setSessionId(s.id);
        setMessages(Array.isArray(s.messages) ? s.messages : []);
        setValues((v) => ({ ...v, ...(s.values || {}) }));
        setHistory([]);
        setError(null);
        const img = loopField ? (s.values || {})[loopField] : null;
        setDims(img ? await measure(viewUrl(String(img), '', 'input')) : null);
      } catch { /* leave the current chat alone */ }
    })();
    return () => { cancelled = true; };
  }, [openId, loopField]);

  const persist = async (nextMessages: Msg[], nextValues: Record<string, string | number>) => {
    if (!nextMessages.some((m) => m.role === 'user')) return;
    try {
      const res = await fetch(`${BACKEND_API.BASE_URL}/api/chat-edit/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: sessionId,
          messages: nextMessages,
          workflow_id: workflowId,
          values: nextValues,
        }),
      });
      const data = await res.json();
      if (data.id) { setSessionId(data.id); onSaved?.(data.id); }
    } catch { /* history is a convenience; never break the chat over it */ }
  };

  /** Returns the ComfyUI input filename, or null if it did not land. */
  const upload = useCallback(async (key: string, file: File) => {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`${BACKEND_API.BASE_URL}/api/upload`, { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.detail || 'Upload failed');
      setValues((v) => ({ ...v, [key]: data.filename }));
      if (key === loopField) setDims(await measure(viewUrl(data.filename, '', 'input')));
      return data.filename as string;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setBusy(false);
    }
  }, [loopField]);

  /**
   * Which slot a loose image goes into.
   *
   * `loopField` is deliberately null when a workflow has two image inputs, so
   * dropping anywhere had nowhere to go on exactly the workflows with the most
   * slots. This fills the first empty image field instead and falls back to the
   * first one, so a second drop replaces rather than being refused.
   */
  const dropTarget = useMemo(() => {
    const imgs = fileFields.filter((f) => (f.accept ?? 'image') === 'image');
    if (!imgs.length) return null;
    return (imgs.find((f) => !values[f.key]) ?? imgs[0]).key;
  }, [fileFields, values]);

  /**
   * Take an image that arrived without being aimed at a slot, then say what it
   * is and ask what to do with it.
   *
   * Landing the file silently was the old behaviour and it read as nothing
   * happening. Naming what it can see is what proves it looked at *this*
   * picture, and the question is what makes the next message easy to write.
   */
  const acceptImage = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) return;
    const key = dropTarget;
    if (!key) {
      setError('This workflow takes no image.');
      return;
    }
    const landed = await upload(key, file);
    if (!landed) return;                    // upload() has already said why

    const thinking: Msg = { role: 'agent', text: 'Looking at it…', pending: true };
    setMessages((m) => [...m, thinking]);
    const settle = (text: string) => setMessages((m) => {
      const i = m.indexOf(thinking);
      if (i < 0) return m;
      const next = [...m];
      next[i] = { role: 'agent', text };
      return next;
    });
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('context', 'chat-drop');
      const seen = await fetch(`${BACKEND_API.BASE_URL}/api/ollama/caption`, { method: 'POST', body: form });
      const vision = await seen.json().catch(() => ({}));
      if (!seen.ok || !vision.success) throw new Error(vision.detail || 'Could not read the image');

      // The caption goes to the agent rather than into the transcript: the
      // vision model returns a tag list in its own format no matter what it is
      // asked, and the agent is the one that speaks here.
      const res = await fetch(`${BACKEND_API.BASE_URL}/api/chat-workflow/turn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflow_id: workflowId,
          message: '',
          image_caption: vision.caption,
          filled: { ...values, [key]: landed },
          model: model || undefined,
          history: messages.map((m) => ({
            role: m.role === 'agent' ? 'assistant' : 'user', content: m.text,
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.reply) throw new Error(data.detail || 'Agent unavailable — is Ollama running?');
      // Which slot it took only matters when there is more than one.
      const slot = fileFields.length > 1
        ? `${fields.find((f) => f.key === key)?.label || key}: ` : '';
      settle(`${slot}${data.reply}`);
    } catch (e) {
      // The picture is uploaded either way — losing a model must not lose the
      // image, so this degrades to the plain question.
      setError(e instanceof Error ? e.message : String(e));
      settle('Got the image, but I could not look at it. What do you want to do with it?');
    }
  }, [dropTarget, upload, fileFields, fields, values, model, messages, workflowId]);

  // Paste anywhere in the window, same handling as a drop.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith('image/'));
      const file = item?.getAsFile();
      if (file) void acceptImage(file);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [acceptImage]);

  /**
   * Copy a generated image into ComfyUI's input directory.
   *
   * Results land in output/ but LoadImage only reads input/, so feeding an
   * output filename into the next turn fails with "no image came back". This is
   * what lets a conversation build on itself.
   */
  const importToInput = async (img: { filename: string; subfolder?: string; type?: string }) => {
    const res = await fetch(`${BACKEND_API.BASE_URL}/api/media/import-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: img.filename, subfolder: img.subfolder || '', type: img.type || 'output',
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.detail || 'Could not keep the result');
    return data.filename as string;
  };

  /**
   * Take a result as the source for what comes next.
   *
   * The import is the necessary half: results are written to output/ and
   * LoadImage only reads input/, so an output name fed back fails with
   * "no image came back".
   */
  const useAsSource = async (img: { filename: string; subfolder?: string; type?: string }) => {
    if (!loopField) return;
    try {
      const inputName = await importToInput(img);
      setHistory((h) => [...h, values]);
      setValues((v) => ({ ...v, [loopField]: inputName }));
      setDims(await measure(viewUrl(inputName, '', 'input')));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const run = async (override?: Record<string, string | number>) => {
    const base = override ?? values;
    if (fields.some((f) => f.required && !base[f.key]) || running) return;

    // Only send a size when the workflow exposes one and we know the source.
    const sized = hasSize && dims ? { ...base, ...(fitToBudget(dims.w, dims.h) || {}) } : base;

    setRunning(true);
    setError(null);
    setMessages((m) => [...m, { role: 'agent', text: 'Running…', pending: true }]);
    try {
      try {
        const map = await fetch(
          `${BACKEND_API.BASE_URL}/api/workflow/node-map/${workflowId}`).then((r) => r.json());
        if (map.success) registerNodeMap(map.node_map);
      } catch { /* preview is a nicety; never block the run on it */ }
      startExecution();

      const res = await fetch(`${BACKEND_API.BASE_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflow_id: workflowId, params: sized }),
      });
      const queued = await res.json().catch(() => ({}));
      if (!res.ok || !queued.prompt_id) {
        throw new Error(queued.detail || 'ComfyUI did not accept the job');
      }

      for (let i = 0; i < 400; i += 1) {
        await new Promise((r) => setTimeout(r, 1500));
        const poll = await fetch(
          `${BACKEND_API.BASE_URL}/api/generate/status/${encodeURIComponent(queued.prompt_id)}`);
        const data = await poll.json();
        if (!data.success) throw new Error(data.error || 'Status check failed');
        if (data.status !== 'completed') {
          if (data.status === 'not_found' && i > 8) throw new Error('Job vanished from ComfyUI history');
          continue;
        }

        const images = Array.isArray(data.images) ? data.images : [];
        const videos = Array.isArray(data.videos) ? data.videos : [];
        const picked = images.find((im: { type?: string }) => im.type === 'output') || images[0];

        let shown: string | undefined;
        let nextValues = sized;
        // Set when the result could become the next source, so the message can
        // offer it. Offering is all it does.
        let chained: { filename: string; subfolder?: string; type?: string } | undefined;
        if (picked) {
          // Shown, not adopted. This used to import the result and put it in
          // the source slot straight away, so the next instruction silently
          // applied to the edit rather than the photo - fine when you are
          // stacking changes, wrong when you want to try something else
          // against the original, and there was no way to say which. The
          // "Use as source" button under the result is that choice.
          shown = viewUrl(picked.filename, picked.subfolder || '', picked.type || 'output');
          if (loopField) chained = picked;
        } else if (videos.length) {
          shown = viewUrl(videos[0].filename, videos[0].subfolder || '', videos[0].type || 'output');
        }

        const text = picked || videos.length ? 'Done.' : 'Finished, but nothing came back.';
        setMessages((m) => {
          const next = [...m];
          const idx = next.findIndex((x) => x.pending);
          if (idx >= 0) next[idx] = { role: 'agent', text, image: shown, chained };
          return next;
        });
        void persist([...messages, { role: 'agent', text, image: shown }], nextValues);
        return;
      }
      throw new Error('Timed out waiting for output');
    } catch (e) {
      setMessages((m) => m.filter((x) => !x.pending));
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    setError(null);
    const withUser: Msg[] = [...messages, { role: 'user', text }];
    setMessages(withUser);
    setBusy(true);
    try {
      const res = await fetch(`${BACKEND_API.BASE_URL}/api/chat-workflow/turn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflow_id: workflowId,
          message: text,
          filled: values,
          model: model || undefined,
          history: messages.map((m) => ({
            role: m.role === 'agent' ? 'assistant' : 'user', content: m.text,
          })),
        }),
      });
      if (!res.ok) throw new Error((await res.json()).detail || 'Agent unavailable — is Ollama running?');
      const data = await res.json();

      const merged = { ...values, ...(data.set || {}) };
      if (data.set && Object.keys(data.set).length) setValues(merged);
      setMessages([...withUser, { role: 'agent', text: data.reply }]);

      // Describing what you want runs it. The agent decides when everything
      // required is filled and the backend re-checks, so making the user press
      // Run afterwards would turn this back into a form with a chat attached.
      const stillMissing = fields.filter((f) => f.required && !merged[f.key]);
      if (data.ready && !stillMissing.length) await run(merged);
      else void persist([...withUser, { role: 'agent', text: data.reply }], merged);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const undo = () => {
    if (!history.length) return;
    const prev = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    setValues(prev);
    setMessages((m) => [...m, { role: 'agent', text: 'Rolled back.' }]);
  };

  const control = (f: Field) => {
    const value = values[f.key];
    if (f.control === 'file') {
      const filled = typeof value === 'string' && value;
      return (
        <label
          key={f.key}
          onDragEnter={(e) => { e.preventDefault(); setDragField(f.key); }}
          onDragOver={(e) => e.preventDefault()}
          onDragLeave={() => setDragField(null)}
          onDrop={(e) => {
            // Aimed at this slot, so keep it from bubbling to the pane-wide drop
            // and being uploaded a second time into whatever slot is empty.
            e.preventDefault();
            e.stopPropagation();
            setDragField(null);
            setDragDepth(0);
            const file = Array.from(e.dataTransfer.files)[0];
            if (file) void upload(f.key, file);
          }}
          className={cn(
            'flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-[11px] transition',
            dragField === f.key ? 'bg-cyan-500/20 text-cyan-100'
              : filled ? 'bg-emerald-500/12 text-emerald-300'
              : 'bg-white/[0.06] text-white/45 hover:bg-white/[0.1]',
          )}
        >
          {filled
            ? <img src={viewUrl(String(value), '', 'input')} alt="" className="h-14 w-14 rounded-md object-cover" />
            : <Upload className="h-3.5 w-3.5" />}
          <span>{f.label}{f.required && !filled ? ' *' : ''}</span>
          <input
            type="file"
            accept={`${f.accept || 'image'}/*`}
            className="hidden"
            onChange={(e) => { const x = e.target.files?.[0]; if (x) void upload(f.key, x); e.target.value = ''; }}
          />
        </label>
      );
    }
    if (f.control === 'chips') {
      return (
        <div key={f.key} className="flex items-center gap-1">
          <span className="text-[10px] uppercase tracking-wider text-white/25">{f.label}</span>
          {f.options?.map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => setValues((v) => ({ ...v, [f.key]: o }))}
              className={cn('rounded-full px-2.5 py-1 text-[11px] transition',
                value === o ? 'bg-cyan-500/20 text-cyan-100'
                            : 'bg-white/[0.06] text-white/40 hover:bg-white/[0.1] hover:text-white')}
            >{o}</button>
          ))}
        </div>
      );
    }
    if (f.control === 'number') {
      return (
        <label key={f.key} className="flex items-center gap-1.5 text-[11px] text-white/40">
          {f.label}
          <input
            type="number"
            value={value ?? ''}
            onChange={(e) => setValues((v) => ({ ...v, [f.key]: Number(e.target.value) }))}
            className="w-20 rounded-lg bg-white/[0.06] px-2 py-1 text-[11px] text-zinc-100 outline-none focus:bg-white/[0.1]"
          />
        </label>
      );
    }
    return (
      <label key={f.key} className="flex min-w-[160px] flex-1 items-center gap-1.5 text-[11px] text-white/40">
        {f.label}{f.required && !value ? ' *' : ''}
        <input
          value={String(value ?? '')}
          onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
          className="flex-1 rounded-lg bg-white/[0.06] px-2 py-1 text-[11px] text-zinc-100 outline-none focus:bg-white/[0.1]"
        />
      </label>
    );
  };

  const carriesFile = (e: DragEvent) => Array.from(e.dataTransfer.types).includes('Files');

  return (
    <div
      className="relative flex h-full min-w-0 flex-1 flex-col bg-[#050506]"
      onDragEnter={(e) => { if (carriesFile(e)) { e.preventDefault(); setDragDepth((d) => d + 1); } }}
      onDragOver={(e) => { if (carriesFile(e)) e.preventDefault(); }}
      onDragLeave={(e) => { if (carriesFile(e)) setDragDepth((d) => Math.max(0, d - 1)); }}
      onDrop={(e) => {
        if (!carriesFile(e)) return;
        e.preventDefault();
        setDragDepth(0);
        setDragField(null);
        const file = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith('image/'));
        if (file) void acceptImage(file);
      }}
    >
      {/* Covers the pane only while a file is overhead, so it never sits between
          the user and the chat. pointer-events-none keeps the drop on the
          container underneath, which is what counts the enter/leave pairs. */}
      {dragDepth > 0 && (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center rounded-xl border-2 border-dashed border-cyan-400/50 bg-cyan-500/[0.07] backdrop-blur-[1px]">
          <div className="flex flex-col items-center gap-2 text-cyan-100">
            <ImagePlus className="h-8 w-8" />
            <span className="text-sm font-semibold">
              {dropTarget ? 'Drop it anywhere' : 'This workflow takes no image'}
            </span>
            {dropTarget && (
              <span className="text-[11px] text-cyan-100/60">
                I'll look at it and ask what you want to do
              </span>
            )}
          </div>
        </div>
      )}
      <div className="flex items-center gap-2 px-4 py-2.5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">
          {name || workflowId}
        </p>
        <span className="text-[10px] text-white/25">
          {missing.length ? `${missing.length} still needed` : 'ready'}
        </span>
        {models.length > 0 && (
          <select
            value={model}
            onChange={(e) => chooseModel(e.target.value)}
            title="Which local model drives the agent"
            className="max-w-[180px] rounded-lg bg-white/[0.05] px-2 py-1.5 text-[10px] text-white/55 outline-none focus:bg-white/[0.08]"
          >
            <option value="">Default model</option>
            {models.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        )}
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={undo}
            disabled={!history.length}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[10px] font-semibold text-white/45 transition hover:bg-white/[0.06] hover:text-white disabled:opacity-25"
          >
            <Undo2 className="h-3 w-3" /> Undo
          </button>
          <button
            type="button"
            onClick={() => { setMessages([]); setHistory([]); setSessionId(null); setError(null); }}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[10px] font-semibold text-white/45 transition hover:bg-white/[0.06] hover:text-white"
          >
            <RotateCcw className="h-3 w-3" /> New
          </button>
        </div>
      </div>

      <div ref={scroller} className="custom-scrollbar flex-1 overflow-y-auto px-4 py-5">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
          {messages.length === 0 && fileFields.length > 0 && (
            <div className="flex flex-col items-center gap-3 rounded-2xl bg-white/[0.03] py-16">
              <ImagePlus className="h-7 w-7 text-white/25" />
              <span className="text-sm text-white/45">Drop or paste an image anywhere to start</span>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
              <div className={cn('max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[13px]',
                m.role === 'user' ? 'bg-cyan-500/15 text-cyan-50' : 'bg-white/[0.06] text-zinc-200')}>
                <p className="whitespace-pre-wrap">{m.text}</p>
                {m.pending && (
                  <>
                    <p className="mt-2 flex items-center gap-1.5 text-[11px] text-white/40">
                      <Loader2 className="h-3 w-3 animate-spin" /> working…
                    </p>
                    {previewUrl && <ChatImage src={previewUrl} dim />}
                  </>
                )}
                {m.image && <ChatImage src={m.image} />}
                {m.chained && (
                  <button
                    type="button"
                    onClick={() => { void useAsSource(m.chained!); }}
                    title="Edit this result instead of the original"
                    className="mt-1.5 rounded-lg border border-white/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-white/40 transition hover:border-cyan-400/40 hover:text-cyan-200"
                  >
                    Use as source
                  </button>
                )}
              </div>
            </div>
          ))}
          {error && (
            <p className="rounded-xl bg-red-500/12 px-3 py-2 text-[12px] text-red-300">{error}</p>
          )}
        </div>
      </div>

      <div className="px-4 pb-4 pt-2">
        <div className="mx-auto w-full max-w-3xl">
          {/* Only what cannot be typed lives out here. Prompts and sampler
              settings are the agent's job; a parameter grid above the composer
              is the exact thing this page exists to replace. */}
          {fileFields.length > 0 && (
            <div className="mb-2.5 flex flex-wrap items-center gap-2">{fileFields.map(control)}</div>
          )}

          {settingFields.length > 0 && (
            <div className="mb-2">
              <button
                type="button"
                onClick={() => setShowSettings((v) => !v)}
                className="inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/25 transition hover:text-white/60"
              >
                {showSettings ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                Settings
              </button>
              {messages.some((m) => m.image) && (
                <button
                  type="button"
                  onClick={() => { void run(); }}
                  disabled={Boolean(missing.length) || running}
                  title="Run again with the current settings"
                  className="ml-1 inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/25 transition hover:text-white/60 disabled:opacity-25"
                >
                  <Play className="h-3 w-3" /> Run again
                </button>
              )}
              {showSettings && (
                <div className="mt-2 flex flex-wrap items-center gap-2">{settingFields.map(control)}</div>
              )}
            </div>
          )}

          <div className="flex items-end gap-2 rounded-2xl bg-white/[0.06] p-1.5 focus-within:bg-white/[0.09]">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); }
              }}
              rows={1}
              placeholder="Tell it what you want…"
              className="max-h-32 flex-1 resize-none bg-transparent px-2 py-1.5 text-[13px] text-zinc-100 outline-none placeholder:text-white/30"
            />
            <button
              type="button"
              onClick={() => { void send(); }}
              disabled={busy || running || !input.trim()}
              title="Send"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-cyan-500/90 px-3.5 py-2 text-[12px] font-semibold text-white transition hover:bg-cyan-400 disabled:opacity-25"
            >
              {busy || running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
