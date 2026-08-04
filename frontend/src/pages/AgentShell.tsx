import { useState } from 'react';
import { ChatSidebar, type ChatSummary } from '../components/chat/ChatSidebar';
import { ChatWorkflowPage } from './ChatWorkflowPage';

/**
 * Owns the sidebar and the one agent beside it.
 *
 * There used to be two modes here - Chat (pinned to Qwen edit) and Studio (pick
 * a workflow, then talk to it). That split had no basis: the same agent drives
 * every workflow, so the workflow is a setting on the conversation, not a mode
 * around it. Switching now happens inside the chat, through the card picker in
 * its header, and Studio is gone.
 *
 * Reopening a saved chat restores its `workflow_id`. Absent means Qwen edit,
 * which is exactly what every chat saved before workflows were recorded has.
 */
/** What a new chat starts on, and what pre-Studio saved chats resolve to. */
const DEFAULT_WORKFLOW = 'qwen-rapid-edit-v23';

export const AgentShell = () => {
  const [openId, setOpenId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [workflowId, setWorkflowId] = useState(DEFAULT_WORKFLOW);
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
        onPickWorkflow={pickWorkflow}
        onSaved={(id) => { setActiveId(id); setSidebarKey((k) => k + 1); }}
      />
    </div>
  );
};
