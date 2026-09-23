/**
 * Workflow handoff — pass an image or video from one page to a receiving workflow.
 *
 * Flow:
 *   Sender:   setHandoff(url, 'image')  → window.location.hash = '#/tab/<dest>'
 *   Receiver: useEffect(() => { const url = consumeHandoff('image'); ... }, [])
 *
 * The TTL (5 s) prevents a stale handoff from re-populating on a later visit.
 */

const HANDOFF_KEY = 'fedda_workflow_handoff';
const HANDOFF_TTL = 5_000;
const HANDOFF_PROMPT_KEY = 'fedda_workflow_handoff_prompt';

interface HandoffPayload {
  url: string;
  kind: 'image' | 'video' | 'audio';
  ts: number;
}

export function setHandoff(url: string, kind: 'image' | 'video' | 'audio', prompt?: string): void {
  try {
    const payload: HandoffPayload = { url, kind, ts: Date.now() };
    localStorage.setItem(HANDOFF_KEY, JSON.stringify(payload));
    if (prompt && prompt.trim()) {
      localStorage.setItem(HANDOFF_PROMPT_KEY, JSON.stringify({ prompt: prompt.trim(), ts: Date.now() }));
    } else {
      localStorage.removeItem(HANDOFF_PROMPT_KEY);
    }
  } catch { /* ignore */ }
}

/** Consume and return the URL if a fresh handoff of the given kind exists. */
export function consumeHandoff(kind: 'image' | 'video' | 'audio'): string | null {
  try {
    const raw = localStorage.getItem(HANDOFF_KEY);
    if (!raw) return null;
    const payload: HandoffPayload = JSON.parse(raw);
    if (payload.kind !== kind) return null;
    if (Date.now() - payload.ts > HANDOFF_TTL) {
      localStorage.removeItem(HANDOFF_KEY);
      return null;
    }
    localStorage.removeItem(HANDOFF_KEY);
    return payload.url;
  } catch {
    return null;
  }
}

/** Consume the prompt that rode along with a send-to, if fresh. */
export function takeHandoffPrompt(): string | null {
  try {
    const raw = localStorage.getItem(HANDOFF_PROMPT_KEY);
    if (!raw) return null;
    localStorage.removeItem(HANDOFF_PROMPT_KEY);
    const p = JSON.parse(raw) as { prompt?: string; ts?: number };
    if (!p || typeof p.prompt !== 'string' || !p.prompt.trim()) return null;
    if (Date.now() - (p.ts ?? 0) > HANDOFF_TTL) return null;
    return p.prompt;
  } catch {
    return null;
  }
}

/** Navigate to a workflow tab (uses hash routing already in use by the app). */
export function navigateToTab(tabId: string): void {
  window.location.hash = `#/tab/${encodeURIComponent(tabId)}`;
}
