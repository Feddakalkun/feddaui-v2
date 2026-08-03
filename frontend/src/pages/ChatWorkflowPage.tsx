import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Loader2, Play, RotateCcw, Upload } from 'lucide-react';
import { BACKEND_API } from '../config/api';
import { ChatImage } from '../components/chat/ChatImage';
import { useComfyExecution } from '../contexts/ComfyExecutionContext';
import { cn } from '../lib/styles';

/**
 * Run ANY workflow through a conversation.
 *
 * There is no per-workflow code here: `workflow_api.json` already declares each
 * workflow's typed, labelled inputs, and the backend classifies them into
 * controls with defaults read from the graph itself. So LTX First/Last asks for
 * two frames and a prompt, and a new workflow works the moment it is declared.
 *
 * Typing every setting is slower than a form, so the agent drives the
 * conversation while the controls sit right there to click - the chat handles
 * intent, the buttons handle values.
 */

type Field = {
  key: string;
  label: string;
  control: 'file' | 'text' | 'chips' | 'number';
  required?: boolean;
  options?: string[];
  default?: string | number;
  accept?: 'image' | 'audio' | 'video';
};

type Msg = { role: 'user' | 'agent'; text: string; image?: string };

const viewUrl = (filename: string, subfolder = '', type = 'output') =>
  `/comfy/view?filename=${encodeURIComponent(filename)}` +
  `&subfolder=${encodeURIComponent(subfolder)}&type=${type}`;

export const ChatWorkflowPage = ({ workflowId }: { workflowId: string }) => {
  const [fields, setFields] = useState<Field[]>([]);
  const [name, setName] = useState('');
  const [values, setValues] = useState<Record<string, string | number>>({});
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragField, setDragField] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  // Same reason as the chat editor: /api/generate skips queueWorkflow, so
  // the context must be told a job started for the strip and preview to live.
  const { registerNodeMap, startExecution, previewUrl } = useComfyExecution();

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

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
        setMessages([{ role: 'agent', text: `${data.name}. What are we making?` }]);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { cancelled = true; };
  }, [workflowId]);

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
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  const missing = fields.filter((f) => f.required && !values[f.key]);
  // Files have to be handed over by hand; everything else the agent fills in
  // from the conversation, so it does not belong on screen by default.
  const fileFields = fields.filter((f) => f.control === 'file');
  const settingFields = fields.filter((f) => f.control !== 'file');

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    setError(null);
    setMessages((m) => [...m, { role: 'user', text }]);
    setBusy(true);
    try {
      const res = await fetch(`${BACKEND_API.BASE_URL}/api/chat-workflow/turn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflow_id: workflowId,
          message: text,
          filled: values,
          history: messages.map((m) => ({
            role: m.role === 'agent' ? 'assistant' : 'user', content: m.text,
          })),
        }),
      });
      if (!res.ok) throw new Error((await res.json()).detail || 'Agent unavailable — is Ollama running?');
      const data = await res.json();
      if (data.set && Object.keys(data.set).length) {
        setValues((v) => ({ ...v, ...data.set }));
      }
      setMessages((m) => [...m, { role: 'agent', text: data.reply }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const run = async () => {
    if (missing.length || running) return;
    setRunning(true);
    setError(null);
    setMessages((m) => [...m, { role: 'agent', text: 'Running…' }]);
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
        body: JSON.stringify({ workflow_id: workflowId, params: values }),
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
        if (data.status === 'completed') {
          const images = Array.isArray(data.images) ? data.images : [];
          const picked = images.find((im: { type?: string }) => im.type === 'output') || images[0];
          setMessages((m) => [...m, {
            role: 'agent',
            text: picked ? 'Done.' : 'Finished, but no image came back.',
            image: picked ? viewUrl(picked.filename, picked.subfolder || '', picked.type) : undefined,
          }]);
          return;
        }
        if (data.status === 'not_found' && i > 8) throw new Error('Job vanished from ComfyUI history');
      }
      throw new Error('Timed out waiting for output');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
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
            e.preventDefault();
            setDragField(null);
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
            ? <img src={viewUrl(String(value), '', 'input')} alt="" className="h-7 w-7 rounded object-cover" />
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

  return (
    <div className="flex h-full flex-col bg-[#050506]">
      <div className="flex items-center gap-2 px-4 py-2.5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">
          {name || workflowId}
        </p>
        <span className="text-[10px] text-white/25">
          {missing.length ? `${missing.length} still needed` : 'ready'}
        </span>
        <button
          type="button"
          onClick={() => { setMessages([]); setValues({}); setError(null); }}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[10px] font-semibold text-white/45 transition hover:bg-white/[0.06] hover:text-white"
        >
          <RotateCcw className="h-3 w-3" /> Reset
        </button>
      </div>

      <div ref={scroller} className="custom-scrollbar flex-1 overflow-y-auto px-4 py-5">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
          {messages.map((m, i) => (
            <div key={i} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
              <div className={cn('max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[13px]',
                m.role === 'user' ? 'bg-cyan-500/15 text-cyan-50'
                                  : 'bg-white/[0.06] text-zinc-200')}>
                <p className="whitespace-pre-wrap">{m.text}</p>
                {m.image && <ChatImage src={m.image} />}
              </div>
            </div>
          ))}
          {running && previewUrl && (
            <div className="flex justify-start">
              <ChatImage src={previewUrl} dim />
            </div>
          )}
          {error && (
            <p className="rounded-xl bg-red-500/12 px-3 py-2 text-[12px] text-red-300">
              {error}
            </p>
          )}
        </div>
      </div>

      <div className="px-4 pb-4 pt-2">
        <div className="mx-auto w-full max-w-3xl">
          {/* Only what the user must hand over lives out here: files cannot be
              typed. Prompts and sampler settings are the agent's job, so they
              stay out of sight - a parameter grid above the composer is the
              exact thing this page exists to replace. */}
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
              placeholder="Tell it what you want, or just fill the fields…"
              className="max-h-32 flex-1 resize-none bg-transparent px-1 py-1.5 text-[13px] text-zinc-100 outline-none placeholder:text-white/30"
            />
            <button
              type="button"
              onClick={() => { void send(); }}
              disabled={busy || !input.trim()}
              className="shrink-0 rounded-xl px-3 py-2 text-[12px] text-white/55 transition hover:bg-white/[0.07] hover:text-white disabled:opacity-25"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send'}
            </button>
            <button
              type="button"
              onClick={() => { void run(); }}
              disabled={Boolean(missing.length) || running}
              title={missing.length ? `Still needs: ${missing.map((f) => f.label).join(', ')}` : 'Run'}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-cyan-500/90 px-3.5 py-2 text-[12px] font-semibold text-white transition hover:bg-cyan-400 disabled:opacity-25"
            >
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              Run
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
