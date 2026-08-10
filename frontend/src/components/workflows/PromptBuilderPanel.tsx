import { useEffect, useState } from 'react';
import { Dices, Loader2, Save, Trash2, Wand2 } from 'lucide-react';
import { BACKEND_API } from '../../config/api';
import { usePersistentState } from '../../hooks/usePersistentState';
import { cn } from '../../lib/styles';

/**
 * Pick the picture from dropdowns, let the model write it.
 *
 * The catalogue (config/prompt_builder.json) owns the English wording, which is
 * the whole point of the split: you choose "micro bikini" or "metro carriage"
 * and the vocabulary comes from the file, not from remembering the phrasing.
 * Selections are sent as a brief - the model still writes one flowing
 * description, because handing the sampler a comma-separated dump of fourteen
 * dropdowns is what this was meant to avoid.
 *
 * Setups are saved by name, per page, so a look you like survives a reload.
 */

type Option = { value: string; label: string; words: string };
type Group = { key: string; label: string; control: 'single' | 'multi'; default?: string; options: Option[] };
type Picks = Record<string, string | string[]>;
type Preset = { name: string; picks: Picks };

interface Props {
  workflowId: string;
  /** Namespace for the saved picks and setups, so pages do not share them. */
  storageKey: string;
  onPrompt: (prompt: string) => void;
}

export const PromptBuilderPanel = ({ workflowId, storageKey, onPrompt }: Props) => {
  const [groups, setGroups] = useState<Group[]>([]);
  const [picks, setPicks] = usePersistentState<Picks>(`${storageKey}_builder_picks`, {});
  const [presets, setPresets] = usePersistentState<Preset[]>(`${storageKey}_builder_presets`, []);
  const [presetName, setPresetName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${BACKEND_API.BASE_URL}/api/prompt-builder/catalog`);
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.detail || 'Could not load the picker');
        setGroups(data.groups || []);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  const setSingle = (key: string, value: string) =>
    setPicks((p) => ({ ...p, [key]: value }));

  const toggleMulti = (key: string, value: string) =>
    setPicks((p) => {
      const cur = Array.isArray(p[key]) ? (p[key] as string[]) : [];
      return { ...p, [key]: cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value] };
    });

  const chosenCount = Object.values(picks).filter(
    (v) => (Array.isArray(v) ? v.length > 0 : !!v)).length;

  // A roll of the dice on every single-choice group. Multi groups are left
  // alone: randomising fifteen face details at once produces a description
  // nobody asked for rather than a face.
  const surprise = () => {
    const next: Picks = { ...picks };
    for (const g of groups) {
      if (g.control !== 'single' || !g.options.length) continue;
      next[g.key] = g.options[Math.floor(Math.random() * g.options.length)].value;
    }
    setPicks(next);
  };

  const write = async () => {
    if (busy || chosenCount === 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${BACKEND_API.BASE_URL}/api/prompt-agent/turn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflow_id: workflowId,
          kind: 'image',
          picks,
          message: 'Build the prompt from my selections.',
          history: [],
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.detail || 'Agent unavailable — is Ollama running?');
      const text = (data.prompt || data.reply || '').trim();
      if (!text) throw new Error('The model returned nothing');
      onPrompt(text);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const savePreset = () => {
    const name = presetName.trim();
    if (!name) return;
    setPresets((prev) => [...prev.filter((p) => p.name !== name), { name, picks }]);
    setPresetName('');
  };

  if (error && !groups.length) {
    return <p className="px-1 text-[11px] text-red-300">{error}</p>;
  }
  if (!groups.length) {
    return (
      <p className="flex items-center gap-1.5 px-1 text-[11px] text-white/35">
        <Loader2 className="h-3 w-3 animate-spin" /> loading the picker…
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {presets.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Setups</span>
          {presets.map((p) => (
            <span key={p.name} className="group inline-flex items-center overflow-hidden rounded-md bg-white/[0.06]">
              <button
                type="button"
                onClick={() => setPicks(p.picks)}
                className="px-2 py-1 text-[11px] text-white/70 transition hover:bg-white/[0.1] hover:text-white"
              >
                {p.name}
              </button>
              <button
                type="button"
                title="Delete setup"
                onClick={() => setPresets((prev) => prev.filter((x) => x.name !== p.name))}
                className="px-1.5 py-1 text-white/25 transition hover:text-red-300"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {groups.map((g) => (
          <div key={g.key}>
            <label className="text-[10px] font-black uppercase tracking-widest text-white/40">{g.label}</label>
            {g.control === 'single' ? (
              <select
                value={(picks[g.key] as string) ?? ''}
                onChange={(e) => setSingle(g.key, e.target.value)}
                className="mt-1 w-full rounded-md border border-white/10 bg-black/35 px-2 py-1.5 text-[12px] text-zinc-100 outline-none transition focus:border-white/25"
              >
                <option value="">— any —</option>
                {g.options.map((o) => (
                  <option key={o.value} value={o.value} title={o.words}>{o.label}</option>
                ))}
              </select>
            ) : (
              <div className="mt-1 flex flex-wrap gap-1">
                {g.options.map((o) => {
                  const on = Array.isArray(picks[g.key]) && (picks[g.key] as string[]).includes(o.value);
                  return (
                    <button
                      key={o.value}
                      type="button"
                      title={o.words}
                      onClick={() => toggleMulti(g.key, o.value)}
                      className={cn(
                        'rounded-full px-2 py-0.5 text-[11px] transition',
                        on ? 'bg-emerald-400/20 text-emerald-100' : 'bg-white/[0.06] text-white/50 hover:bg-white/[0.1]',
                      )}
                    >
                      {o.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={write}
          disabled={busy || chosenCount === 0}
          className="inline-flex items-center gap-1.5 rounded-lg bg-violet-500/80 px-3 py-1.5 text-[12px] font-semibold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-30"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
          {busy ? 'Writing…' : `Write the prompt (${chosenCount})`}
        </button>
        <button
          type="button"
          onClick={surprise}
          title="Random pick in every dropdown"
          className="inline-flex items-center gap-1.5 rounded-lg bg-white/[0.06] px-2.5 py-1.5 text-[12px] text-white/70 transition hover:bg-white/[0.1]"
        >
          <Dices className="h-3.5 w-3.5" /> Surprise me
        </button>
        <button
          type="button"
          onClick={() => setPicks({})}
          className="rounded-lg px-2 py-1.5 text-[11px] text-white/35 transition hover:text-white/70"
        >
          Clear
        </button>

        <span className="ml-auto flex items-center gap-1.5">
          <input
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); savePreset(); } }}
            placeholder="name this setup"
            className="w-32 rounded-md border border-white/10 bg-black/35 px-2 py-1.5 text-[11px] text-zinc-100 outline-none focus:border-white/25"
          />
          <button
            type="button"
            onClick={savePreset}
            disabled={!presetName.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-white/[0.06] px-2.5 py-1.5 text-[11px] text-white/70 transition hover:bg-white/[0.1] disabled:opacity-30"
          >
            <Save className="h-3.5 w-3.5" /> Save
          </button>
        </span>
      </div>

      {error && <p className="text-[11px] text-red-300">{error}</p>}
    </div>
  );
};
