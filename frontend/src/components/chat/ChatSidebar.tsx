import { useEffect, useState } from 'react';
import { Check, MessageSquare, PanelLeftClose, PanelLeftOpen, Pencil, Plus, Trash2, X } from 'lucide-react';
import { BACKEND_API } from '../../config/api';
import { cn } from '../../lib/styles';

/**
 * Collapsible chat history rail.
 *
 * Collapsed state is remembered, because this is a tool people keep open for a
 * whole session and re-collapsing it on every visit is exactly the kind of
 * small friction that makes a panel feel unfinished.
 */

const COLLAPSED_KEY = 'fedda.chat.sidebar.collapsed';

export type ChatSummary = {
  id: string;
  title: string;
  updated?: string;
  count?: number;
};

interface Props {
  activeId: string | null;
  onOpen: (id: string) => void;
  onNew: () => void;
  /** Bumped by the parent after a save so the list refreshes. */
  refreshKey: number;
}

export const ChatSidebar = ({ activeId, onOpen, onNew, refreshKey }: Props) => {
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(COLLAPSED_KEY) === '1'; } catch { return false; }
  });
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const load = async () => {
    try {
      const res = await fetch(`${BACKEND_API.BASE_URL}/api/chat-edit/sessions`);
      const data = await res.json();
      setChats(Array.isArray(data.sessions) ? data.sessions : []);
    } catch {
      setChats([]);
    }
  };

  useEffect(() => { void load(); }, [refreshKey]);

  const toggle = () => {
    setCollapsed((c) => {
      const next = !c;
      try { localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0'); } catch { /* private mode */ }
      return next;
    });
  };

  const rename = async (id: string) => {
    const title = draft.trim();
    setEditing(null);
    if (!title) return;
    await fetch(`${BACKEND_API.BASE_URL}/api/chat-edit/sessions/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    void load();
  };

  const remove = async (id: string) => {
    await fetch(`${BACKEND_API.BASE_URL}/api/chat-edit/sessions/${encodeURIComponent(id)}`,
      { method: 'DELETE' });
    if (id === activeId) onNew();
    void load();
  };

  if (collapsed) {
    return (
      <div className="flex w-11 shrink-0 flex-col items-center gap-2 border-r border-white/8 py-3">
        <button
          type="button"
          onClick={toggle}
          title="Show chats"
          className="rounded-lg p-2 text-white/35 transition hover:text-white"
        >
          <PanelLeftOpen className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onNew}
          title="New chat"
          className="rounded-lg p-2 text-white/35 transition hover:text-white"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex w-60 shrink-0 flex-col border-r border-white/8">
      <div className="flex items-center gap-1 px-3 py-3">
        <button
          type="button"
          onClick={onNew}
          className="flex flex-1 items-center gap-2 rounded-lg border border-white/10 px-2.5 py-1.5 text-[12px] text-white/60 transition hover:border-white/25 hover:text-white"
        >
          <Plus className="h-3.5 w-3.5" /> New chat
        </button>
        <button
          type="button"
          onClick={toggle}
          title="Hide chats"
          className="rounded-lg p-1.5 text-white/30 transition hover:text-white"
        >
          <PanelLeftClose className="h-4 w-4" />
        </button>
      </div>

      <p className="px-3 pb-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-white/25">
        Chats
      </p>

      <div className="custom-scrollbar flex-1 overflow-y-auto px-2 pb-3">
        {chats.length === 0 && (
          <p className="px-2 py-3 text-[11px] leading-relaxed text-white/25">
            Nothing saved yet. Chats appear here once you send a message.
          </p>
        )}
        {chats.map((c) => (
          <div
            key={c.id}
            className={cn(
              'group mb-0.5 flex items-center gap-1 rounded-lg px-2 py-1.5 transition',
              c.id === activeId ? 'bg-cyan-500/10 text-cyan-100' : 'text-white/50 hover:bg-white/[0.04]',
            )}
          >
            <MessageSquare className="h-3 w-3 shrink-0 opacity-50" />
            {editing === c.id ? (
              <>
                <input
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void rename(c.id);
                    if (e.key === 'Escape') setEditing(null);
                  }}
                  className="min-w-0 flex-1 rounded border border-white/15 bg-black/40 px-1.5 py-0.5 text-[11px] text-white outline-none"
                />
                <button type="button" onClick={() => { void rename(c.id); }} className="p-0.5 text-emerald-400">
                  <Check className="h-3 w-3" />
                </button>
                <button type="button" onClick={() => setEditing(null)} className="p-0.5 text-white/40">
                  <X className="h-3 w-3" />
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => onOpen(c.id)}
                  className="min-w-0 flex-1 truncate text-left text-[11px]"
                  title={c.title}
                >
                  {c.title}
                </button>
                <button
                  type="button"
                  onClick={() => { setEditing(c.id); setDraft(c.title); }}
                  title="Rename"
                  className="p-0.5 text-white/0 transition group-hover:text-white/40 hover:!text-white"
                >
                  <Pencil className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => { void remove(c.id); }}
                  title="Delete"
                  className="p-0.5 text-white/0 transition group-hover:text-white/40 hover:!text-red-400"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
