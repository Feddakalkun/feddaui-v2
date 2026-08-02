import { useCallback, useEffect, useRef, useState } from 'react';
import { ImagePlus, Loader2, RotateCcw, Send, Undo2 } from 'lucide-react';
import { BACKEND_API } from '../../config/api';
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

export const ChatEditPage = () => {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [image, setImage] = useState<string | null>(null);   // current working image (data url)
  const [history, setHistory] = useState<string[]>([]);       // previous images, for undo
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

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
   * /api/generate only queues the job and hands back a prompt_id; the images
   * arrive by polling /api/generate/status. Reading the POST response for
   * images silently produced "no image came back" on every successful edit.
   */
  const runEdit = async (instruction: string): Promise<{ filename: string; url: string }> => {
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
        return {
          filename: picked.filename,
          url: viewUrl(picked.filename, picked.subfolder || '', picked.type || 'output'),
        };
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
        setMessages((m) => [...m, { role: 'agent', text: reply }]);
        return;
      }

      setMessages((m) => [...m, { role: 'agent', text: reply, pending: true }]);
      const result = await runEdit(edit);
      // The result becomes the input for the next turn - that loop is the
      // whole point of this page over the regular edit page.
      if (image) setHistory((h) => [...h, image]);
      setImage(result.filename);
      setMessages((m) => {
        const next = [...m];
        const i = next.findIndex((x) => x.pending);
        if (i >= 0) next[i] = { ...next[i], pending: false, image: result.url };
        return next;
      });
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
    setMessages((m) => [...m, { role: 'agent', text: 'Rolled back.', image: viewUrl(prev) }]);
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
      className={cn('relative flex h-full flex-col bg-[#050506]',
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
      <div className="flex items-center gap-2 border-b border-white/8 px-4 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">
          Chat Edit · Qwen
        </p>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={undo}
            disabled={!history.length}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1 text-[10px] font-semibold text-white/50 transition hover:text-white disabled:opacity-30"
          >
            <Undo2 className="h-3 w-3" /> Undo
          </button>
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1 text-[10px] font-semibold text-white/50 transition hover:text-white"
          >
            <RotateCcw className="h-3 w-3" /> New
          </button>
        </div>
      </div>

      <div ref={scroller} className="custom-scrollbar flex-1 overflow-y-auto px-4 py-5">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
          {messages.length === 0 && (
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-white/12 py-16 transition hover:border-white/25"
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
                  : 'border border-white/8 bg-white/[0.03] text-zinc-200',
              )}>
                <p className="whitespace-pre-wrap">{m.text}</p>
                {m.pending && (
                  <p className="mt-2 flex items-center gap-1.5 text-[11px] text-white/40">
                    <Loader2 className="h-3 w-3 animate-spin" /> editing…
                  </p>
                )}
                {m.image && (
                  <img src={m.image} alt="" className="mt-2.5 max-h-[420px] rounded-xl" />
                )}
              </div>
            </div>
          ))}

          {error && (
            <p className="rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-[12px] text-red-300">
              {error}
            </p>
          )}
        </div>
      </div>

      <div className="border-t border-white/8 px-4 py-3">
        <div className="mx-auto flex w-full max-w-2xl items-end gap-2">
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="shrink-0 rounded-xl border border-white/10 p-2.5 text-white/40 transition hover:text-white"
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
            className="max-h-32 flex-1 resize-none rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-[13px] text-zinc-100 outline-none placeholder:text-white/25 focus:border-white/20"
          />
          <button
            type="button"
            onClick={() => { void send(); }}
            disabled={busy || !input.trim()}
            className="shrink-0 rounded-xl bg-cyan-500/85 p-2.5 text-white transition hover:bg-cyan-400 disabled:opacity-30"
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
