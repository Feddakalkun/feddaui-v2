import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Sparkles, KeyRound, Download, Cloud, FolderOpen, Check, Loader2, X } from 'lucide-react';
import { BACKEND_API } from '../../config/api';

const HIDE_KEY = 'fedda_setup_hidden';
const api = (path: string) => `${BACKEND_API.BASE_URL}${path}`;

type StatusData = {
  configured?: boolean;
  valid?: boolean;
  path?: string;
  exists?: boolean;
  balance?: { balances?: { usd?: number } };
};

type RowProps = {
  icon: ReactNode;
  iconClass: string;
  title: string;
  desc: string;
  help?: { label: string; url: string };
  statusUrl: string;
  saveUrl: string;
  bodyKey: string;
  type?: 'password' | 'text';
  placeholder: string;
  note?: string;
  describe?: (d: StatusData) => string | null;
};

function SettingRow(p: RowProps) {
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(false);
  const [extra, setExtra] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch(api(p.statusUrl), { cache: 'no-store' });
      const d: StatusData = await r.json();
      setConfigured(!!d?.configured);
      setExtra(p.describe ? p.describe(d) : null);
    } catch {
      /* keep last known state */
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.statusUrl]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = async () => {
    const v = value.trim();
    if (!v) return;
    setSaving(true);
    setErr(null);
    try {
      const r = await fetch(api(p.saveUrl), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [p.bodyKey]: v }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d?.detail || 'Could not save');
      }
      setValue('');
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
      <div className="flex items-start gap-3">
        <div className={`grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg border border-white/10 bg-white/[0.04] ${p.iconClass}`}>
          {p.icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h3 className="truncate text-[13px] font-semibold text-white/90">{p.title}</h3>
            {loading ? (
              <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                <Loader2 className="h-3 w-3 animate-spin" /> Checking
              </span>
            ) : configured ? (
              <span className="flex items-center gap-1 rounded-md border border-emerald-500/25 bg-emerald-500/[0.12] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-300">
                <Check className="h-3 w-3" /> Set
              </span>
            ) : (
              <span className="rounded-md border border-amber-500/25 bg-amber-500/[0.08] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-300">
                Not set
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[11.5px] leading-snug text-slate-400">
            {p.desc}
            {p.help && (
              <>
                {' '}
                <a
                  href={p.help.url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-cyan-300/90 underline decoration-cyan-300/30 underline-offset-2 hover:text-cyan-200"
                >
                  {p.help.label}
                </a>
              </>
            )}
          </p>
          <div className="mt-2.5 flex gap-2">
            <input
              type={p.type ?? 'password'}
              value={value}
              placeholder={p.placeholder}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void save();
              }}
              className="fedda-input min-w-0 flex-1 rounded-lg px-3 py-2 text-[12px] text-white/90"
            />
            <button
              onClick={() => void save()}
              disabled={saving || !value.trim()}
              className="flex-shrink-0 rounded-lg border border-white/12 bg-white/[0.05] px-3.5 py-2 text-[11px] font-bold uppercase tracking-wide text-white/80 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving ? '…' : 'Save'}
            </button>
          </div>
          {extra && <p className="mt-1.5 text-[11px] text-slate-500">{extra}</p>}
          {p.note && <p className="mt-1 text-[10.5px] italic text-slate-600">{p.note}</p>}
          {err && <p className="mt-1.5 text-[11px] text-red-300">{err}</p>}
        </div>
      </div>
    </div>
  );
}

const usd = (n?: number) => (typeof n === 'number' ? `$${n.toFixed(2)}` : null);

export function FirstRunModal({ onClose }: { onClose: () => void }) {
  const [showAtStartup, setShowAtStartup] = useState(true);

  const done = () => {
    try {
      if (showAtStartup) localStorage.removeItem(HIDE_KEY);
      else localStorage.setItem(HIDE_KEY, '1');
    } catch {
      /* private mode - just close */
    }
    onClose();
  };

  return (
    <div
      className="animate-fade-in fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) done();
      }}
    >
      <div className="animate-slide-up flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0b0c12] shadow-2xl">
        {/* Header */}
        <div className="relative flex-shrink-0 border-b border-white/[0.08] px-6 py-5">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-cyan-500/10 via-transparent to-fuchsia-500/10" />
          <button
            onClick={done}
            aria-label="Close"
            className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-500 transition hover:bg-white/5 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="relative flex items-center gap-3">
            <div className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.06]">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0">
              <h2 className="text-[17px] font-bold tracking-tight text-white">Welcome to FEDDA</h2>
              <p className="text-[12px] leading-snug text-slate-400">
                A couple of keys and a folder, and you&apos;re set. Skip anything — you can add it later.
              </p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="custom-scrollbar flex-1 space-y-3 overflow-y-auto px-6 py-5">
          <SettingRow
            icon={<KeyRound className="h-4 w-4" />}
            iconClass="text-amber-300"
            title="Hugging Face token"
            desc="Downloads models from Hugging Face — some gated ones need it. It's free."
            help={{ label: 'Get one →', url: 'https://huggingface.co/settings/tokens' }}
            statusUrl={BACKEND_API.ENDPOINTS.SETTINGS_HF_TOKEN_STATUS}
            saveUrl={BACKEND_API.ENDPOINTS.SETTINGS_HF_TOKEN}
            bodyKey="token"
            placeholder="hf_…"
          />
          <SettingRow
            icon={<Download className="h-4 w-4" />}
            iconClass="text-sky-300"
            title="Civitai API key"
            desc="Downloads LoRAs and models from Civitai."
            help={{ label: 'Get one →', url: 'https://civitai.com/user/account' }}
            statusUrl={BACKEND_API.ENDPOINTS.SETTINGS_CIVITAI_KEY_STATUS}
            saveUrl={BACKEND_API.ENDPOINTS.SETTINGS_CIVITAI_KEY}
            bodyKey="api_key"
            placeholder="Civitai API key"
          />
          <SettingRow
            icon={<Cloud className="h-4 w-4" />}
            iconClass="text-violet-300"
            title="Venice API key"
            desc="Optional — cloud images, chat and voice."
            help={{ label: 'Get one →', url: 'https://venice.ai/settings/api' }}
            statusUrl={BACKEND_API.ENDPOINTS.SETTINGS_VENICE_KEY_STATUS}
            saveUrl={BACKEND_API.ENDPOINTS.SETTINGS_VENICE_KEY}
            bodyKey="api_key"
            placeholder="Venice API key"
            describe={(d) =>
              d.configured
                ? d.valid === false
                  ? 'Saved, but Venice did not accept it.'
                  : usd(d.balance?.balances?.usd)
                    ? `Working — ${usd(d.balance?.balances?.usd)} balance`
                    : 'Working'
                : null
            }
          />
          <SettingRow
            icon={<FolderOpen className="h-4 w-4" />}
            iconClass="text-emerald-300"
            title="Model folder"
            desc="Keep the many gigabytes of models on another drive. Type a full path."
            statusUrl={BACKEND_API.ENDPOINTS.SETTINGS_MODEL_FOLDER_STATUS}
            saveUrl={BACKEND_API.ENDPOINTS.SETTINGS_MODEL_FOLDER}
            bodyKey="path"
            type="text"
            placeholder="D:\\FeddaModels"
            note="ComfyUI reads this at startup — restart FEDDA after setting it."
            describe={(d) => (d.path ? (d.exists ? `Using: ${d.path}` : `Not found: ${d.path}`) : null)}
          />
        </div>

        {/* Footer */}
        <div className="flex flex-shrink-0 items-center justify-between gap-3 border-t border-white/[0.08] px-6 py-4">
          <label className="flex cursor-pointer select-none items-center gap-2 text-[12px] text-slate-400">
            <input
              type="checkbox"
              checked={showAtStartup}
              onChange={(e) => setShowAtStartup(e.target.checked)}
              className="h-4 w-4 accent-white"
            />
            Show this at startup
          </label>
          <button
            onClick={done}
            className="rounded-lg bg-white px-5 py-2 text-[12px] font-bold uppercase tracking-wide text-black transition hover:bg-white/90"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
