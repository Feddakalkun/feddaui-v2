import { useRef, useState } from 'react';
import { Boxes, Loader2, Upload, Users } from 'lucide-react';
import { CharacterBrowser } from '../components/library/CharacterBrowser';
import { ModelOverview } from '../components/library/ModelOverview';
import { useInstalledLoras } from '../components/library/useInstalledLoras';
import { useLoraUpload } from '../components/library/useLoraUpload';
import { cn } from '../lib/styles';

/**
 * Characters, and the model buttons that feed them.
 *
 * Family is a FILTER, not a hard split: a character (app/<Name>/) commonly owns
 * LoRAs for several models at once, so tabbing by family used to scatter one
 * character across unrelated tabs. `prefixes` are matched as substrings, the
 * same rule the workflow pages use.
 *
 * Each model button is also its own drop target. That replaces the old page-wide
 * "Add LoRAs" button, which could not know which model a file was for and
 * dumped everything into one folder - the workflow pickers filter by folder, so
 * a LoRA in the wrong one is invisible where you need it.
 */
type Family = {
  key: string;
  label: string;
  prefixes: string[];
  /** Folder uploads land in. "All" has none of its own. */
  folder?: string;
};

const FAMILIES: Family[] = [
  { key: 'all', label: 'All', prefixes: [] },
  { key: 'z-image', label: 'Z-Image', prefixes: ['zimage', 'z-image'], folder: 'z-image' },
  { key: 'qwen', label: 'Qwen', prefixes: ['qwen'], folder: 'qwen' },
  { key: 'wan', label: 'WAN', prefixes: ['wan'], folder: 'wan' },
  { key: 'ltx', label: 'LTX', prefixes: ['ltx'], folder: 'ltx' },
  { key: 'krea2', label: 'Krea2', prefixes: ['krea'], folder: 'krea2' },
  { key: 'flux2klein', label: 'FLUX2-KLEIN', prefixes: ['flux2klein', 'flux'], folder: 'flux2klein' },
  { key: 'sdxl', label: 'SDXL', prefixes: ['sdxl'], folder: 'sdxl' },
  { key: 'sd15', label: 'SD 1.5', prefixes: ['sd15'], folder: 'sd15' },
];

export const LibraryPage = () => {
  const [view, setView] = useState<'characters' | 'models'>('characters');
  const [familyKey, setFamilyKey] = useState('all');
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [pickFor, setPickFor] = useState<string>('imported');
  const fileInput = useRef<HTMLInputElement>(null);

  const family = FAMILIES.find((f) => f.key === familyKey) ?? FAMILIES[0];
  const { loras, refresh } = useInstalledLoras();
  const { upload, state: uploadState, errors, exts, clearErrors } = useLoraUpload('imported', refresh);

  const dropOn = (f: Family) => (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDropTarget(null);
    const files = Array.from(e.dataTransfer.files ?? []);
    if (files.length) void upload(files, f.folder ?? 'imported');
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#07080d]">
      <div className="shrink-0 border-b border-white/5 px-6 pb-3 pt-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <p className="v14-kicker text-white/45">Models &amp; LoRAs</p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-white">
              {view === 'characters' ? 'Characters' : 'Models'}
            </h1>
          </div>
          {uploadState && (
            <span className="flex items-center gap-2 text-[11px] text-zinc-400">
              <Loader2 className="h-3 w-3 animate-spin" />
              Uploading {uploadState.done + 1}/{uploadState.total} · {uploadState.current}
            </span>
          )}
        </div>

        <div className="mt-3 flex gap-1 rounded-lg border border-white/10 bg-black/30 p-0.5 w-fit">
          {([['characters', 'Characters', Users], ['models', 'Models', Boxes]] as const).map(([key, label, Icon]) => (
            <button
              key={key}
              onClick={() => setView(key)}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-3 py-1 text-[11px] font-semibold transition',
                view === key ? 'bg-white text-black' : 'text-white/50 hover:text-white',
              )}
            >
              <Icon className="h-3 w-3" />
              {label}
            </button>
          ))}
        </div>

        {view === 'characters' && (
        <>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {FAMILIES.map((f) => {
            const isDrop = dropTarget === f.key;
            return (
              <div
                key={f.key}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDropTarget(f.key);
                }}
                onDragLeave={() => setDropTarget((cur) => (cur === f.key ? null : cur))}
                onDrop={dropOn(f)}
                className={cn(
                  'flex items-center gap-1 rounded-md border px-2.5 py-1 text-[10px] font-semibold transition',
                  isDrop
                    ? 'border-emerald-400/60 bg-emerald-500/15 text-emerald-200'
                    : familyKey === f.key
                      ? 'border-white/30 bg-white/10 text-white'
                      : 'border-white/10 bg-white/[0.02] text-white/45 hover:text-white/80',
                )}
              >
                <button type="button" onClick={() => setFamilyKey(f.key)}>
                  {isDrop ? `Drop → ${f.folder ?? 'imported'}/` : f.label}
                </button>
                <button
                  type="button"
                  title={`Add a LoRA to ${f.folder ?? 'imported'}/`}
                  onClick={() => {
                    setPickFor(f.folder ?? 'imported');
                    fileInput.current?.click();
                  }}
                  className="text-white/25 transition hover:text-white/80"
                >
                  <Upload className="h-2.5 w-2.5" />
                </button>
              </div>
            );
          })}
        </div>

        <p className="mt-2 text-[10px] text-white/25">
          Drag a LoRA onto a model to install it there — the folder decides which workflows see it.
        </p>
        </>
        )}

        <input
          ref={fileInput}
          type="file"
          multiple
          accept={exts.join(',')}
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            if (files.length) void upload(files, pickFor);
            e.target.value = '';
          }}
        />

        {errors.length > 0 && (
          <div className="mt-2 flex items-start justify-between gap-3 rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-1.5">
            <ul className="space-y-0.5 text-[10px] text-amber-300/80">
              {errors.slice(0, 4).map((e) => <li key={e}>{e}</li>)}
            </ul>
            <button onClick={clearErrors} className="text-[10px] text-amber-300/50 hover:text-amber-300">
              dismiss
            </button>
          </div>
        )}
      </div>

      <div className="custom-scrollbar flex-1 overflow-y-auto px-6 py-4">
        {view === 'characters'
          ? <CharacterBrowser familyPrefixes={family.prefixes} refreshKey={loras.length} />
          : <ModelOverview />}
      </div>
    </div>
  );
};
