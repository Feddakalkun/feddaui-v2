import { useEffect, useRef, useState } from 'react';
import { Loader2, Send, Sparkles } from 'lucide-react';
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
  /** Called with the finished prompt; the page decides where it goes. */
  onPrompt: (prompt: string) => void;
}

export const PromptAgentBox = ({ workflowId, image, seconds = 5, onPrompt }: Props) => {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  // Opening turn, the moment an image appears.
  useEffect(() => {
    if (!image || openedFor.current === image) return;
    openedFor.current = image;
    setMessages([]);
    void turn('', []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image]);

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
            {image
              ? 'Reading your image…'
              : 'Add a frame and I will tell you what I see, then write the prompt with you.'}
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
        {error && <p className="text-[11px] text-red-300">{error}</p>}
      </div>

      <div className="flex items-end gap-1.5 p-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
          }}
          rows={1}
          placeholder={image ? 'What should happen?' : 'Describe what you want…'}
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
