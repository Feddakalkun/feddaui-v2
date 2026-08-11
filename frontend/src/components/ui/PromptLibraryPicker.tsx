import { useEffect, useState } from 'react';
import { Loader2, Search, X } from 'lucide-react';
import { BACKEND_API } from '../../config/api';

/**
 * Pick a prompt that already worked.
 *
 * The library is built from ComfyUI's own metadata, so every row here produced
 * an image that was kept - with the negative it ran with, the model, and how
 * many times it was repeated. That last number is the useful one: a prompt run
 * forty-three times is the one you actually want back.
 *
 * Shown as thumbnails rather than a list of sentences. What you remember about a
 * prompt is the picture it made, not its wording.
 */

interface LibraryRow {
  id: string;
  positive: string;
  negative: string;
  model: string;
  image: string;
  count: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onPick: (positive: string, negative: string) => void;
}

/**
 * A 360px cached JPEG from the backend, not the original.
 *
 * ComfyUI's /view serves the full render: the first one measured 8.5 MB as PNG,
 * and its `preview=webp` re-encodes without resizing - 260 kB but still
 * 3840x2560. A grid of 120 of those decodes to gigabytes of bitmap, which is why
 * none of them appeared.
 */
const thumbUrl = (rel: string) =>
  `${BACKEND_API.BASE_URL}/api/prompt-library/thumb?path=${encodeURIComponent(rel)}`;


export const PromptLibraryPicker = ({ open, onClose, onPick }: Props) => {
  const [rows, setRows] = useState<LibraryRow[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [built, setBuilt] = useState<string | null>(null);
  const [rebuilding, setRebuilding] = useState(false);

  const load = (q: string) => {
    setLoading(true);
    fetch(`${BACKEND_API.BASE_URL}/api/prompt-library?limit=120&q=${encodeURIComponent(q)}`)
      .then((r) => r.json())
      .then((d) => { setRows(d?.prompts || []); setBuilt(d?.built || null); })
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  };

  // Debounced so typing does not fire a request per keystroke.
  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => load(query), query ? 250 : 0);
    return () => window.clearTimeout(id);
  }, [open, query]);

  const rebuild = async () => {
    setRebuilding(true);
    try {
      await fetch(`${BACKEND_API.BASE_URL}/api/prompt-library/rebuild`, { method: 'POST' });
      load(query);
    } finally { setRebuilding(false); }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-6"
      onClick={onClose}
    >
      <div
        className="flex h-full max-h-[82vh] w-full max-w-[1200px] flex-col rounded-2xl border border-white/10 bg-[#0b0c12] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-white/10 p-4">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/25" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search your prompts…"
              className="w-full rounded-xl border border-white/10 bg-black/40 py-2 pl-9 pr-3 text-sm text-white/90 outline-none focus:border-violet-500/40"
            />
          </div>
          <button
            type="button"
            onClick={() => void rebuild()}
            disabled={rebuilding}
            title="Rescan generated images for new prompts"
            className="rounded-lg border border-white/10 px-3 py-2 text-[11px] text-white/50 transition hover:text-white/80 disabled:opacity-40"
          >
            {rebuilding ? 'Rescanning…' : 'Rescan'}
          </button>
          <button type="button" onClick={onClose} className="p-2 text-white/40 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          {loading && (
            <div className="flex items-center gap-2 p-6 text-sm text-white/40">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          )}
          {!loading && rows.length === 0 && (
            <p className="p-6 text-sm leading-relaxed text-white/35">
              {query
                ? 'Nothing matches that.'
                : 'No prompts yet. Rescan reads the prompt out of every image you have generated.'}
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {rows.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => { onPick(row.positive, row.negative || ''); onClose(); }}
                title={row.positive}
                className="group overflow-hidden rounded-xl border border-white/10 bg-black/30 text-left transition hover:border-violet-500/40"
              >
                <div className="relative aspect-[4/3] overflow-hidden bg-black/50">
                  <img
                    src={thumbUrl(row.image)}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover transition group-hover:scale-[1.03]"
                  />
                  {row.count > 1 && (
                    <span className="absolute right-1.5 top-1.5 rounded-full bg-black/75 px-2 py-0.5 text-[10px] text-violet-200">
                      ×{row.count}
                    </span>
                  )}
                </div>
                <div className="p-2.5">
                  <p className="line-clamp-3 text-[11px] leading-relaxed text-white/70">{row.positive}</p>
                  {row.model && (
                    <p className="mt-1.5 truncate text-[9px] uppercase tracking-wider text-white/25">
                      {row.model.replace('.safetensors', '')}
                    </p>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="border-t border-white/10 px-4 py-2 text-[10px] text-white/25">
          {rows.length} prompts{built ? ` · built ${built.slice(0, 16).replace('T', ' ')}` : ''}
          {' · from the images you generated, with the negative they ran with'}
        </div>
      </div>
    </div>
  );
};
