import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Play, RotateCcw, Upload } from 'lucide-react';
import { BACKEND_API } from '../config/api';
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
  const scroller = useRef<HTMLDivElement>(null);

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
            'flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[11px] transition',
            dragField === f.key ? 'border-cyan-400/70 bg-cyan-500/10'
              : filled ? 'border-emerald-500/40 text-emerald-300'
              : 'border-white/12 text-white/45 hover:border-white/25',
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
              className={cn('rounded-full border px-2 py-0.5 text-[11px] transition',
                value === o ? 'border-cyan-400/60 bg-cyan-500/15 text-cyan-100'
                            : 'border-white/12 text-white/40 hover:text-white')}
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
            className="w-20 rounded-lg border border-white/12 bg-white/[0.03] px-2 py-1 text-[11px] text-zinc-100 outline-none focus:border-white/25"
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
          className="flex-1 rounded-lg border border-white/12 bg-white/[0.03] px-2 py-1 text-[11px] text-zinc-100 outline-none focus:border-white/25"
        />
      </label>
    );
  };

  return (
    <div className="flex h-full flex-col bg-[#050506]">
      <div className="flex items-center gap-2 border-b border-white/8 px-4 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">
          {name || workflowId}
        </p>
        <span className="text-[10px] text-white/25">
          {missing.length ? `${missing.length} still needed` : 'ready'}
        </span>
        <button
          type="button"
          onClick={() => { setMessages([]); setValues({}); setError(null); }}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1 text-[10px] font-semibold text-white/50 transition hover:text-white"
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
                                  : 'border border-white/8 bg-white/[0.03] text-zinc-200')}>
                <p className="whitespace-pre-wrap">{m.text}</p>
                {m.image && <img src={m.image} alt="" className="mt-2.5 max-h-[420px] rounded-xl" />}
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
        <div className="mx-auto w-full max-w-3xl">
          <div className="mb-2.5 flex flex-wrap items-center gap-2">{fields.map(control)}</div>
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); }
              }}
              rows={1}
              placeholder="Tell it what you want, or just fill the fields…"
              className="max-h-32 flex-1 resize-none rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-[13px] text-zinc-100 outline-none placeholder:text-white/25 focus:border-white/20"
            />
            <button
              type="button"
              onClick={() => { void send(); }}
              disabled={busy || !input.trim()}
              className="shrink-0 rounded-xl border border-white/12 px-3 py-2.5 text-[12px] text-white/60 transition hover:text-white disabled:opacity-30"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send'}
            </button>
            <button
              type="button"
              onClick={() => { void run(); }}
              disabled={Boolean(missing.length) || running}
              title={missing.length ? `Still needs: ${missing.map((f) => f.label).join(', ')}` : 'Run'}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-cyan-500/85 px-3.5 py-2.5 text-[12px] font-semibold text-white transition hover:bg-cyan-400 disabled:opacity-30"
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
