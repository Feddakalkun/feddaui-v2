import { useEffect, useState } from 'react';
import { ChatSidebar, type ChatSummary } from '../components/chat/ChatSidebar';
import { DEFAULT_WORKFLOW, useAgentWorkflow } from '../contexts/AgentWorkflowContext';
import { ChatWorkflowPage } from './ChatWorkflowPage';

/**
 * Owns the sidebar and the one agent beside it.
 *
 * There used to be two modes here - Chat (pinned to Qwen edit) and Studio (pick
 * a workflow, then talk to it). That split had no basis: the same agent drives
 * every workflow, so the workflow is a setting on the conversation, not a mode
 * around it. The picker now lives in the bar above the page, and Studio is
 * gone; the workflow itself is held in context because that bar sits outside
 * this subtree.
 *
 * Reopening a saved chat restores its `workflow_id`. Absent means Qwen edit,
 * which is exactly what every chat saved before workflows were recorded has.
 */
export const AgentShell = () => {
  const { workflowId, setWorkflowId, setPicker, setActive } = useAgentWorkflow();
  const [openId, setOpenId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sidebarKey, setSidebarKey] = useState(0);
  const [chatKey, setChatKey] = useState(0);

  const openChat = (chat: ChatSummary) => {
    setActiveId(chat.id);
    setOpenId(chat.id);
    setWorkflowId(chat.workflow_id || DEFAULT_WORKFLOW);
  };

  /**
   * Remount for a new chat rather than clearing field by field.
   *
   * "New chat" from an unsaved conversation leaves `openId` at null, so nothing
   * downstream sees a change and the old transcript survives. Bumping the key
   * is the honest expression of what is being asked for: a fresh one.
   */
  const startNew = () => {
    setActiveId(null);
    setOpenId(null);
    setChatKey((k) => k + 1);
  };

  // Switching workflow starts a fresh chat: the schema, the filled values and
  // the transcript all belong to the workflow that produced them.
  const pickWorkflow = (next: string) => {
    if (next === workflowId) return;
    setWorkflowId(next);
    startNew();
  };

  // The bar is only meaningful while the agent is on screen.
  useEffect(() => {
    setActive(true);
    return () => setActive(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-registered whenever the workflow changes, so the bar's handler is never
  // holding a stale one and comparing against the wrong current value.
  useEffect(() => {
    setPicker(pickWorkflow);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflowId]);

  return (
    <div className="flex h-full bg-[#050506]">
      <ChatSidebar
        activeId={activeId}
        onOpen={openChat}
        onNew={startNew}
        refreshKey={sidebarKey}
      />
      <ChatWorkflowPage
        key={chatKey}
        workflowId={workflowId}
        openId={openId}
        onSaved={(id) => { setActiveId(id); setSidebarKey((k) => k + 1); }}
      />
    </div>
  );
};
