import { useEffect, useMemo, useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { BACKEND_API } from '../../config/api';
import { cn } from '../../lib/styles';

/**
 * Builds a video prompt so the user does not have to write one.
 *
 * Describing motion for LTX is a skill: it wants a timeline, it wants the
 * subject described rather than referred to, and a LoRA does nothing without
 * its trigger word. Most people will not learn all three, and the ones who do
 * still would rather click.
 *
 * Everything specific lives on the server - the action catalogue is a config
 * file, the trigger words come from sidecars written when a LoRA was imported.
 * This component knows about neither, which is what lets it work for LoRAs and
 * actions that did not exist when it was written.
 */

type Action = {
  key: string;
  label: string;
  category: string;
  nsfw?: boolean;
  needs?: { people?: number };
};

interface Props {
  /** ComfyUI input filename of the frame being animated, if there is one. */
  image?: string | null;
  /** Only LoRAs under this path prefix are offered, e.g. "ltx". */
  loraPrefix?: string;
  seconds?: number;
  /** Called with the finished prompt; the page decides where it goes. */
  onPrompt: (prompt: string) => void;
}

export const PromptBuilder = ({ image, loraPrefix = '', seconds = 5, onPrompt }: Props) => {
  const [actions, setActions] = useState<Action[]>([]);
  const [categories, setCategories] = useState<{ key: string; label: string }[]>([]);
  const [loras, setLoras] = useState<{ path: string; name: string; trigger_words: string[] }[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [pickedLoras, setPickedLoras] = useState<Set<string>>(new Set());
  const [extra, setExtra] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${BACKEND_API.BASE_URL}/api/prompt-builder/actions`);
        const data = await res.json();
        if (data.success) { setActions(data.actions); setCategories(data.categories); }
      } catch { /* the builder is optional; the prompt box still works */ }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(
          `${BACKEND_API.BASE_URL}/api/prompt-builder/loras?prefix=${encodeURIComponent(loraPrefix)}`);
        const data = await res.json();
        if (data.success) setLoras(data.loras);
      } catch { setLoras([]); }
    })();
  }, [loraPrefix]);

  const byCategory = useMemo(() => categories.map((c) => ({
    ...c, items: actions.filter((a) => a.category === c.key),
  })).filter((c) => c.items.length), [categories, actions]);

  const toggle = (set: Set<string>, key: string, apply: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key); else next.add(key);
    apply(next);
  };

  const build = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${BACKEND_API.BASE_URL}/api/prompt-builder/compose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actions: [...picked], loras: [...pickedLoras],
          image: image || null, extra, seconds,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.detail || 'Could not build a prompt');
      onPrompt(data.prompt);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      {byCategory.map((c) => (
        <div key={c.key}>
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
            {c.label}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {c.items.map((a) => (
              <button
                key={a.key}
                type="button"
                onClick={() => toggle(picked, a.key, setPicked)}
                title={a.needs?.people ? `Expects ${a.needs.people} people in the frame` : undefined}
                className={cn(
                  'rounded-lg px-2.5 py-1 text-[11px] font-semibold transition',
                  picked.has(a.key)
                    ? 'bg-violet-500/20 text-violet-100 ring-1 ring-violet-400/40'
                    : 'bg-white/[0.04] text-white/45 hover:bg-white/[0.08] hover:text-white',
                )}
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>
      ))}

      {loras.length > 0 && (
        <div>
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
            LoRAs
          </div>
          <div className="custom-scrollbar max-h-28 space-y-0.5 overflow-y-auto pr-1">
            {loras.map((l) => (
              <button
                key={l.path}
                type="button"
                onClick={() => toggle(pickedLoras, l.path, setPickedLoras)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[11px] transition',
                  pickedLoras.has(l.path)
                    ? 'bg-violet-500/15 text-violet-100' : 'text-white/45 hover:bg-white/[0.05]',
                )}
              >
                <span className="min-w-0 flex-1 truncate">{l.name.replace(/\.safetensors$/, '')}</span>
                {/* Only shown when there is one - most LoRAs have no trigger, and
                    an empty badge would imply the lookup failed. */}
                {l.trigger_words.length > 0 && (
                  <span className="shrink-0 rounded bg-black/40 px-1.5 py-0.5 font-mono text-[9px] text-amber-300/80">
                    {l.trigger_words[0]}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      <input
        value={extra}
        onChange={(e) => setExtra(e.target.value)}
        placeholder="Anything to add…"
        className="w-full rounded-lg border border-white/10 bg-black/35 px-3 py-2 text-[12px] text-zinc-100 outline-none transition focus:border-white/25"
      />

      <button
        type="button"
        onClick={() => { void build(); }}
        disabled={busy || (picked.size === 0 && !extra.trim())}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-2 text-[11px] font-semibold text-violet-200 transition hover:border-violet-400/50 hover:bg-violet-500/15 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
        {busy ? (image ? 'Reading the frame…' : 'Writing…') : 'Write prompt'}
      </button>

      {image ? (
        <p className="text-[10px] leading-relaxed text-white/30">
          The first frame is read and described, so the prompt names who is in it.
        </p>
      ) : (
        <p className="text-[10px] leading-relaxed text-white/30">
          Add a frame first and the prompt will describe what is actually in it.
        </p>
      )}

      {error && <p className="text-[11px] text-red-300">{error}</p>}
    </div>
  );
};
