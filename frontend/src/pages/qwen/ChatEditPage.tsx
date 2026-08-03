import { useCallback, useEffect, useRef, useState } from 'react';
import { ImagePlus, Loader2, RotateCcw, Send, Undo2 } from 'lucide-react';
import { BACKEND_API } from '../../config/api';
import { ChatImage } from '../../components/chat/ChatImage';
import { useComfyExecution } from '../../contexts/ComfyExecutionContext';
import { cn } from '../../lib/styles';

/**
 * Conversational image editing on top of qwen-rapid-edit-v23.
 *
 * The point of this page over the regular edit page: each result becomes the
 * input for the next message, so a session is a conversation rather than a
 * series of uploads. The agent decides per turn whether to talk or to edit -
 * the backend returns {reply, edit} and only a non-null `edit` triggers a
 * render.
 *
 * Deliberately minimal chrome: no settings rail, no parameter grid. The chat
 * is the interface.
 */

const WORKFLOW_ID = 'qwen-rapid-edit-v23';
const MODEL_KEY = 'fedda.chat-edit.model';

type Msg = {
  role: 'user' | 'agent';
  text: string;
  image?: string;      // displayable /comfy/view url
  pending?: boolean;
};

/** ComfyUI-relative filename -> a URL the browser can render. */
const viewUrl = (filename: string, subfolder = '', type = 'output') =>
  `/comfy/view?filename=${encodeURIComponent(filename)}` +
  `&subfolder=${encodeURIComponent(subfolder)}&type=${type}`;

interface ChatEditPageProps {
  /** Session id to load on mount, or null for a fresh chat. */
  openId?: string | null;
  /** Told when a chat is saved so the shell can refresh the sidebar. */
  onSaved?: (id: string) => void;
}

export const ChatEditPage = ({ openId = null, onSaved }: ChatEditPageProps = {}) => {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [image, setImage] = useState<string | null>(null);   // current working image (data url)
  const [history, setHistory] = useState<string[]>([]);       // previous images, for undo
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [model, setModel] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  // Submitting via /api/generate bypasses queueWorkflow, so the execution
  // context has to be told a job started or the output strip and the live
  // preview both stay dead on this page.
  const { registerNodeMap, startExecution, previewUrl } = useComfyExecution();

  /**
   * Persist the conversation.
   *
   * Called after a turn settles rather than on every state change: saving mid
   * edit would store a message still marked pending, which would come back
   * from history stuck on "editing…".
   */
  const persist = async (nextMessages: Msg[], nextImage: string | null, nextHistory: string[]) => {
    if (!nextMessages.some((m) => m.role === 'user')) return;
    try {
      const res = await fetch(`${BACKEND_API.BASE_URL}/api/chat-edit/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: sessionId,
          messages: nextMessages,
          image: nextImage,
          history: nextHistory,
        }),
      });
      const data = await res.json();
      if (data.id) {
        setSessionId(data.id);
        onSaved?.(data.id);
      }
    } catch { /* history is a convenience; never break the chat over it */ }
  };

  // The shell owns which chat is open; this loads whatever it points at, and
  // resets to an empty conversation when it points at nothing.
  useEffect(() => {
    let cancelled = false;
    if (!openId) {
      setSessionId(null);
      setMessages([]);
      setImage(null);
      setHistory([]);
      setError(null);
      return;
    }
    (async () => {
      try {
        const res = await fetch(`${BACKEND_API.BASE_URL}/api/chat-edit/sessions/${encodeURIComponent(openId)}`);
        if (!res.ok || cancelled) return;
        const s = await res.json();
        if (cancelled) return;
        setSessionId(s.id);
        setMessages(Array.isArray(s.messages) ? s.messages : []);
        setImage(s.image ?? null);
        setHistory(Array.isArray(s.history) ? s.history : []);
        setError(null);
      } catch { /* leave the current chat alone */ }
    })();
    return () => { cancelled = true; };
  }, [openId]);

  // Which local model drives the agent. Empty means "whatever the backend
  // considers the default", so the picker never has to be touched to work.
  // A per-page override is remembered so it does not reset on every visit.
  useEffect(() => {
    (async () => {
      let saved = '';
      try { saved = localStorage.getItem(MODEL_KEY) || ''; } catch { /* private mode */ }
      try {
        const res = await fetch(`${BACKEND_API.BASE_URL}/api/ollama/models`);
        const data = await res.json();
        const available: string[] = Array.isArray(data.models) ? data.models : [];
        setModels(available);
        // Drop a remembered model that has since been deleted from Ollama.
        setModel(saved && available.includes(saved) ? saved : (data.text_model || ''));
      } catch {
        setModels([]);
      }
    })();
  }, []);

  const chooseModel = (name: string) => {
    setModel(name);
    try { localStorage.setItem(MODEL_KEY, name); } catch { /* private mode */ }
  };

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  // The workflow takes a ComfyUI filename, not a data URL, so every dropped
  // file is uploaded first and only the returned filename is kept as state.
  const loadFile = useCallback(async (file: File) => {
    setError(null);
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`${BACKEND_API.BASE_URL}/api/upload`, { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.detail || 'Upload failed');
      setImage(data.filename);
      setHistory([]);
      setMessages((m) => [...m, {
        role: 'agent',
        text: 'Got it. What should we change?',
        image: viewUrl(data.filename, '', 'input'),
      }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  // Paste an image straight into the conversation.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.items ?? [])
        .find((i) => i.type.startsWith('image/'));
      const file = item?.getAsFile();
      if (file) void loadFile(file);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [loadFile]);

  /**
   * Copy a generated image back into ComfyUI's input directory.
   *
   * Results land in output/ but LoadImage only reads input/, so feeding an
   * output filename into the next turn made every second edit fail with "the
   * workflow finished without an image". This is what makes the conversation
   * able to build on itself.
   */
  const importToInput = async (img: { filename: string; subfolder?: string; type?: string }) => {
    const res = await fetch(`${BACKEND_API.BASE_URL}/api/media/import-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: img.filename,
        subfolder: img.subfolder || '',
        type: img.type || 'output',
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.detail || 'Could not keep the result');
    return data.filename as string;
  };

  /**
   * /api/generate only queues the job and hands back a prompt_id; the images
   * arrive by polling /api/generate/status. Reading the POST response for
   * images silently produced "no image came back" on every successful edit.
   */
  const runEdit = async (instruction: string): Promise<{ filename: string; url: string }> => {
    // Register before submitting so the strip shows during model loading too.
    try {
      const map = await fetch(
        `${BACKEND_API.BASE_URL}/api/workflow/node-map/${WORKFLOW_ID}`).then((r) => r.json());
      if (map.success) registerNodeMap(map.node_map);
    } catch { /* preview is a nicety; never block the edit on it */ }
    startExecution();

    const res = await fetch(`${BACKEND_API.BASE_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workflow_id: WORKFLOW_ID,
        params: { image, prompt: instruction, negative: '' },
      }),
    });
    const queued = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(queued.detail || `Generation failed (${res.status})`);
    const promptId = queued.prompt_id;
    if (!promptId) throw new Error(queued.detail || 'ComfyUI did not accept the job');

    for (let i = 0; i < 200; i += 1) {
      await new Promise((r) => setTimeout(r, 1500));
      const poll = await fetch(
        `${BACKEND_API.BASE_URL}/api/generate/status/${encodeURIComponent(promptId)}`);
      const data = await poll.json();
      if (!data.success) throw new Error(data.error || 'Status check failed');
      if (data.status === 'completed') {
        const images = Array.isArray(data.images) ? data.images : [];
        const outputs = images.filter((im: { type?: string }) => im.type === 'output');
        const picked = (outputs.length ? outputs : images)[0];
        if (!picked) throw new Error('The workflow finished without an image');
        // Land it in input/ straight away so the next turn can edit it.
        const inputName = await importToInput(picked);
        return { filename: inputName, url: viewUrl(inputName, '', 'input') };
      }
      if (data.status === 'not_found' && i > 8) throw new Error('Job vanished from ComfyUI history');
    }
    throw new Error('Timed out waiting for the edit');
  };

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    setError(null);
    setMessages((m) => [...m, { role: 'user', text }]);
    setBusy(true);

    try {
      const turn = await fetch(`${BACKEND_API.BASE_URL}/api/chat-edit/turn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          has_image: Boolean(image),
          model: model || undefined,
          history: messages.map((m) => ({
            role: m.role === 'agent' ? 'assistant' : 'user',
            content: m.text,
          })),
        }),
      });
      if (!turn.ok) {
        const detail = await turn.json().catch(() => ({}));
        throw new Error(detail.detail || 'The agent is unavailable — is Ollama running?');
      }
      const { reply, edit } = await turn.json();

      if (!edit) {
        const next: Msg[] = [...messages, { role: 'user', text }, { role: 'agent', text: reply }];
        setMessages((m) => [...m, { role: 'agent', text: reply }]);
        void persist(next, image, history);
        return;
      }

      setMessages((m) => [...m, { role: 'agent', text: reply, pending: true }]);
      const result = await runEdit(edit);
      // The result becomes the input for the next turn - that loop is the
      // whole point of this page over the regular edit page.
      const nextHistory = image ? [...history, image] : history;
      if (image) setHistory(nextHistory);
      setImage(result.filename);
      const settled: Msg[] = [
        ...messages,
        { role: 'user', text },
        { role: 'agent', text: reply, image: result.url },
      ];
      setMessages((m) => {
        const next = [...m];
        const i = next.findIndex((x) => x.pending);
        if (i >= 0) next[i] = { ...next[i], pending: false, image: result.url };
        return next;
      });
      void persist(settled, result.filename, nextHistory);
    } catch (e) {
      setMessages((m) => m.filter((x) => !x.pending));
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const undo = () => {
    if (!history.length) return;
    const prev = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    setImage(prev);
    // Everything held in state is an input-dir filename, uploaded or imported.
    setMessages((m) => [...m, { role: 'agent', text: 'Rolled back.', image: viewUrl(prev, '', 'input') }]);
  };

  const reset = () => {
    setMessages([]);
    setImage(null);
    setHistory([]);
    setError(null);
  };

  // Drop anywhere on the page. dragenter/over must both preventDefault or the
  // browser navigates to the file instead of firing onDrop.
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith('image/'));
    if (file) void loadFile(file);
  };

  return (
    <div
      className={cn('relative flex h-full min-w-0 flex-1 flex-col bg-[#050506]',
        dragging && 'ring-2 ring-inset ring-cyan-400/60')}
      onDragEnter={(e) => { e.preventDefault(); setDragging(true); }}
      onDragOver={(e) => { e.preventDefault(); }}
      onDragLeave={(e) => {
        // Only clear when the pointer actually leaves the page, not when it
        // crosses between children.
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
      }}
      onDrop={onDrop}
    >
      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-cyan-500/10">
          <p className="rounded-xl bg-black/70 px-4 py-2 text-sm text-cyan-200">Drop the image</p>
        </div>
      )}
      <div className="flex items-center gap-2 px-4 py-2.5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">
          Chat Edit · Qwen
        </p>
        {models.length > 0 && (
          <select
            value={model}
            onChange={(e) => chooseModel(e.target.value)}
            title="Which local model drives the agent"
            className="max-w-[190px] rounded-lg bg-white/[0.05] px-2 py-1.5 text-[10px] text-white/55 outline-none focus:bg-white/[0.08]"
          >
            <option value="">Default model</option>
            {models.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        )}
        <div className="ml-auto flex items-center gap-2">
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
            onClick={reset}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[10px] font-semibold text-white/45 transition hover:bg-white/[0.06] hover:text-white"
          >
            <RotateCcw className="h-3 w-3" /> New
          </button>
        </div>
      </div>

      <div ref={scroller} className="custom-scrollbar flex-1 overflow-y-auto px-4 py-5">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
          {messages.length === 0 && (
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="flex flex-col items-center gap-3 rounded-2xl bg-white/[0.03] py-16 transition hover:bg-white/[0.06]"
            >
              <ImagePlus className="h-7 w-7 text-white/25" />
              <span className="text-sm text-white/45">Drop, paste or click to add an image</span>
              <span className="text-[11px] text-white/25">then just say what you want changed</span>
            </button>
          )}

          {messages.map((m, i) => (
            <div key={i} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
              <div className={cn(
                'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[13px]',
                m.role === 'user'
                  ? 'bg-cyan-500/15 text-cyan-50'
                  : 'bg-white/[0.06] text-zinc-200',
              )}>
                <p className="whitespace-pre-wrap">{m.text}</p>
                {m.pending && (
                  <>
                    <p className="mt-2 flex items-center gap-1.5 text-[11px] text-white/40">
                      <Loader2 className="h-3 w-3 animate-spin" /> editing…
                    </p>
                    {/* Live sampling frame, straight from the execution context. */}
                    {previewUrl && <ChatImage src={previewUrl} dim />}
                  </>
                )}
                {m.image && <ChatImage src={m.image} />}
              </div>
            </div>
          ))}

          {error && (
            <p className="rounded-xl bg-red-500/12 px-3 py-2 text-[12px] text-red-300">
              {error}
            </p>
          )}
        </div>
      </div>

      <div className="px-4 pb-4 pt-2">
        {/* One raised bar holds the whole composer, so the attach button, the
            field and Send read as a single control rather than three outlined
            boxes sitting next to each other. */}
        <div className="mx-auto flex w-full max-w-2xl items-end gap-2 rounded-2xl bg-white/[0.06] p-1.5 focus-within:bg-white/[0.09]">
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="shrink-0 rounded-lg p-2 text-white/40 transition hover:bg-white/[0.07] hover:text-white"
            title="Add image"
          >
            <ImagePlus className="h-4 w-4" />
          </button>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); }
            }}
            rows={1}
            placeholder={image ? 'What should we change?' : 'Add an image to start…'}
            className="max-h-32 flex-1 resize-none bg-transparent px-1 py-1.5 text-[13px] text-zinc-100 outline-none placeholder:text-white/30"
          />
          <button
            type="button"
            onClick={() => { void send(); }}
            disabled={busy || !input.trim()}
            className="shrink-0 rounded-xl bg-cyan-500/90 p-2 text-white transition hover:bg-cyan-400 disabled:opacity-25"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void loadFile(f); e.target.value = ''; }}
      />
    </div>
  );
};
