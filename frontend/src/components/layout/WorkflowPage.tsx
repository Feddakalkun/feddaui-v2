import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ChevronDown, Loader2, type LucideIcon } from 'lucide-react';
import { useToast } from '../ui/Toast';
import { usePersistentState } from '../../hooks/usePersistentState';
import { useWorkflowRun } from '../../hooks/useWorkflowRun';
import { useComfyExecution } from '../../contexts/ComfyExecutionContext';
import { consumeHandoff } from '../../utils/workflowHandoff';
import { uploadToComfy } from '../../utils/comfyUpload';
import { WorkflowShell, WorkflowSection } from './WorkflowShell';
import { PromptAgentBox } from '../workflows/PromptAgentBox';
import { WorkflowVideoPreviewStrip } from './WorkflowVideoPreviewStrip';
import { LiveSamplingPreview } from '../workflows/LiveSamplingPreview';
import { InfoTip } from '../ui/InfoTip';
import { PromptAssistant } from '../ui/PromptAssistant';
import { GenerateButton, SeedField, SliderField, UploadSlot } from '../ui/WorkflowControls';
import { cn } from '../../lib/styles';
import { LoraSelector } from '../ui/LoraSelector';
import { comfyService } from '../../services/comfyService';

/**
 * The one workflow page layout.
 *
 * Before this existed, 21 pages each hand-arranged WorkflowShell and drifted:
 * three output components, thirty section titles for four concepts, and upload
 * plumbing copy-pasted per page. A page now declares what it needs and this
 * component owns the arrangement.
 *
 * Input and setting values live in two grouped persistent objects rather than a
 * hook per field, so a page's control list can change without shifting hook
 * order, and every page gets workflow memory for free.
 */

export interface WorkflowInputSpec {
  /** Param name sent to the backend. */
  key: string;
  kind: 'image' | 'video' | 'audio';
  /** Section title — prefer the canonical vocabulary in the audit. */
  label: string;
  hint?: string;
  optional?: boolean;
}

export type WorkflowSettingSpec =
  | {
      kind: 'slider';
      key: string;
      label: string;
      min: number;
      max: number;
      step?: number;
      defaultValue: number;
      /** Some graphs type their widget inputs as strings. */
      asString?: boolean;
      advanced?: boolean;
      /** Shown on hover beside the label, the instant you point at it. */
      hint?: string;
    }
  | { kind: 'seed'; key: string; label?: string; defaultValue?: number; advanced?: boolean }
  | {
      /** A second free-text field, e.g. a per-subject descriptor. */
      kind: 'text';
      key: string;
      label: string;
      placeholder?: string;
      defaultValue?: string;
      rows?: number;
      advanced?: boolean;
    }
  | {
      /**
       * Dropdown filled from ComfyUI's node schema, e.g. every checkpoint the
       * install has. `filter` narrows it, since a workflow usually only accepts
       * one family of model.
       */
      kind: 'select';
      key: string;
      label: string;
      node: string;
      field: string;
      filter?: RegExp;
      defaultValue: string;
      advanced?: boolean;
    }
  | {
      kind: 'chips';
      key: string;
      label: string;
      options: { label: string; value: number | string }[];
      defaultValue: number | string;
      advanced?: boolean;
      /** Shown on hover beside the label, the instant you point at it. */
      hint?: string;
    };

export interface WorkflowPromptSpec {
  key?: string;
  label?: string;
  placeholder?: string;
  defaultValue?: string;
  /** PromptAssistant context id. Omitted renders a plain textarea. */
  context?: string;
  rows?: number;
  optional?: boolean;
  negative?: { key?: string; placeholder?: string };
}

export interface WorkflowPageProps {
  workflowId: string;
  /**
   * Stable key for stored prompt/settings. Defaults to workflowId, but pages
   * that swap workflowId at runtime (LTX picks a gguf or fp8 graph) must pin
   * this or toggling wipes everything the user typed.
   */
  storageKey?: string;
  /** Send all LoRA picks as one array under this key instead of named params. */
  loraArrayKey?: string;
  /** Model family, e.g. "LTX 2.3" — rendered as the eyebrow. */
  family: string;
  /** What this page does, e.g. "First / Last Frame". */
  capability: string;
  description?: string;
  icon: LucideIcon;
  output: 'video' | 'image';
  inputs?: WorkflowInputSpec[];
  prompt?: WorkflowPromptSpec;
  settings?: WorkflowSettingSpec[];
  generateLabel?: string;
  generatingLabel?: string;
  readyMessage?: string;
  /**
   * Params that are fixed, or derived from the settings the user did choose -
   * LTX turns an aspect chip plus a resolution chip into width/height, which no
   * single control can express.
   */
  extraParams?: (
    values: Record<string, number | string>,
    ctx: { prompt: string; negative: string },
  ) => Record<string, unknown>;
  /** Buttons above the prompt box, e.g. "write prompt from frames". */
  promptActions?: ReactNode;
  /** Show the prompt builder beside the prompt box. Value is the LoRA path
      prefix it should offer, e.g. "ltx"; omit to leave the builder out. */
  // `kind` decides what the agent writes. Left off it assumes a clip, which
  // is the wrong advice on an image workflow - motion and sound for a still.
  promptBuilder?: { loraPrefix?: string; imageKey?: string; kind?: 'video' | 'image' };
  /** Anything genuinely bespoke, rendered between Settings and Generate. */
  extraSections?: ReactNode;
  /**
   * LoRA pickers. An array because WAN 2.2 splits high- and low-noise passes
   * into two slots, and the 2-LoRA workflows use the same shape.
   * `paramKey` is what the graph expects, e.g. lora_slot2.
   */
  loras?: {
    key: string;
    label: string;
    match: string[];
    /** Graph takes one {on, lora, strength} object under this key. */
    paramKey?: string;
    /** Or the graph takes name and strength as two separate inputs. */
    nameKey?: string;
    strengthKey?: string;
  }[];
}

const settingDefault = (s: WorkflowSettingSpec) =>
  s.kind === 'seed' ? (s.defaultValue ?? -1)
  : s.kind === 'text' ? (s.defaultValue ?? '')
  : s.defaultValue;

export const WorkflowPage = ({
  workflowId,
  storageKey,
  loraArrayKey,
  family,
  capability,
  description,
  icon: Icon,
  output,
  inputs = [],
  prompt,
  settings = [],
  generateLabel = 'Generate',
  generatingLabel = 'Generating…',
  readyMessage = 'Generation ready',
  extraParams,
  promptActions,
  promptBuilder,
  extraSections,
  loras = [],
}: WorkflowPageProps) => {
  const { toast } = useToast();
  const { previewUrl } = useComfyExecution();
  const store = storageKey ?? workflowId;

  const promptKey = prompt?.key ?? 'prompt';
  const negativeKey = prompt?.negative?.key ?? 'negative';

  const defaults = useMemo(
    () => Object.fromEntries(settings.map((s) => [s.key, settingDefault(s)])),
    [settings],
  );

  const [files, setFiles] = usePersistentState<Record<string, string | null>>(
    `wf_${store}_inputs`,
    {},
  );
  const [values, setValues] = usePersistentState<Record<string, number | string>>(
    `wf_${store}_settings`,
    defaults,
  );
  const [promptText, setPromptText] = usePersistentState(
    `wf_${store}_prompt`,
    prompt?.defaultValue ?? '',
  );
  const [negativeText, setNegativeText] = usePersistentState(`wf_${store}_negative`, '');
  // Batch is a mode of the prompt box, matching the image pages: each non-empty
  // line is its own job, and Single leaves a multi-line prompt as one prompt.
  const [promptMode, setPromptMode] = usePersistentState<'single' | 'multiple'>(
    `wf_${store}_prompt_mode`,
    'single',
  );
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [negOpen, setNegOpen] = useState(false);
  // One object rather than a hook per slot, same reason as settings: the slot
  // list is config, and hooks cannot be conditional.
  const [loraPicks, setLoraPicks] = usePersistentState<Record<string, { name: string; strength: number }>>(
    `wf_${store}_loras`,
    {},
  );
  const [availableLoras, setAvailableLoras] = useState<Record<string, string[]>>({});
  const [nodeOptions, setNodeOptions] = useState<Record<string, string[]>>({});

  // Selects read their options straight off ComfyUI's node schema, so the list
  // is whatever this install actually has rather than a hardcoded guess.
  const selectSpecs = settings.filter((x) => x.kind === 'select') as Extract<WorkflowSettingSpec, { kind: 'select' }>[];
  const selectKey = selectSpecs.map((x) => `${x.key}|${x.node}|${x.field}`).join(',');
  useEffect(() => {
    if (!selectKey) return;
    for (const spec of selectSpecs) {
      fetch(`/comfy/object_info/${spec.node}`)
        .then((r) => r.json())
        .then((d) => {
          const opts = d?.[spec.node]?.input?.required?.[spec.field]?.[0];
          if (!Array.isArray(opts)) return;
          const list = spec.filter ? opts.filter((o: string) => spec.filter!.test(o)) : opts;
          setNodeOptions((prev) => ({ ...prev, [spec.key]: list }));
        })
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectKey]);

  // Keyed on a flattened string, not the config array: pages declare `loras`
  // inline, so depending on the array refires this every render - fetch,
  // setState, re-render, fetch - and locks the page blank before it paints.
  const loraKey = loras.map((l) => `${l.key}:${l.match.join('|')}`).join(',');
  useEffect(() => {
    if (!loraKey) return;
    const slots = loraKey.split(',').map((entry) => {
      const [key, matches] = entry.split(':');
      return { key, needles: matches.split('|').map((m) => m.toLowerCase()) };
    });
    comfyService.getLoras()
      .then((all) => {
        const next: Record<string, string[]> = {};
        for (const slot of slots) {
          next[slot.key] = all.filter((entry) => {
            const norm = entry.replace(/\\/g, '/').toLowerCase();
            return slot.needles.some((m) => norm.includes(m));
          });
        }
        setAvailableLoras(next);
      })
      .catch(() => {});
  }, [loraKey]);

  const run = useWorkflowRun({
    workflowId,
    currentKey: `wf_${store}_current`,
    historyKey: `wf_${store}_history`,
    outputKind: output,
    readyMessage,
  });

  const setFile = (key: string, value: string | null) =>
    setFiles((prev) => ({ ...prev, [key]: value }));
  const setBusy = (key: string, busy: boolean) =>
    setUploading((prev) => ({ ...prev, [key]: busy }));

  const upload = async (key: string, file: File) => {
    setBusy(key, true);
    try {
      setFile(key, await uploadToComfy(file));
    } catch (err: any) {
      toast(err.message || 'Upload failed', 'error');
    } finally {
      setBusy(key, false);
    }
  };

  const uploadFromUrl = async (key: string, url: string) => {
    setBusy(key, true);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to fetch (${res.status})`);
      const blob = await res.blob();
      setFile(key, await uploadToComfy(new File([blob], `${key}-input`, { type: blob.type })));
    } catch (err: any) {
      toast(err.message || 'Could not load from URL', 'error');
    } finally {
      setBusy(key, false);
    }
  };

  // "Send to workflow" hands off one file; it fills the first slot of that kind.
  useState(() => {
    for (const kind of ['video', 'audio', 'image'] as const) {
      const slot = inputs.find((i) => i.kind === kind);
      if (!slot) continue;
      const handed = consumeHandoff(kind);
      if (handed) {
        void uploadFromUrl(slot.key, handed);
        return undefined;
      }
    }
    return undefined;
  });

  const missing = useMemo(() => {
    const slot = inputs.find((i) => !i.optional && !files[i.key]);
    if (slot) return `Add ${slot.label.toLowerCase()}`;
    if (prompt && !prompt.optional && !promptText.trim()) return 'Write a prompt';
    return undefined;
  }, [files, inputs, prompt, promptText]);

  const batchPrompts = useMemo(
    () => (promptMode === 'multiple'
      ? promptText.split('\n').map((l) => l.trim()).filter(Boolean)
      : []),
    [promptMode, promptText],
  );

  const canGenerate = !missing && !run.isGenerating;

  /** One param-set. Batch calls this per line rather than duplicating the build. */
  const buildParams = (promptText: string): Record<string, unknown> => {
    const params: Record<string, unknown> = {};
    for (const input of inputs) {
      if (files[input.key]) params[input.key] = files[input.key];
    }
    if (prompt) {
      params[promptKey] = promptText.trim();
      if (prompt.negative) params[negativeKey] = negativeText.trim();
    }
    for (const s of settings) {
      const value = values[s.key] ?? settingDefault(s);
      if (s.kind === 'seed') {
        // Re-rolled per prompt, so a batch is not the same image N times.
        params[s.key] = value === -1 ? Math.floor(Math.random() * 10_000_000_000) : value;
      } else if (s.kind === 'slider' && s.asString) {
        params[s.key] = String(value);
      } else {
        params[s.key] = value;
      }
    }
    if (loraArrayKey) {
      const picked = loras
        .map((slot) => loraPicks[slot.key])
        .filter((pick) => pick?.name)
        .map((pick) => ({ name: pick.name, strength: pick.strength }));
      if (picked.length) params[loraArrayKey] = picked;
    }
    for (const slot of loraArrayKey ? [] : loras) {
      const pick = loraPicks[slot.key];
      if (!pick?.name) continue;
      if (slot.nameKey) {
        params[slot.nameKey] = pick.name;
        if (slot.strengthKey) params[slot.strengthKey] = pick.strength;
      } else {
        params[slot.paramKey ?? slot.key] = { on: true, lora: pick.name, strength: pick.strength };
      }
    }
    return {
      ...params,
      ...(extraParams?.(values, { prompt: promptText.trim(), negative: negativeText.trim() }) ?? {}),
    };
  };

  const handleGenerate = () => {
    if (!canGenerate) return;
    if (promptMode === 'multiple' && batchPrompts.length > 1) {
      void run.startBatch(batchPrompts.map(buildParams));
      return;
    }
    run.start(buildParams(promptText));
  };

  const renderSetting = (s: WorkflowSettingSpec) => {
    const value = values[s.key] ?? settingDefault(s);
    const set = (v: number | string) => setValues((prev) => ({ ...prev, [s.key]: v }));

    if (s.kind === 'slider') {
      // A frame count means nothing on its own - 48 frames is two seconds at
      // 24fps and three at 16. The number the user is actually choosing is the
      // length of the clip, so show it next to the one the graph wants.
      const fps = Number(values.frame_rate ?? values.fps ?? 0);
      const showsSeconds = s.key === 'length' && fps > 0;
      return (
        <SliderField
          key={s.key}
          label={s.label}
          value={Number(value)}
          onChange={set}
          min={s.min}
          max={s.max}
          step={s.step ?? 1}
          hint={s.hint}
          format={showsSeconds
            ? (v) => `${v} frames · ${(v / fps).toFixed(1)}s`
            : undefined}
        />
      );
    }
    if (s.kind === 'seed') {
      return <SeedField key={s.key} value={Number(value)} onChange={set} />;
    }
    if (s.kind === 'select') {
      const opts = nodeOptions[s.key] ?? [];
      return (
        <div key={s.key} className="col-span-full">
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
            {s.label}
          </div>
          <select
            value={String(value ?? '')}
            onChange={(e) => set(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-black/35 px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-white/25"
          >
            {opts.length === 0 && <option value={String(value ?? '')}>{String(value ?? '')}</option>}
            {opts.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      );
    }
    if (s.kind === 'text') {
      return (
        <div key={s.key} className="col-span-full">
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
            {s.label}
          </div>
          <textarea
            value={String(value ?? '')}
            onChange={(e) => set(e.target.value)}
            rows={s.rows ?? 2}
            placeholder={s.placeholder}
            className="w-full rounded-lg border border-white/10 bg-black/35 px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-white/25"
          />
        </div>
      );
    }
    // Width follows the content. Every chip group used to take a whole row, so
    // "S M L" got the same 1200px that eight aspect ratios did, and three short
    // groups stacked into three rows of mostly empty space. Measured in label
    // characters rather than option count: two long words need more room than
    // four short ones.
    const chipWidth = s.options.reduce((n, o) => n + String(o.label).length, 0);
    const span = chipWidth <= 20 ? 'lg:col-span-1' : chipWidth <= 32 ? 'lg:col-span-2' : 'lg:col-span-4';
    return (
      <div key={s.key} className={cn('col-span-full', span)}>
        <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
          {s.label}
          {s.hint && <InfoTip text={s.hint} />}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {s.options.map((o) => (
            <button
              key={String(o.value)}
              type="button"
              onClick={() => set(o.value)}
              className={cn(
                'rounded-md border px-3 py-1.5 text-[11px] font-semibold transition',
                value === o.value
                  ? 'border-white/30 bg-white/10 text-white'
                  : 'border-white/10 text-white/45 hover:text-white/80',
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
    );
  };

  const basic = settings.filter((s) => !s.advanced);
  const advanced = settings.filter((s) => s.advanced);
  const hasOutput = !!run.currentMedia || run.history.length > 0;

  const outputPanel = (

        <LiveSamplingPreview
          previewUrl={previewUrl}
          isRunning={run.isGenerating}
          hasOutput={hasOutput}
          emptyState={(
            <div className="flex min-h-[320px] items-center justify-center rounded-xl border border-dashed border-white/10 bg-black/20 p-3">
              <div className="text-center text-zinc-500">
                {run.isGenerating ? (
                  <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin opacity-60" />
                ) : (
                  <Icon className="mx-auto mb-3 h-8 w-8 opacity-60" />
                )}
                <div className="text-sm font-semibold text-zinc-400">
                  {run.isGenerating ? generatingLabel : 'No output yet'}
                </div>
                <div className="mt-1 text-xs text-zinc-600">
                  {missing ?? 'Ready when you are.'}
                </div>
              </div>
            </div>
          )}
        >
          {output === 'video' ? (
            <WorkflowVideoPreviewStrip
              title={`${capability} Output`}
              currentVideo={run.currentMedia}
              history={run.history}
              isGenerating={run.isGenerating}
              onSelectVideo={run.setCurrentMedia}
              onRemoveVideo={(url) => run.setHistory((prev) => prev.filter((v) => v !== url))}
              emptyHint="Results will appear here."
            />
          ) : (
            // object-contain with a max height: a square render was being
            // stretched wide to fill the output strip.
            <div className="space-y-3">
              {run.currentMedia ? (
                <img
                  src={run.currentMedia}
                  alt="Result"
                  className="mx-auto max-h-[40vh] w-auto max-w-full rounded-xl object-contain"
                />
              ) : null}
              {run.history.length > 1 ? (
                <div className="flex gap-2 overflow-x-auto">
                  {run.history.map((url) => (
                    <button key={url} type="button" onClick={() => run.setCurrentMedia(url)} className="shrink-0">
                      <img
                        src={url}
                        alt=""
                        className={cn(
                          'h-16 w-16 rounded-lg object-cover transition',
                          url === run.currentMedia ? 'ring-2 ring-violet-400' : 'opacity-60 hover:opacity-100',
                        )}
                      />
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </LiveSamplingPreview>
  );

  return (
    <WorkflowShell
      title={capability}
      eyebrow={family}
      description={description}
      icon={Icon}
      isGenerating={run.isGenerating}
      canGenerate={canGenerate}
      workflowId={workflowId}
      hideOutputPane
    >
      <div className="w-full space-y-4 px-6 pb-8">
        {/* Same arrangement as the image pages: inputs and the live output side
            by side at the top, capped, so Generate stays on screen. */}
        {/* Every input and the output are equal columns of one row, rather than
            the inputs sharing half of it - two frames were coming out a quarter
            the width of the panel opposite them. */}
        <div
          className="cockpit-io-row"
          style={{ gridTemplateColumns: `repeat(${inputs.length + 1}, minmax(0, 1fr))` }}
        >
          {/* No section header: the slot prints its own label, and a header on
              the inputs but not the output left the three boxes misaligned. */}
          {inputs.map((input) => (
            <div key={input.key} className="cockpit-panel">
              <UploadSlot
                preview={
                  files[input.key]
                    ? `/comfy/view?filename=${encodeURIComponent(files[input.key]!)}&type=input`
                    : null
                }
                uploading={!!uploading[input.key]}
                onFile={(f) => upload(input.key, f)}
                onUrl={(u) => uploadFromUrl(input.key, u)}
                accept={input.kind === 'video' ? 'video/*' : input.kind === 'audio' ? 'audio/*' : 'image/*'}
                previewKind={input.kind === 'image' ? undefined : input.kind}
                label={input.label}
                hint={input.hint ?? 'Click, drop, or paste a URL'}
                height={230}
                filename={files[input.key] ?? undefined}
                onClear={() => setFile(input.key, null)}
              />
            </div>
          ))}
          <div className="cockpit-panel">{outputPanel}</div>
        </div>

        {prompt && (
          <WorkflowSection title="Prompt">
            {promptActions ? <div className="mb-2">{promptActions}</div> : null}
            {/* Two boxes side by side: writing on the left, the builder that
                fills it on the right. Stacked below lg, where two columns would
                leave both too narrow to use. */}
            <div className={promptBuilder ? 'grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]' : undefined}>
            <div className="min-w-0">
            {prompt.context ? (
              <PromptAssistant
                context={prompt.context}
                value={promptText}
                onChange={setPromptText}
                placeholder={prompt.placeholder}
                minRows={prompt.rows ?? 3}
                accent="violet"
                label={prompt.label}
                mode={promptMode}
                onModeChange={setPromptMode}
              />
            ) : (
              <textarea
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                rows={prompt.rows ?? 3}
                placeholder={prompt.placeholder}
                className="w-full rounded-lg border border-white/10 bg-black/35 px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-white/25"
              />
            )}
            {prompt.negative && (
              <div className="cockpit-negative-panel mt-2">
                <button type="button" onClick={() => setNegOpen((v) => !v)} className="cockpit-collapse">
                  <span>Negative Prompt</span>
                  <ChevronDown className={negOpen ? 'h-3 w-3 rotate-180' : 'h-3 w-3'} />
                </button>
                {negOpen && (
                  <textarea
                    value={negativeText}
                    onChange={(e) => setNegativeText(e.target.value)}
                    placeholder={prompt.negative.placeholder ?? 'What to avoid…'}
                    className="cockpit-negative"
                  />
                )}
              </div>
            )}
            </div>
            {promptBuilder && (
              <PromptAgentBox
                workflowId={workflowId}
                // Frames live in `files`, not `values` - the builder read the
                // wrong map and so never saw an image at all.
                image={promptBuilder.imageKey ? files[promptBuilder.imageKey] ?? null : null}
                // Most video graphs count frames, not seconds: MiniMax exposes
                // `length` and `frame_rate` and no length_seconds at all, so
                // this always fell through to 5. The agent then wrote a
                // five-beat timeline for a clip that runs 1.7s, and the model
                // had to cram or drop most of it.
                kind={promptBuilder.kind ?? 'video'}
                seconds={(() => {
                  const frames = Number(values.length ?? 0);
                  const fps = Number(values.frame_rate ?? values.fps ?? 0);
                  if (frames > 0 && fps > 0) return Math.max(1, Math.round(frames / fps));
                  return Number(values.length_seconds ?? 5);
                })()}
                onPrompt={setPromptText}
              />
            )}
            </div>
          </WorkflowSection>
        )}

        {settings.length > 0 && (
          <WorkflowSection
            title="Settings"
            // Settings persist per workflow, so a value dragged badly once
            // follows you across sessions with no way back to the graph's own
            // numbers. Reset is the way out.
            actions={(
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setValues(defaults)}
                  className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-600 transition hover:text-zinc-400"
                >
                  Reset to default
                </button>
                {advanced.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowAdvanced((v) => !v)}
                    className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-600 transition hover:text-zinc-400"
                  >
                    {showAdvanced ? '− Advanced' : '+ Advanced'}
                  </button>
                )}
              </div>
            )}
          >
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {basic.map(renderSetting)}
            </div>
            {loras.length > 0 && (
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                {loras.map((slot) => (
                  <LoraSelector
                    key={slot.key}
                    label={slot.label}
                    value={loraPicks[slot.key]?.name ?? ''}
                    onChange={(name) => setLoraPicks((prev) => ({
                      ...prev,
                      [slot.key]: { name, strength: prev[slot.key]?.strength ?? 1 },
                    }))}
                    strength={loraPicks[slot.key]?.strength ?? 1}
                    onStrengthChange={(strength) => setLoraPicks((prev) => ({
                      ...prev,
                      [slot.key]: { name: prev[slot.key]?.name ?? '', strength },
                    }))}
                    options={availableLoras[slot.key] ?? []}
                    accent="violet"
                  />
                ))}
              </div>
            )}
            {showAdvanced && advanced.length > 0 && (
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {advanced.map(renderSetting)}
              </div>
            )}
          </WorkflowSection>
        )}

        {extraSections}

        <GenerateButton
          onClick={handleGenerate}
          disabled={!canGenerate}
          isGenerating={run.isGenerating}
          onCancel={run.cancel}
          label={batchPrompts.length > 1 ? `${generateLabel} — ${batchPrompts.length} prompts` : generateLabel}
          generatingLabel={run.batchProgress
            ? `Generating ${run.batchProgress.current} / ${run.batchProgress.total}…`
            : generatingLabel}
          requirementHint={missing}
        />
      </div>
    </WorkflowShell>
  );
};
