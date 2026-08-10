import { useEffect, useRef, useState } from 'react';
import { Download, Loader2, Send, Sparkles } from 'lucide-react';
import { BACKEND_API } from '../../config/api';
import { cn } from '../../lib/styles';

/**
 * Writes the prompt by talking, instead of handing over another button.
 *
 * The chips and the enhance button both assumed the user already knew what to
 * ask for. This starts the other way round: the moment an image lands it says
 * what it can see - two women in a kitchen, warm evening light - and only then
 * asks what should happen. Naming the picture is what proves it looked at
 * *this* image and makes the question worth answering.
 *
 * It opens by itself on a new image. Waiting to be clicked is the same failure
 * as the enhance button.
 */

type Msg = { role: 'user' | 'agent'; text: string };

interface Props {
  workflowId: string;
  /** ComfyUI input filename of the frame being animated, if there is one. */
  image?: string | null;
  seconds?: number;
  /** 'image' switches the agent off clips: no motion, no timeline, no sound.
   *  'outpaint' switches it off editing: the picture is kept and continued. */
  kind?: 'video' | 'image' | 'outpaint';
  /** Outpaint only: pixels per edge, so the agent reads the side being extended. */
  edges?: Record<string, number>;
  /** Called with the finished prompt; the page decides where it goes. */
  onPrompt: (prompt: string) => void;
}

export const PromptAgentBox = ({ workflowId, image, seconds = 5, kind = 'video', edges, onPrompt }: Props) => {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pulling, setPulling] = useState<string | null>(null);
  // Which image we have already opened on, so re-renders do not re-trigger and
  // swapping the frame does start a fresh read.
  const openedFor = useRef<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  const turn = async (message: string, history: Msg[]) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${BACKEND_API.BASE_URL}/api/prompt-agent/turn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflow_id: workflowId,
          image: image || null,
          message,
          seconds,
          kind,
          edges: kind === 'outpaint' ? edges ?? null : null,
          history: history.map((m) => ({
            role: m.role === 'agent' ? 'assistant' : 'user', content: m.text,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.detail || 'Agent unavailable — is Ollama running?');
      setMessages([...history, { role: 'agent', text: data.reply }]);
      if (data.prompt) onPrompt(data.prompt);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  // With no image the greeting is a fixed line, not a generated one. There is
  // nothing to say that depends on anything, so asking a model to produce it
  // only bought a round-trip and a chance to invent a room full of bookshelves.
  // With an image the opening turn is worth the call - it has to look first.
  // Which edges are being extended, as a stable string. The object is rebuilt
  // on every render, so depending on it directly would re-read the image
  // continuously; and switching Left to Right has to re-read, because the whole
  // answer depends on which side it looked at.
  const edgeSig = kind === 'outpaint'
    ? (['left', 'top', 'right', 'bottom'] as const)
        .map((s) => `${s}${edges?.[s] ?? 0}`).join(',')
    : '';

  useEffect(() => {
    const key = `${image ?? '__no-image__'}|${edgeSig}`;
    if (openedFor.current === key) return;
    openedFor.current = key;
    if (!image) {
      setMessages([{
        role: 'agent',
        text: kind === 'outpaint'
          ? "Load the picture you want extended and pick an edge — I'll read that side and write what should continue out there."
          : kind === 'image'
          ? "I'm your prompt agent. Give me a couple of keywords and I'll write the picture for you."
          : "I'm your prompt agent. Give me a couple of keywords and I'll write the scene for you.",
      }]);
      return;
    }
    setMessages([]);
    void turn('', []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image, edgeSig]);

  // The backend answers 503 "No local Ollama text model available." for this
  // case specifically, so it can be told apart from Ollama being down.
  const needsModel = !!error && /no local ollama text model/i.test(error);

  const pullModel = async () => {
    setPulling('Starting…');
    try {
      const res = await fetch(`${BACKEND_API.BASE_URL}/api/ollama/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),           // empty = the server's recommended model
      });
      if (!res.ok || !res.body) throw new Error('Could not start the download');
      // ndjson: report the last status line so a 7 GB pull is not a frozen button.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const msg = JSON.parse(line);
            if (msg.error) throw new Error(msg.error);
            if (msg.total && msg.completed) {
              setPulling(`${Math.round((msg.completed / msg.total) * 100)}%`);
            } else if (msg.status) {
              setPulling(String(msg.status));
            }
          } catch { /* a partial line is not an error */ }
        }
      }
      setError(null);
      setPulling(null);
      setMessages((m) => [...m, { role: 'agent', text: 'Model installed. Say what you want and I will write the prompt.' }]);
    } catch (e) {
      setPulling(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const send = () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    const withUser: Msg[] = [...messages, { role: 'user', text }];
    setMessages(withUser);
    void turn(text, withUser);
  };

  return (
    <div className="flex h-full flex-col rounded-xl border border-violet-500/20 bg-violet-500/[0.04]">
      <div className="flex items-center gap-1.5 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-200/60">
        <Sparkles className="h-3 w-3" /> Assistant
      </div>

      <div ref={scroller} className="custom-scrollbar min-h-[120px] flex-1 space-y-2 overflow-y-auto px-3 pb-2">
        {messages.length === 0 && !busy && (
          <p className="text-[11px] leading-relaxed text-white/30">
            {image ? (kind === 'outpaint' ? 'Reading that edge…' : 'Reading your image…') : ''}
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
            <div className={cn(
              'max-w-[90%] rounded-xl px-2.5 py-1.5 text-[11px] leading-relaxed whitespace-pre-wrap',
              m.role === 'user' ? 'bg-violet-500/15 text-violet-50' : 'bg-white/[0.06] text-zinc-200',
            )}>
              {m.text}
            </div>
          </div>
        ))}
        {busy && (
          <p className="flex items-center gap-1.5 text-[11px] text-white/35">
            <Loader2 className="h-3 w-3 animate-spin" /> thinking…
          </p>
        )}
        {/* A fresh install has Ollama running with nothing in it, so the very
            first thing a new user met here was a dead end - and since the
            Enhance button was removed this is the only prompt help there is.
            The missing piece is one download, so offer it rather than
            describing it. */}
        {error && needsModel && (
          <div className="space-y-1.5">
            <p className="text-[11px] text-amber-200/80">
              No prompt model installed yet. Ollama is running, it just has nothing to run.
            </p>
            <button
              type="button"
              onClick={pullModel}
              disabled={pulling !== null}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300/25 bg-amber-300/10 px-2.5 py-1.5 text-[11px] text-amber-100 transition hover:bg-amber-300/15 disabled:opacity-60"
            >
              {pulling !== null ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
              {pulling !== null ? (pulling || 'Downloading…') : 'Install the prompt model (~7 GB)'}
            </button>
          </div>
        )}
        {error && !needsModel && <p className="text-[11px] text-red-300">{error}</p>}
      </div>

      <div className="flex items-end gap-1.5 p-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
          }}
          rows={1}
          placeholder={
            kind === 'outpaint'
              ? (image ? 'What continues out there?' : 'load an image first…')
              : image ? 'What should happen?' : 'red devil girl, laughing…'
          }
          className="max-h-24 flex-1 resize-none rounded-lg border border-white/10 bg-black/35 px-2.5 py-1.5 text-[12px] text-zinc-100 outline-none transition focus:border-white/25"
        />
        <button
          type="button"
          onClick={send}
          disabled={busy || !input.trim()}
          title="Send"
          className="shrink-0 rounded-lg bg-violet-500/80 px-2.5 py-2 text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-30"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
};
