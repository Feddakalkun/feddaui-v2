import { useEffect, useMemo, useState } from 'react';
import {
  Brain, Check, ChevronDown, ChevronRight, FolderPlus, MessageSquare,
  PanelLeftClose, PanelLeftOpen, Pencil, Plus, Search, Trash2, X,
} from 'lucide-react';
import { BACKEND_API } from '../../config/api';
import { cn } from '../../lib/styles';

/**
 * Collapsible chat rail: search, folders, history and the memory log.
 *
 * It used to carry a Chat/Studio switcher too. That went when the workflow
 * picker moved into the chat header - there is one agent and one list of
 * conversations, and a mode switch above them only implied otherwise.
 *
 * Collapsed state is remembered, because this is a panel people keep open for a
 * whole session and re-collapsing it on every visit is exactly the kind of
 * small friction that makes a panel feel unfinished.
 */

const COLLAPSED_KEY = 'fedda.chat.sidebar.collapsed';
const UNFILED = '__unfiled__';

export type ChatSummary = {
  id: string;
  title: string;
  updated?: string;
  count?: number;
  folder?: string | null;
  workflow_id?: string | null;
};

interface Props {
  activeId: string | null;
  onOpen: (chat: ChatSummary) => void;
  onNew: () => void;
  /** Bumped by the parent after a save so the list refreshes. */
  refreshKey: number;
}

export const ChatSidebar = ({ activeId, onOpen, onNew, refreshKey }: Props) => {
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(COLLAPSED_KEY) === '1'; } catch { return false; }
  });
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [filing, setFiling] = useState<string | null>(null);
  const [closedFolders, setClosedFolders] = useState<Set<string>>(new Set());
  const [memory, setMemory] = useState<string[]>([]);
  const [persona, setPersona] = useState<{ name?: string } | null>(null);
  const [memOpen, setMemOpen] = useState(false);

  const load = async (q = query) => {
    try {
      const url = `${BACKEND_API.BASE_URL}/api/chat-edit/sessions${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`;
      const res = await fetch(url);
      const data = await res.json();
      setChats(Array.isArray(data.sessions) ? data.sessions : []);
    } catch {
      setChats([]);
    }
  };

  const loadMemory = async () => {
    try {
      const res = await fetch(`${BACKEND_API.BASE_URL}/api/chat-edit/memory`);
      const data = await res.json();
      setMemory(Array.isArray(data.memory) ? data.memory : []);
      setPersona(data.persona ?? null);
    } catch {
      setMemory([]);
    }
  };

  // Memory refreshes alongside the list because the agent may have written
  // something new during the turn that just saved.
  useEffect(() => { void load(); void loadMemory(); }, [refreshKey]);

  // Search hits the backend so it can match message text, not just titles.
  // Debounced so typing does not fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => { void load(query); }, 200);
    return () => clearTimeout(t);
  }, [query]);

  const folders = useMemo(() => {
    const groups = new Map<string, ChatSummary[]>();
    for (const c of chats) {
      const key = c.folder || UNFILED;
      const list = groups.get(key);
      if (list) list.push(c);
      else groups.set(key, [c]);
    }
    // Real folders first, alphabetically; loose chats last.
    return [...groups.entries()].sort(([a], [b]) => {
      if (a === UNFILED) return 1;
      if (b === UNFILED) return -1;
      return a.localeCompare(b);
    });
  }, [chats]);

  const knownFolders = useMemo(
    () => [...new Set(chats.map((c) => c.folder).filter(Boolean))] as string[],
    [chats],
  );

  const toggle = () => {
    setCollapsed((c) => {
      const next = !c;
      try { localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0'); } catch { /* private mode */ }
      return next;
    });
  };

  const patch = async (id: string, body: Record<string, string>) => {
    await fetch(`${BACKEND_API.BASE_URL}/api/chat-edit/sessions/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    void load();
  };

  const remove = async (id: string) => {
    await fetch(`${BACKEND_API.BASE_URL}/api/chat-edit/sessions/${encodeURIComponent(id)}`,
      { method: 'DELETE' });
    if (id === activeId) onNew();
    void load();
  };

  const forget = async (index?: number) => {
    await fetch(`${BACKEND_API.BASE_URL}/api/chat-edit/memory${index === undefined ? '' : `?index=${index}`}`,
      { method: 'DELETE' });
    void loadMemory();
  };

  const toggleFolder = (name: string) => {
    setClosedFolders((s) => {
      const next = new Set(s);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  };

  if (collapsed) {
    return (
      <div className="flex w-11 shrink-0 flex-col items-center gap-2 bg-[#0b0b10] py-3">
        <button type="button" onClick={toggle} title="Show chats"
          className="rounded-lg p-2 text-white/35 transition hover:text-white">
          <PanelLeftOpen className="h-4 w-4" />
        </button>
        <button type="button" onClick={onNew} title="New chat"
          className="rounded-lg p-2 text-white/35 transition hover:text-white">
          <Plus className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex w-60 shrink-0 flex-col bg-[#0b0b10]">
      <div className="flex items-center gap-1 px-3 pt-3">
        <p className="flex-1 px-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/30">
          Chats
        </p>
        <button type="button" onClick={toggle} title="Hide chats"
          className="rounded-lg p-1.5 text-white/30 transition hover:text-white">
          <PanelLeftClose className="h-4 w-4" />
        </button>
      </div>

      <div className="px-3 pt-2">
        <button
          type="button"
          onClick={onNew}
          className="flex w-full items-center gap-2 rounded-lg bg-white/[0.05] px-2.5 py-2 text-[12px] text-white/70 transition hover:bg-white/[0.09] hover:text-white"
        >
          <Plus className="h-3.5 w-3.5" /> New chat
        </button>
      </div>

      <div className="relative px-3 pt-2">
        <Search className="pointer-events-none absolute left-5 top-1/2 h-3 w-3 -translate-y-1/2 text-white/25" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search chats…"
          className="w-full rounded-lg bg-white/[0.05] py-2 pl-7 pr-2 text-[11px] text-zinc-100 outline-none placeholder:text-white/30 focus:bg-white/[0.08]"
        />
      </div>

      <div className="custom-scrollbar mt-2 flex-1 overflow-y-auto px-2 pb-3">
        {chats.length === 0 && (
          <p className="px-2 py-3 text-[11px] leading-relaxed text-white/25">
            {query.trim() ? 'No chats match that.' : 'Nothing saved yet. Chats appear here once you send a message.'}
          </p>
        )}

        {folders.map(([folder, items]) => (
          <div key={folder} className="mb-1">
            {folder !== UNFILED && (
              <button
                type="button"
                onClick={() => toggleFolder(folder)}
                className="flex w-full items-center gap-1 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-white/25 transition hover:text-white/55"
              >
                {closedFolders.has(folder) ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                {folder}
                <span className="ml-auto tabular-nums">{items.length}</span>
              </button>
            )}

            {!closedFolders.has(folder) && items.map((c) => (
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
                        if (e.key === 'Enter') { void patch(c.id, { title: draft.trim() }); setEditing(null); }
                        if (e.key === 'Escape') setEditing(null);
                      }}
                      className="min-w-0 flex-1 rounded bg-black/50 px-1.5 py-0.5 text-[11px] text-white outline-none"
                    />
                    <button type="button" onClick={() => { void patch(c.id, { title: draft.trim() }); setEditing(null); }} className="p-0.5 text-emerald-400">
                      <Check className="h-3 w-3" />
                    </button>
                    <button type="button" onClick={() => setEditing(null)} className="p-0.5 text-white/40">
                      <X className="h-3 w-3" />
                    </button>
                  </>
                ) : filing === c.id ? (
                  <>
                    <input
                      autoFocus
                      list="fedda-folders"
                      value={draft}
                      placeholder="Folder name"
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { void patch(c.id, { folder: draft.trim() }); setFiling(null); }
                        if (e.key === 'Escape') setFiling(null);
                      }}
                      className="min-w-0 flex-1 rounded bg-black/50 px-1.5 py-0.5 text-[11px] text-white outline-none"
                    />
                    <button type="button" onClick={() => { void patch(c.id, { folder: draft.trim() }); setFiling(null); }} className="p-0.5 text-emerald-400">
                      <Check className="h-3 w-3" />
                    </button>
                    <button type="button" onClick={() => setFiling(null)} className="p-0.5 text-white/40">
                      <X className="h-3 w-3" />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => onOpen(c)}
                      className="min-w-0 flex-1 truncate text-left text-[11px]"
                      title={c.title}
                    >
                      {c.title}
                    </button>
                    <button type="button" onClick={() => { setFiling(c.id); setDraft(c.folder || ''); }}
                      title="Move to folder"
                      className="p-0.5 text-white/0 transition group-hover:text-white/40 hover:!text-white">
                      <FolderPlus className="h-3 w-3" />
                    </button>
                    <button type="button" onClick={() => { setEditing(c.id); setDraft(c.title); }}
                      title="Rename"
                      className="p-0.5 text-white/0 transition group-hover:text-white/40 hover:!text-white">
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button type="button" onClick={() => { void remove(c.id); }}
                      title="Delete"
                      className="p-0.5 text-white/0 transition group-hover:text-white/40 hover:!text-red-400">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        ))}

        <datalist id="fedda-folders">
          {knownFolders.map((f) => <option key={f} value={f} />)}
        </datalist>
      </div>

      <div className="mt-1 bg-black/25">
        <button
          type="button"
          onClick={() => setMemOpen((o) => !o)}
          className="flex w-full items-center gap-1.5 px-3 py-2 text-[9px] font-semibold uppercase tracking-[0.16em] text-white/25 transition hover:text-white/60"
        >
          {memOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          <Brain className="h-3 w-3" />
          Memory
          <span className="ml-auto tabular-nums">{memory.length}</span>
        </button>

        {memOpen && (
          <div className="custom-scrollbar max-h-52 overflow-y-auto px-2 pb-3">
            {persona?.name && (
              <p className="px-2 pb-1.5 text-[10px] text-white/30">
                Agent: <span className="text-white/55">{persona.name}</span>
              </p>
            )}
            {memory.length === 0 ? (
              <p className="px-2 py-1 text-[10px] leading-relaxed text-white/25">
                Nothing yet. It writes down lasting preferences on its own.
              </p>
            ) : (
              <>
                {memory.map((m, i) => (
                  <div key={i} className="group mb-0.5 flex items-start gap-1 rounded-lg px-2 py-1 text-white/45 hover:bg-white/[0.04]">
                    <span className="min-w-0 flex-1 text-[10px] leading-relaxed">{m}</span>
                    <button type="button" onClick={() => { void forget(i); }} title="Forget this"
                      className="mt-0.5 p-0.5 text-white/0 transition group-hover:text-white/40 hover:!text-red-400">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => { void forget(); }}
                  className="mt-1 w-full rounded-lg bg-white/[0.04] px-2 py-1.5 text-[10px] text-white/35 transition hover:bg-red-500/15 hover:text-red-300"
                >
                  Forget everything
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
