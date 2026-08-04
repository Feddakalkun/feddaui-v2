import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

/**
 * Which workflow the chat agent is driving.
 *
 * The state would naturally live in `AgentShell`, but the picker bar sits above
 * the generations strip - outside the agent's own subtree - so the two need a
 * meeting point. This is that, and nothing more: no fetching, no persistence.
 *
 * Switching starts a fresh chat, which is why `pick` is separate from a plain
 * setter: the shell registers what clearing means for it, and the bar does not
 * have to know.
 */

/** What a new chat starts on, and what saved chats with no workflow resolve to. */
export const DEFAULT_WORKFLOW = 'qwen-rapid-edit-v23';

type Value = {
  workflowId: string;
  /** Set by the shell while the agent is on screen, so the bar can hide. */
  active: boolean;
  setActive: (on: boolean) => void;
  setWorkflowId: (id: string) => void;
  /** Registered by the shell; called instead of setWorkflowId by the picker. */
  setPicker: (fn: (id: string) => void) => void;
  pick: (id: string) => void;
};

const AgentWorkflowContext = createContext<Value | null>(null);

export function AgentWorkflowProvider({ children }: { children: ReactNode }) {
  const [workflowId, setWorkflowId] = useState(DEFAULT_WORKFLOW);
  const [active, setActive] = useState(false);
  const [picker, setPickerState] = useState<{ fn: (id: string) => void }>({
    // Until the shell registers, picking is just a state change - which is the
    // right behaviour if the bar somehow renders first.
    fn: () => {},
  });

  const value = useMemo<Value>(() => ({
    workflowId,
    active,
    setActive,
    setWorkflowId,
    // Wrapped in an object: React treats a bare function passed to a setter as
    // an updater and would call it with the previous state.
    setPicker: (fn) => setPickerState({ fn }),
    pick: (id) => picker.fn(id),
  }), [workflowId, active, picker]);

  return (
    <AgentWorkflowContext.Provider value={value}>{children}</AgentWorkflowContext.Provider>
  );
}

export function useAgentWorkflow() {
  const ctx = useContext(AgentWorkflowContext);
  if (!ctx) throw new Error('useAgentWorkflow must be used inside AgentWorkflowProvider');
  return ctx;
}
