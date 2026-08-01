import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Loader2, type LucideIcon } from 'lucide-react';
import { useToast } from '../ui/Toast';
import { usePersistentState } from '../../hooks/usePersistentState';
import { useWorkflowRun } from '../../hooks/useWorkflowRun';
import { useComfyExecution } from '../../contexts/ComfyExecutionContext';
import { consumeHandoff } from '../../utils/workflowHandoff';
import { uploadToComfy } from '../../utils/comfyUpload';
import { WorkflowShell, WorkflowSection } from './WorkflowShell';
import { WorkflowVideoPreviewStrip } from './WorkflowVideoPreviewStrip';
import { LiveSamplingPreview } from '../workflows/LiveSamplingPreview';
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
 * component owns the arrangement — see docs/v20/UI-CONSISTENCY-AUDIT.md.
 *
 * Input and setting values live in two grouped persistent objects rather than a
 * hook per field, so a page's control list can change without shifting hook
 * order, and every page gets workflow memory for free.
 */

export interface WorkflowInputSpec {
  /** Param name sent to the backend. */
  key: string;
  kind: 'image' | 'video';
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
      kind: 'chips';
      key: string;
      label: string;
      options: { label: string; value: number | string }[];
      defaultValue: number | string;
      advanced?: boolean;
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
  extraSections,
  loras = [],
}: WorkflowPageProps) => {
  const { toast } = useToast();
  const { previewUrl } = useComfyExecution();

  const promptKey = prompt?.key ?? 'prompt';
  const negativeKey = prompt?.negative?.key ?? 'negative';

  const defaults = useMemo(
    () => Object.fromEntries(settings.map((s) => [s.key, settingDefault(s)])),
    [settings],
  );

  const [files, setFiles] = usePersistentState<Record<string, string | null>>(
    `wf_${workflowId}_inputs`,
    {},
  );
  const [values, setValues] = usePersistentState<Record<string, number | string>>(
    `wf_${workflowId}_settings`,
    defaults,
  );
  const [promptText, setPromptText] = usePersistentState(
    `wf_${workflowId}_prompt`,
    prompt?.defaultValue ?? '',
  );
  const [negativeText, setNegativeText] = usePersistentState(`wf_${workflowId}_negative`, '');
  // Batch is a mode of the prompt box, matching the image pages: each non-empty
  // line is its own job, and Single leaves a multi-line prompt as one prompt.
  const [promptMode, setPromptMode] = usePersistentState<'single' | 'multiple'>(
    `wf_${workflowId}_prompt_mode`,
    'single',
  );
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [showAdvanced, setShowAdvanced] = useState(false);
  // One object rather than a hook per slot, same reason as settings: the slot
  // list is config, and hooks cannot be conditional.
  const [loraPicks, setLoraPicks] = usePersistentState<Record<string, { name: string; strength: number }>>(
    `wf_${workflowId}_loras`,
    {},
  );
  const [availableLoras, setAvailableLoras] = useState<Record<string, string[]>>({});

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
    currentKey: `wf_${workflowId}_current`,
    historyKey: `wf_${workflowId}_history`,
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
    for (const kind of ['video', 'image'] as const) {
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
    for (const slot of loras) {
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
      return (
        <SliderField
          key={s.key}
          label={s.label}
          value={Number(value)}
          onChange={set}
          min={s.min}
          max={s.max}
          step={s.step ?? 1}
        />
      );
    }
    if (s.kind === 'seed') {
      return <SeedField key={s.key} value={Number(value)} onChange={set} />;
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
    return (
      <div key={s.key} className="col-span-full">
        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
          {s.label}
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

  return (
    <WorkflowShell
      title={capability}
      eyebrow={family}
      description={description}
      icon={Icon}
      isGenerating={run.isGenerating}
      canGenerate={canGenerate}
      workflowId={workflowId}
      output={(
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
      )}
    >
      <div className="w-full space-y-4 px-6 pb-8">
        {inputs.length > 0 && (
          <div className={cn('grid gap-5', inputs.length > 1 && 'lg:grid-cols-2')}>
            {inputs.map((input) => (
              <WorkflowSection key={input.key} title={input.label}>
                <UploadSlot
                  preview={
                    files[input.key]
                      ? `/comfy/view?filename=${encodeURIComponent(files[input.key]!)}&type=input`
                      : null
                  }
                  uploading={!!uploading[input.key]}
                  onFile={(f) => upload(input.key, f)}
                  onUrl={(u) => uploadFromUrl(input.key, u)}
                  accept={input.kind === 'video' ? 'video/*' : 'image/*'}
                  previewKind={input.kind === 'video' ? 'video' : undefined}
                  label={input.label}
                  hint={input.hint ?? 'Click, drop, or paste a URL'}
                  height={220}
                  filename={files[input.key] ?? undefined}
                  onClear={() => setFile(input.key, null)}
                />
              </WorkflowSection>
            ))}
          </div>
        )}

        {prompt && (
          <WorkflowSection title="Prompt">
            {promptActions ? <div className="mb-2">{promptActions}</div> : null}
            {prompt.context ? (
              <PromptAssistant
                context={prompt.context}
                value={promptText}
                onChange={setPromptText}
                placeholder={prompt.placeholder}
                minRows={prompt.rows ?? 3}
                accent="violet"
                label={prompt.label}
                enableCaption={false}
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
              <input
                value={negativeText}
                onChange={(e) => setNegativeText(e.target.value)}
                placeholder={prompt.negative.placeholder ?? 'Negative (optional)'}
                className="mt-2 w-full rounded-lg border border-white/10 bg-black/35 px-3 py-2 text-xs text-zinc-300 outline-none transition focus:border-white/25"
              />
            )}
          </WorkflowSection>
        )}

        {settings.length > 0 && (
          <WorkflowSection
            title="Settings"
            actions={advanced.length > 0 ? (
              <button
                type="button"
                onClick={() => setShowAdvanced((v) => !v)}
                className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-600 transition hover:text-zinc-400"
              >
                {showAdvanced ? '− Advanced' : '+ Advanced'}
              </button>
            ) : undefined}
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
