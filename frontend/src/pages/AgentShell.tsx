import { useState } from 'react';
import { ChatSidebar, type ChatMode, type ChatSummary } from '../components/chat/ChatSidebar';
import { ChatWorkflowPage } from './ChatWorkflowPage';
import { StudioPane } from './StudioPane';

/**
 * Owns the sidebar and swaps the pane beside it.
 *
 * The sidebar had lived inside the chat page, which meant a second mode could
 * not exist without a second sidebar. Hoisting it here keeps one owner of the
 * chat list and lets modes be added without touching either pane.
 *
 * Chat = the Qwen image editor. Studio = pick any workflow and talk to it.
 * Opening a saved chat routes by its `workflow_id`: absent means the Qwen
 * editor, which is exactly what every chat saved before Studio existed has.
 */
/** Chat mode is this workflow; Studio lets you pick any other. */
const QWEN_EDIT = 'qwen-rapid-edit-v23';

export const AgentShell = () => {
  const [mode, setMode] = useState<ChatMode>('chat');
  const [openId, setOpenId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [studioWorkflow, setStudioWorkflow] = useState<string | null>(null);
  const [sidebarKey, setSidebarKey] = useState(0);

  const openChat = (chat: ChatSummary) => {
    setActiveId(chat.id);
    setOpenId(chat.id);
    if (chat.workflow_id && chat.workflow_id !== QWEN_EDIT) {
      setMode('studio');
      setStudioWorkflow(chat.workflow_id);
    } else {
      setMode('chat');
      setOpenId(chat.id);
    }
  };

  const startNew = () => {
    setActiveId(null);
    setOpenId(null);
    if (mode === 'studio') setStudioWorkflow(null);
  };

  const switchMode = (next: ChatMode) => {
    setMode(next);
    setActiveId(null);
    if (next === 'chat') setOpenId(null);
    else setStudioWorkflow(null);
  };

  return (
    <div className="flex h-full bg-[#050506]">
      <ChatSidebar
        mode={mode}
        onMode={switchMode}
        activeId={activeId}
        onOpen={openChat}
        onNew={startNew}
        refreshKey={sidebarKey}
      />
      {mode === 'chat' ? (
        // Chat mode is the same agent pinned to the image editor.
        <ChatWorkflowPage
          workflowId={QWEN_EDIT}
          openId={openId}
          onSaved={(id) => { setActiveId(id); setSidebarKey((k) => k + 1); }}
        />
      ) : (
        <StudioPane
          workflowId={studioWorkflow}
          onPick={(id) => setStudioWorkflow(id)}
          onClear={() => setStudioWorkflow(null)}
          openId={openId}
          onSaved={(id) => { setActiveId(id); setSidebarKey((k) => k + 1); }}
        />
      )}
    </div>
  );
};
