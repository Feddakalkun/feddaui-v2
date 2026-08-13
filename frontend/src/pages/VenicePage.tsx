import { useState, useRef, useEffect, useMemo } from 'react';
import { FeddaButton, FeddaPanel } from '../components/ui/FeddaPrimitives';
import { useToast } from '../components/ui/Toast';
import { Lightbox } from '../components/ui/Lightbox';
import { triggerMediaDownload } from '../utils/mediaStore';
import { BACKEND_API } from '../config/api';
import { PipelineCancelled, pollGeneration, stageAsInput, submitGenerate, viewUrl } from './tools/reelPipeline';
import { usePersistentState } from '../hooks/usePersistentState';
import { characterMatchesFamily, fetchCharacters, loadSheet, type Character, type Sheet } from '../lib/characters';
import { matchesFamily, loraFileName, normalizeLoraPath } from '../lib/loraLabel';
import { Sparkles, Download, ImageIcon, Loader2, AlertCircle, Hash, Sliders, Send, Trash2, Globe, Settings } from 'lucide-react';

/**
 * Every Venice call goes through the backend now.
 *
 * The key used to sit in localStorage and this page called api.venice.ai
 * directly, which meant the key was readable by anything on the page and the
 * backend could not use Venice at all. It also meant a rejected key, an empty
 * balance and a rate limit all arrived as the same opaque fetch failure.
 *
 * The proxy answers 200 with { success: false, error, detail } for an upstream
 * failure, so those can finally be told apart and said out loud.
 */
const veniceCall = async (endpoint: string, body?: unknown) => {
  const res = await fetch(`${BACKEND_API.BASE_URL}${endpoint}`, body === undefined
    ? { cache: 'no-store' }
    : {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.detail || `Backend error ${res.status}`);
  if (data?.success === false) throw new Error(data.detail || data.error || 'Venice call failed');
  return data;
};

/**
 * Turn a Venice image response into displayable urls.
 *
 * The backend now writes every generated image into ComfyUI's output/venice/
 * and returns `saved[]`. Those urls are what belong in the gallery: a base64
 * data url put the whole picture into localStorage, where sixty of them blew
 * the quota - silently, since the write is inside a catch - and "Reset UI"
 * deleted them outright while promising it did not touch outputs.
 *
 * The base64 path stays as the fallback for the case where saving failed, so a
 * picture is shown rather than lost.
 */
const veniceImageUrls = (data: any): string[] => {
  const saved = (data?.saved || []).map((s: any) => s?.url).filter(Boolean);
  if (saved.length) return saved;
  const raw = data?.images || data?.data || [];
  return raw.map((i: any) => {
    if (typeof i === 'string') return i.startsWith('http') ? i : 'data:image/png;base64,' + i;
    if (i && i.b64_json) return 'data:image/png;base64,' + i.b64_json;
    if (i && i.url) return i.url;
    return null;
  }).filter(Boolean);
};

const saveToGlobalGallery = (urls: string[], source = 'venice') => {
  if (typeof window === 'undefined' || !urls.length) return;
  try {
    const key = `gallery_${source}`;
    const existing: string[] = JSON.parse(localStorage.getItem(key) || '[]');
    const updated = [...urls, ...existing.filter((u: string) => !urls.includes(u))].slice(0, 60);
    localStorage.setItem(key, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent('fedda:gallery-updated'));
  } catch (e) {
    console.warn('Failed to save to gallery', e);
  }
};

/**
 * Models that run here instead of on Venice. The id is a FEDDA workflow id,
 * so adding one is a line in a list rather than anything in the branch that
 * runs them.
 *
 * `negative` says whether the graph declares that input. It matters: a value
 * sent to an input a workflow does not have is dropped in silence - the second
 * of the three ways wiring fails in CLAUDE.md - so krea2 saying false here is
 * what stops a negative prompt being written and quietly ignored.
 */
/**
 * Written into the bubble while a tool call is in flight. Named because four
 * places have to recognise it and not mistake it for something the agent said.
 */
const GENERATING = 'Generating image...';

/** What the agent actually wrote, or nothing if it is still the placeholder. */
const agentText = (content: string) => (content && content !== GENERATING ? content : '');

/**
 * Sizes the edit graph is happy with - the same four the Rapid Edit page
 * offers. The graph's ImageScale is pinned to 768x768 with crop disabled, so
 * whatever goes in comes out at the ratio picked here.
 */
const EDIT_SIZES = [
  { w: 768, h: 768 },
  { w: 768, h: 1024 },
  { w: 1024, h: 768 },
  { w: 832, h: 1216 },
];

/**
 * The closest of those to the source picture's own shape. The page asks the
 * user; chat has no one to ask, and defaulting to square quietly squashed
 * every portrait that came through it.
 */
async function editSizeFor(src: string): Promise<{ width: number; height: number }> {
  const ratio = await new Promise<number>((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img.naturalWidth / Math.max(img.naturalHeight, 1));
    img.onerror = () => resolve(1);
    img.src = src;
  });
  const best = EDIT_SIZES.reduce((a, b) =>
    Math.abs(a.w / a.h - ratio) <= Math.abs(b.w / b.h - ratio) ? a : b);
  return { width: best.w, height: best.h };
}

interface LocalModel {
  id: string;
  label: string;
  negative: boolean;
  /** Which LoRA family this workflow can load, for filtering characters. */
  family: string[];
}

const LOCAL_IMAGE_MODELS: LocalModel[] = [
  { id: 'z-image', label: 'Z-Image Turbo', negative: true, family: ['zimage', 'z-image'] },
  { id: 'krea2-turbo-txt2img', label: 'Krea2 Turbo', negative: false, family: ['krea2', 'krea'] },
  { id: 'qwen-txt2img', label: 'Qwen Text to Image', negative: true, family: ['qwen'] },
];

const LOCAL_EDIT_MODELS: LocalModel[] = [
  { id: 'qwen-rapid-edit-v23', label: 'Qwen Rapid Edit v23', negative: true, family: ['qwen'] },
];

// Image Models
const VENICE_IMAGE_MODELS = [
  { id: 'venice-sd35', label: 'Venice SD35 (fast & cheap)' },
  { id: 'chroma', label: 'Chroma' },
  { id: 'flux-2-pro', label: 'Flux 2 Pro' },
  { id: 'flux-2-max', label: 'Flux 2 Max' },
  { id: 'lustify-sdxl', label: 'Lustify SDXL' },
  { id: 'lustify-v8', label: 'Lustify v8' },
  { id: 'wai-Illustrious', label: 'Anime (WAI)' },
  { id: 'grok-imagine-image', label: 'Grok Imagine' },
  { id: 'grok-imagine-image-quality', label: 'Grok Imagine (High Quality)' },
  { id: 'qwen-image', label: 'Qwen Image' },
];

// Chat Models
const VENICE_CHAT_MODELS = [
  { id: 'kimi-k2-5', label: 'Kimi K2.5' },
  { id: 'zai-org-glm-5-1', label: 'GLM 5.1 (Strong Reasoning & Tools)' },
  { id: 'kimi-k2-6', label: 'Kimi K2.6' },
  { id: 'qwen3-6-27b', label: 'Qwen 3 27B' },
  { id: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro' },
  { id: 'claude-opus-4-6', label: 'Claude Opus 4.6 (Anonymized)' },
];

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  images?: string[];
}

export function VenicePage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'image' | 'chat'>('image');
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  // ========== IMAGE GENERATION STATE & LOGIC ==========
  const [imgModel, setImgModel] = useState('chroma');
  // Venice publishes the real per-model RPM/TPM. The page used to warn about
  // 429s in prose and name two models as safer, which was a guess written once
  // and never checked against the account it runs on.
  const [modelLimits, setModelLimits] = useState<Record<string, { type: string; amount: number }[]>>({});
  const [veniceTier, setVeniceTier] = useState('');
  const [imgPrompt, setImgPrompt] = useState('a beautiful landscape, highly detailed, cinematic');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [width, setWidth] = useState(1024);
  const [height, setHeight] = useState(1024);
  const [steps, setSteps] = useState(20);
  const [cfgScale, setCfgScale] = useState(7.5);
  const [seed, setSeed] = useState<number | undefined>(undefined);
  const [isImgGenerating, setIsImgGenerating] = useState(false);
  const [images, setImages] = useState<string[]>([]);
  const [imgError, setImgError] = useState('');
  const [liveModels, setLiveModels] = useState<{ id: string; label: string }[] | null>(null);

  /**
   * Ask Venice what it actually offers.
   *
   * The list below is hardcoded, so it goes stale every time Venice adds or
   * retires a model - and a stale entry fails at generate time with a 400 that
   * looks like a bug in the app. Asking costs one request and no credits.
   * The hardcoded list stays as the fallback for a missing key or a bad day.
   */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // No key check here any more - the backend owns the key and answers
        // success:false when there is none, which the catch below swallows.
        const data = await veniceCall(`${BACKEND_API.ENDPOINTS.VENICE_MODELS}?type=image`);
        const rows = Array.isArray(data?.data) ? data.data : [];
        const models = rows
          .map((m: { id?: string; model_spec?: { name?: string } }) => ({
            id: String(m.id || ''),
            label: m.model_spec?.name || String(m.id || ''),
          }))
          .filter((m: { id: string }) => m.id);
        if (!cancelled && models.length) setLiveModels(models);
      } catch { /* offline or blocked - the fallback list still works */ }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await veniceCall(BACKEND_API.ENDPOINTS.VENICE_RATE_LIMITS);
        const rows = data?.data?.rateLimits;
        if (!Array.isArray(rows) || cancelled) return;
        const map: Record<string, { type: string; amount: number }[]> = {};
        for (const row of rows) {
          if (row?.apiModelId && Array.isArray(row.rateLimits)) map[row.apiModelId] = row.rateLimits;
        }
        setModelLimits(map);
        setVeniceTier(String(data?.data?.apiTier?.id || ''));
      } catch { /* no key, or Venice is down - the fallback hint still shows */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const imageModels = liveModels ?? VENICE_IMAGE_MODELS;

  // Empty means "use Venice". Held here rather than derived from the Venice
  // selects, so switching back and forth does not lose which local model was
  // last chosen.
  const [localImgModel, setLocalImgModel] = usePersistentState('venice_local_img_model', '');
  const [localEditModel, setLocalEditModel] = usePersistentState('venice_local_edit_model', '');

  // FEDDA's own people. Only meaningful alongside a local model - Venice has
  // no way to load a LoRA, so a character is a local-only idea.
  const [feddaChars, setFeddaChars] = useState<Character[]>([]);
  const [localCharacter, setLocalCharacter] = usePersistentState('venice_local_character', '');
  const [charSheet, setCharSheet] = useState<Sheet | null>(null);
  const [localCharLora, setLocalCharLora] = usePersistentState('venice_local_char_lora', '');
  const [localExtraLora, setLocalExtraLora] = usePersistentState('venice_local_extra_lora', '');

  // The whole library, for the LoRAs that are not filed under a character -
  // styles, fixers, Lightning speedups. fetchCharacters cannot see them.
  const [allLoras, setAllLoras] = useState<string[]>([]);
  useEffect(() => {
    fetch(`${BACKEND_API.BASE_URL}${BACKEND_API.ENDPOINTS.LORA_LIST}`)
      .then((r) => r.json())
      .then((d) => setAllLoras(d?.loras ?? []))
      .catch(() => setAllLoras([]));
  }, []);

  const extraLoraOptions = useMemo(() => {
    const model = LOCAL_IMAGE_MODELS.find((x) => x.id === localImgModel);
    if (!model) return [];
    return allLoras.filter((path) =>
      matchesFamily(path, model.family)
      && !normalizeLoraPath(path).startsWith('characters/'));
  }, [allLoras, localImgModel]);

  // The character's LoRAs this workflow can actually load. Several is normal -
  // they are checkpoints from one training run - and which one is loaded
  // changes the likeness, so it is a choice rather than an implementation
  // detail to settle by sort order.
  const charLoraOptions = useMemo(() => {
    const model = LOCAL_IMAGE_MODELS.find((x) => x.id === localImgModel);
    const person = feddaChars.find((x) => x.name === localCharacter);
    if (!model || !person) return [];
    return person.loras.filter((l) => matchesFamily(l.path, model.family));
  }, [feddaChars, localCharacter, localImgModel]);

  // The remembered one if it is still on offer, otherwise the first. A saved
  // choice must not follow a character to someone who does not have that file.
  const activeCharLora = charLoraOptions.find((l) => l.path === localCharLora)
    || charLoraOptions[0];

  useEffect(() => {
    fetchCharacters().then(setFeddaChars).catch(() => setFeddaChars([]));
  }, []);

  // The sheet carries the trigger word and the appearance, which is most of
  // what makes the picture be of them. Cleared when no one is picked so a
  // stale description cannot ride along on the next prompt.
  useEffect(() => {
    const c = feddaChars.find((x) => x.name === localCharacter);
    if (!c) { setCharSheet(null); return; }
    let cancelled = false;
    loadSheet(c).then((sh) => { if (!cancelled) setCharSheet(sh); })
                .catch(() => { if (!cancelled) setCharSheet(null); });
    return () => { cancelled = true; };
  }, [localCharacter, feddaChars]);

  const generateImage = async () => {
    if (!imgPrompt.trim()) { toast('Prompt is required', 'error'); return; }
    setIsImgGenerating(true); setImgError(''); setImages([]);
    const body: any = { model: imgModel, prompt: imgPrompt.trim(), width, height, steps, cfg_scale: cfgScale, format: 'png', safe_mode: false, hide_watermark: true };
    if (negativePrompt.trim()) body.negative_prompt = negativePrompt.trim();
    if (seed !== undefined) body.seed = seed;
    try {
      const data = await veniceCall(BACKEND_API.ENDPOINTS.VENICE_IMAGE, body);
      const newImgs: string[] = veniceImageUrls(data);
      setImages(newImgs);
      saveToGlobalGallery(newImgs, 'venice-image');
      toast('Generated with Venice.ai!', 'success');
    } catch (e: any) {
      const raw = e.message || 'Failed to generate.';
      const friendly = raw.includes('429') || raw.toLowerCase().includes('overloaded')
        ? 'The model is currently overloaded on Venice.ai. Try a different model (e.g. venice-sd35, chroma, or grok-imagine) or wait 30-60 seconds and retry.'
        : raw;
      setImgError(friendly);
      toast(friendly, 'error');
    } finally { setIsImgGenerating(false); }
  };

  // ========== AGENT CHAT STATE & LOGIC ==========
  // The conversation was plain useState: switching to the Image tab and back
  // lost it, and so did a reload. It is saved to the same store the chat-edit
  // sessions use, tagged with its own workflow_id so the two lists stay apart.
  // One rolling session, restored on mount - the complaint was losing the
  // thread, not the absence of a session manager.
  // Which model performs an edit. The agent may name one in its tool call, but
  // a choice made here wins - "the agent decided" is not an answer to "which
  // model edited my picture".
  // Venice keeps a character's own definition server-side, so picking one is
  // not the same as pasting a persona into the system prompt: the model answers
  // as that character without the app having to carry its text.
  const [characters, setCharacters] = useState<Array<{ slug: string; name: string; description: string; adult: boolean }>>([]);
  const [characterSlug, setCharacterSlug] = useState('');
  const [editModels, setEditModels] = useState<string[]>([]);
  const [editModel, setEditModel] = useState('');
  const [chatSessionId, setChatSessionId] = useState<string | null>(null);
  // Chats were being saved already, but with nothing to open them from - one
  // rolling session that silently replaced itself. The store keeps as many as
  // you like; it only ever lacked a list.
  const [sessions, setSessions] = useState<Array<{ id: string; title: string; updated: string; count: number }>>([]);
  const chatLoaded = useRef(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { role: 'assistant', content: "Hello! I'm your Venice Agent. I can chat, search the web, understand images, and help with creative tasks. Switch to Image tab to generate directly, or ask me here!" }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [chatModel, setChatModel] = useState('kimi-k2-5');
  const [enableWebSearch, setEnableWebSearch] = useState(true);
  const [chatTemperature, setChatTemperature] = useState(0.7);
  const [isChatGenerating, setIsChatGenerating] = useState(false);
  const [attachedImages, setAttachedImages] = useState<string[]>([]);

  const chatMessagesEndRef = useRef<HTMLDivElement>(null);
  const chatFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    chatMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);


  /**
   * Every route an image can take into the chat ends here: the button, a drop,
   * or a paste.
   *
   * Dropping a file from the desktop onto the old chat put its `file:///C:/...`
   * path into the textarea as text, and the agent then explained at length that
   * it cannot read local paths - which is true and useless. The bytes were right
   * there in the drop event; nothing was reading them.
   */
  const addImageFiles = (files: FileList | File[] | null | undefined) => {
    const list = Array.from(files || []).filter(f => f.type.startsWith('image/'));
    if (!list.length) {
      if (files && Array.from(files).length) toast('Only image files can be attached', 'error');
      return;
    }
    for (const file of list) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
        if (base64) setAttachedImages(prev => [...prev, base64]);
      };
      reader.readAsDataURL(file);
    }
    toast(list.length === 1 ? 'Image attached' : `${list.length} images attached`, 'success');
  };

  const handleImageAttach = (e: React.ChangeEvent<HTMLInputElement>) => {
    addImageFiles(e.target.files);
    e.target.value = '';
  };

  const [isChatDragOver, setIsChatDragOver] = useState(false);

  const handleChatDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsChatDragOver(false);
    const dropped = e.dataTransfer?.files;
    if (dropped && dropped.length) { addImageFiles(dropped); return; }
    // Dragging an image out of another browser tab gives a URL, not a file.
    const url = e.dataTransfer?.getData('text/uri-list') || e.dataTransfer?.getData('text/plain') || '';
    if (/^https?:\/\//i.test(url)) {
      setAttachedImages(prev => [...prev, url]);
      toast('Image attached', 'success');
    } else if (url.startsWith('file://')) {
      // The browser will not hand a page the bytes behind a file:// URL, and the
      // model cannot fetch one either. Say so here rather than letting the agent
      // discover it three paragraphs into an answer.
      toast('Drop the file itself rather than its path - a file:// link cannot be read', 'error');
    }
  };

  // Screenshots arrive on the clipboard, not as files, and that is how most
  // people hand an image to a chat.
  const handleChatPaste = (e: React.ClipboardEvent) => {
    const files = e.clipboardData?.files;
    if (files && files.length) {
      e.preventDefault();
      addImageFiles(files);
    }
  };

  const removeAttachedImage = (index: number) => {
    setAttachedImages(prev => prev.filter((_, i) => i !== index));
  };

  const loadSessions = () => {
    fetch(`${BACKEND_API.BASE_URL}/api/chat-edit/sessions`)
      .then((r) => r.json())
      .then((d) => setSessions((d?.sessions || []).filter((x: any) => x.workflow_id === 'venice-chat')))
      .catch(() => {});
  };

  const openSession = async (id: string) => {
    try {
      const full = await (await fetch(
        `${BACKEND_API.BASE_URL}/api/chat-edit/sessions/${encodeURIComponent(id)}`)).json();
      if (Array.isArray(full?.messages)) {
        setChatMessages(full.messages);
        setChatSessionId(full.id);
        setAttachedImages([]);
      }
    } catch { toast('Could not open that chat', 'error'); }
  };

  const deleteSession = async (id: string) => {
    try {
      await fetch(`${BACKEND_API.BASE_URL}/api/chat-edit/sessions/${encodeURIComponent(id)}`,
        { method: 'DELETE' });
      if (id === chatSessionId) { setChatSessionId(null); }
      loadSessions();
    } catch { toast('Could not delete that chat', 'error'); }
  };

  /** Starts a fresh thread. The one on screen is already saved, so nothing is
   *  lost - which is the difference between this and the old Clear Chat. */
  const newChat = () => {
    setChatSessionId(null);
    setChatMessages([
      { role: 'assistant', content: "New chat. What are we making?" }
    ]);
    setAttachedImages([]);
    loadSessions();
  };

  const clearChat = newChat;

  useEffect(() => {
    fetch(`${BACKEND_API.BASE_URL}${BACKEND_API.ENDPOINTS.VENICE_CHARACTERS}?limit=80`)
      .then((r) => r.json())
      .then((d) => { if (d?.success) setCharacters(d.characters || []); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch(`${BACKEND_API.BASE_URL}${BACKEND_API.ENDPOINTS.VENICE_EDIT_MODELS}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d?.success) return;
        setEditModels(d.models || []);
        setEditModel((cur) => cur || d.default || '');
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const list = await (await fetch(`${BACKEND_API.BASE_URL}/api/chat-edit/sessions`)).json();
        const mine = (list?.sessions || []).find((x: any) => x.workflow_id === 'venice-chat');
        if (mine) {
          const full = await (await fetch(
            `${BACKEND_API.BASE_URL}/api/chat-edit/sessions/${encodeURIComponent(mine.id)}`)).json();
          if (Array.isArray(full?.messages) && full.messages.length) {
            setChatMessages(full.messages);
            setChatSessionId(full.id);
          }
        }
      } catch { /* offline: the greeting stands and nothing is lost */ }
      // Only after a restore attempt, or the save below would immediately
      // overwrite the stored thread with the greeting.
      chatLoaded.current = true;
      loadSessions();
    })();
  }, []);

  useEffect(() => {
    if (!chatLoaded.current) return;
    // Never store the opening greeting on its own - an empty chat should not
    // occupy a session.
    if (chatMessages.length < 2) return;
    const id = window.setTimeout(() => {
      fetch(`${BACKEND_API.BASE_URL}/api/chat-edit/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: chatSessionId,
          workflow_id: 'venice-chat',
          messages: chatMessages,
          // The store titles a chat from the first user message's `text`,
          // and these carry `content`, so without this every Venice thread
          // would be listed as "New chat".
          title: (chatMessages.find((m) => m.role === 'user')?.content || '').slice(0, 60),
        }),
      })
        .then((r) => r.json())
        .then((d) => { if (d?.id && !chatSessionId) setChatSessionId(d.id); loadSessions(); })
        .catch(() => {});
    }, 800);
    return () => window.clearTimeout(id);
  }, [chatMessages, chatSessionId]);

  const sendChatMessage = async () => {
    if (!chatInput.trim() && attachedImages.length === 0) return;

    const userMessage: ChatMessage = {
      role: 'user',
      content: chatInput.trim(),
      images: attachedImages.length > 0 ? [...attachedImages] : undefined,
    };

    const newMessages = [...chatMessages, userMessage];
    setChatMessages(newMessages);
    setChatInput('');
    setAttachedImages([]);

    setIsChatGenerating(true);

    const systemPrompt = `You are an expert creative AI agent with direct access to image generation tools via the "generate_image" function.

CRITICAL RULE: Whenever the user asks you to generate, create, draw, visualize, produce, make, or show any images, pictures, illustrations, or visuals (including specific characters like "Elara", settings like "safari camp", "sunset", etc.), you MUST immediately call the generate_image tool. 

EQUALLY IMPORTANT: when the user has attached an image and asks you to CHANGE it - remove, replace, add, recolour, swap, keep-but-alter anything in it - call edit_image instead, never generate_image. "Remove her top, keep the denim jacket" is an edit of the picture in front of you, not a description of a new one to invent. Pass only the change as the instruction; the model already sees the image.

Do NOT just say "I'll generate" or describe the image in text only — actually invoke the tool with a high-quality, detailed prompt.

You can generate multiple images (up to 4) in one call using the num_images parameter. Make the prompt very descriptive.

Current context: User is requesting images of Elara at the safari camp, now specifying "sunset setting". Use rich, cinematic, detailed prompts.`;

    let apiMessages = newMessages.map((msg) => {
      // Only a user turn may carry image parts. An assistant message with
      // image_url content is rejected outright - "Invalid request parameters" -
      // and the images on an assistant turn are ours to display, not context to
      // hand back.
      //
      // And only images Venice can actually read: a data: url or an absolute
      // one. Generated images became /comfy/view?... paths when they moved to
      // disk, and Venice answers "Supplied image did not pass validation
      // checks" for those, since it cannot fetch a path on this machine.
      const sendable = msg.role === 'user'
        ? (msg.images || []).filter((u) => u.startsWith('data:') || /^https?:\/\//i.test(u))
        : [];
      if (sendable.length > 0) {
        return {
          role: msg.role,
          content: [
            { type: 'text', text: msg.content },
            ...sendable.map(img => ({ type: 'image_url', image_url: { url: img } }))
          ]
        };
      }
      return { role: msg.role, content: msg.content };
    });

    // Prepend system prompt to encourage proper tool use for image requests
    apiMessages = [{ role: "system", content: systemPrompt }, ...apiMessages];

    const body: any = {
      model: chatModel,
      messages: apiMessages,
      stream: true,
      temperature: chatTemperature,
      tools: [
        {
          type: "function",
          function: {
            name: "edit_image",
            description: "Modify the image the user attached: remove, replace, add, recolour or alter something in it while keeping the rest. Use this whenever an image is attached and the user asks for a change. Never use generate_image for that - it would invent an unrelated picture.",
            parameters: {
              type: "object",
              properties: {
                instruction: {
                  type: "string",
                  description: "Short, direct description of the change only, e.g. 'remove her top, keep the denim jacket'. Do not describe the whole scene - the model can see the image."
                },
                model: {
                  type: "string",
                  description: "Optional edit model. Leave unset unless the user names one - the app picks the default. firered-image-edit is the general choice; qwen-edit-uncensored only for explicit anatomy other models refuse."
                }
              },
              required: ["instruction"]
            }
          }
        },
        {
          type: "function",
          function: {
            name: "generate_image",
            description: "Generate one or more images from a detailed text prompt using Venice AI. ALWAYS call this tool when the user requests to generate, create, draw, visualize, produce, or make any images or pictures. You can generate up to 4 images by using the num_images parameter.",
            parameters: {
              type: "object",
              properties: {
                prompt: {
                  type: "string",
                  description: "A rich, detailed, vivid prompt describing the desired image(s). Be specific about subject, setting, lighting, style, composition, mood, etc."
                },
                negative_prompt: {
                  type: "string",
                  description: "Optional: things to avoid in the image (e.g. blurry, low quality)."
                },
                num_images: {
                  type: "integer",
                  description: "Number of different images to generate (between 1 and 4). Default to 4 if the user wants multiple."
                }
              },
              required: ["prompt"]
            }
          }
        }
      ],
      tool_choice: "auto",
      venice_parameters: {
        enable_web_search: enableWebSearch ? 'auto' : 'off',
        enable_web_citations: true,
        include_venice_system_prompt: true,
        // Venice applies the character server-side; the tools still work, so the
        // agent stays able to generate and edit while in character.
        ...(characterSlug ? { character_slug: characterSlug } : {}),
      }
    };

    try {
      const res = await fetch(`${BACKEND_API.BASE_URL}${BACKEND_API.ENDPOINTS.VENICE_CHAT}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      // A stream that failed upstream comes back as JSON rather than SSE, so the
      // key/balance/rate-limit message survives instead of showing as an empty
      // reply.
      if ((res.headers.get('content-type') || '').includes('application/json')) {
        const errData = await res.json();
        if (errData?.success === false) {
          throw new Error(errData.detail || errData.error || 'Venice call failed');
        }
      }

      if (!res.ok) {
        let errMsg = `API error ${res.status}`;
        try {
          const errData = await res.json();
          if (errData.error) errMsg += `: ${errData.error}`;
        } catch {
          const txt = await res.text();
          errMsg += `: ${txt}`;
        }
        throw new Error(errMsg);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response stream');

      const decoder = new TextDecoder();
      let assistantContent = '';
      let done = false;
      // One entry per tool call. The model may emit several - four book
      // covers arrive as four - streamed interleaved and told apart only by
      // tc.index. A single buffer ran their arguments together into
      // {...}{...}{...} and JSON.parse died at the end of the first.
      const toolCalls: Array<{ id: string; name: string; arguments: string }> = [];

      const assistantMsgIndex = newMessages.length;
      setChatMessages([...newMessages, { role: 'assistant', content: '' }]);
      // Reasoning models put their working here and the answer in `content`.
      // Kept only so an answer that never reached `content` can say why.
      let assistantReasoning = '';

      while (!done) {
        const { value, done: streamDone } = await reader.read();
        done = streamDone;
        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim();
              if (data === '[DONE]') { done = true; break; }
              try {
                const parsed = JSON.parse(data);
                const delta = parsed.choices?.[0]?.delta;

                if (delta?.reasoning_content) {
                  assistantReasoning += delta.reasoning_content;
                }

                if (delta?.content) {
                  assistantContent += delta.content;
                  setChatMessages(prev => {
                    const updated = [...prev];
                    updated[assistantMsgIndex] = { role: 'assistant', content: assistantContent };
                    return updated;
                  });
                }

                // Accumulate tool calls for image generation etc.
                if (delta?.tool_calls && delta.tool_calls.length > 0) {
                  // Every entry in the delta, not just the first: a chunk can
                  // carry fragments of two different calls.
                  for (const tc of delta.tool_calls) {
                    const at = typeof tc.index === 'number' ? tc.index : 0;
                    if (!toolCalls[at]) toolCalls[at] = { id: '', name: '', arguments: '' };
                    // id and name arrive once, on that call's opening chunk;
                    // the arguments dribble in across the rest.
                    if (tc.id) toolCalls[at].id = tc.id;
                    if (tc.function?.name) toolCalls[at].name = tc.function.name;
                    if (tc.function?.arguments) toolCalls[at].arguments += tc.function.arguments;
                  }
                  // Optionally show "Generating image..." in UI
                  const firstCall = toolCalls.find(Boolean);
                  if (firstCall && (firstCall.name === 'generate_image'
                    || firstCall.name === 'edit_image') && !assistantContent) {
                    assistantContent = GENERATING;
                    setChatMessages(prev => {
                      const updated = [...prev];
                      updated[assistantMsgIndex] = { role: 'assistant', content: assistantContent };
                      return updated;
                    });
                  }
                }
              } catch {}
            }
          }
        }
      }

      // Execute tool calls if detected (e.g. image generation)
      // Parameters are named for what the body below already refers to, so
      // running several calls needed no change to the code that runs one.
      const runToolCall = async (
        toolCallAccumulator: { id: string; name: string; arguments: string },
        assistantMsgIndex: number,
      ) => {
      if (toolCallAccumulator && toolCallAccumulator.name === 'edit_image') {
        try {
          const args = JSON.parse(toolCallAccumulator.arguments || '{}');
          // The picture to edit is the last one the user attached, which is what
          // "this image" means in a conversation.
          const source = [...newMessages].reverse()
            .find((m) => m.role === 'user' && m.images?.length)?.images?.[0];
          if (!source) throw new Error('No attached image to edit - drop one in first');

          const localEdit = LOCAL_EDIT_MODELS.find((m) => m.id === localEditModel);
          if (localEdit) {
            // The picture is a data: URL in the conversation and the graph
            // loads by filename from ComfyUI's input directory. Same hop the
            // reel pipelines make, same helper.
            const staged = await stageAsInput(source, `venice-edit-${Date.now()}.png`);
            const promptId = await submitGenerate(localEdit.id, {
              image: staged,
              prompt: args.instruction || args.prompt || chatInput,
              ...(localEdit.negative && args.negative_prompt
                ? { negative: args.negative_prompt } : {}),
              // Without these the graph forces 768x768 on everything.
              ...(await editSizeFor(source)),
              seed: Math.floor(Math.random() * 1_000_000_000),
            });
            const files = await pollGeneration({
              promptId, workflowId: localEdit.id, resultKey: 'images',
            });
            const urls = files.map(viewUrl);
            setChatMessages((prev) => {
              const updated = [...prev];
              updated[assistantMsgIndex] = {
                role: 'assistant',
                content: agentText(assistantContent)
                  || `Edited on your GPU with ${localEdit.label}.`,
                images: urls,
              };
              return updated;
            });
            saveToGlobalGallery(urls, 'local-edit');
            toast('Image edited', 'success');
            return;
          }

          const editRes = await fetch(`${BACKEND_API.BASE_URL}${BACKEND_API.ENDPOINTS.VENICE_IMAGE_EDIT}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              image: source,
              prompt: args.instruction || args.prompt || chatInput,
              // A picked model overrides the agent's suggestion.
              model: editModel || args.model || '',
            }),
          });
          const editData = await editRes.json();
          if (!editRes.ok || editData?.success === false) {
            throw new Error(editData?.detail || editData?.error || 'Edit failed');
          }
          const edited = veniceImageUrls(editData);
          setChatMessages((prev) => {
            const updated = [...prev];
            updated[assistantMsgIndex] = {
              role: 'assistant',
              // Appended rather than used as a fallback: when the agent wrote
              // something of its own, the model name used to vanish, which is
              // exactly the question the user asked.
              content: `${agentText(assistantContent) ? agentText(assistantContent) + '\n\n' : ''}`
                + `_Edited with ${editData.model}_`,
              images: edited,
            };
            return updated;
          });
          saveToGlobalGallery(edited, 'venice-edit');
          toast('Image edited', 'success');
        } catch (editErr: any) {
          toast(editErr.message || 'Edit failed', 'error');
          setChatMessages((prev) => {
            const updated = [...prev];
            updated[assistantMsgIndex] = {
              role: 'assistant',
              content: assistantContent || `I could not edit that: ${editErr.message}`,
            };
            return updated;
          });
        }
      } else if (toolCallAccumulator && toolCallAccumulator.name === 'generate_image') {
        try {
          const args = JSON.parse(toolCallAccumulator.arguments || '{}');
          const imagePrompt = args.prompt || 'Elara at the safari camp at sunset';
          const numVariants = Math.min(Math.max(parseInt(args.num_images || args.variants || 4), 1), 4);
          // Was hardcoded to flux-2-pro, so the model picked on the Image
          // tab never applied to anything the agent generated in chat - and the
          // chat's own select is the text model, which is a different thing.
          const imgModelToUse = args.model || imgModel || 'flux-2-pro';

          const localImg = LOCAL_IMAGE_MODELS.find((m) => m.id === localImgModel);
          if (localImg) {
            const workflowId = localImg.id;
            try {
              // The character, if one is picked and has weights this workflow
              // can load. The trigger goes first - a LoRA trained on a token
              // does almost nothing until the token is in the prompt - and the
              // appearance after, covering what the weights do not carry.
              const chosen = feddaChars.find((c) => c.name === localCharacter);
              const charLora = activeCharLora;
              // Character first: the chain applies in order, and the likeness
              // should be the thing a style is laid over rather than under.
              const extra = extraLoraOptions.includes(localExtraLora) ? localExtraLora : '';
              const loraStack = [
                ...(charLora ? [{ name: charLora.path, strength: 1.0 }] : []),
                ...(extra ? [{ name: extra, strength: 1.0 }] : []),
              ];
              const bits = [
                charSheet?.trigger?.trim() || (charLora ? chosen!.name.toLowerCase() : ''),
                imagePrompt,
                charSheet?.appearance?.trim() || '',
              ].filter(Boolean);

              const promptId = await submitGenerate(workflowId, {
                prompt: charLora ? bits.join(', ') : imagePrompt,
                ...(loraStack.length ? { loras: loraStack } : {}),
                // Only when the graph has somewhere to put it.
                ...(localImg.negative && args.negative_prompt
                  ? { negative: args.negative_prompt } : {}),
                width: args.width || 1024,
                height: args.height || 1024,
                // Not exposed to the model. It asks for a picture; how many
                // steps that takes is not a thing to negotiate in chat.
                seed: Math.floor(Math.random() * 1_000_000_000),
              });
              const files = await pollGeneration({
                promptId, workflowId, resultKey: 'images',
              });
              const urls = files.map(viewUrl);
              setChatMessages(prev => {
                const updated = [...prev];
                updated[assistantMsgIndex] = {
                  role: 'assistant',
                  content: agentText(assistantContent)
                    || `Generated on your GPU with ${localImg.label}`
                      + (charLora ? ` as ${chosen!.name} (${loraFileName(charLora.path)})` : '')
                      + (extra ? ` over ${loraFileName(extra)}` : '')
                      + '.',
                  images: urls,
                };
                return updated;
              });
              saveToGlobalGallery(urls, 'venice-local');
            } catch (localErr: any) {
              const why = localErr instanceof PipelineCancelled
                ? 'Cancelled.'
                : `Local generation failed: ${localErr?.message || localErr}`;
              toast(why, 'error');
              setChatMessages(prev => {
                const updated = [...prev];
                updated[assistantMsgIndex] = { role: 'assistant', content: why };
                return updated;
              });
            }
            // The finally at the end of sendChat clears the generating
            // flag; returning here skips the Venice call, not the cleanup.
            return;
          }

          const imgBody: any = {
            model: imgModelToUse,
            prompt: imagePrompt,
            width: args.width || 1024,
            height: args.height || 1024,
            variants: numVariants,
            format: 'png',
            safe_mode: false,
            hide_watermark: true
          };
          if (args.negative_prompt) imgBody.negative_prompt = args.negative_prompt;

          const imgRes = await fetch(`${BACKEND_API.BASE_URL}${BACKEND_API.ENDPOINTS.VENICE_IMAGE}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(imgBody)
          });

          const imgData = imgRes.ok ? await imgRes.json() : null;
          if (imgData && imgData.success !== false) {
            const newImgs: string[] = veniceImageUrls(imgData);

            const finalContent = agentText(assistantContent)
              || `Here are ${newImgs.length} images:`;

            setChatMessages(prev => {
              const updated = [...prev];
              updated[assistantMsgIndex] = { 
                role: 'assistant', 
                content: finalContent,
                images: newImgs 
              };
              return updated;
            });

            saveToGlobalGallery(newImgs, 'venice-agent');
          } else {
            const err = await imgRes.text();
            throw new Error('Image tool failed: ' + err);
          }
        } catch (toolErr: any) {
          console.error('Tool execution error:', toolErr);
          toast('Agent tried to generate image but failed: ' + (toolErr.message || ''), 'error');
          setChatMessages(prev => {
            const updated = [...prev];
            updated[assistantMsgIndex] = { 
              role: 'assistant', 
              content: assistantContent || 'I tried to generate an image but encountered an issue.' 
            };
            return updated;
          });
        }
      }
      };

      // In turn, each into its own message. Sharing one would leave the last
      // cover standing where four were asked for - a run that looks like it
      // worked and quietly returns a quarter of the job.
      const pending = toolCalls.filter(Boolean);
      for (let i = 0; i < pending.length; i++) {
        if (i > 0) {
          // The agent's preamble belongs to the first result only; repeated
          // over four it reads as four copies of the same answer.
          assistantContent = '';
          setChatMessages((prev) => [...prev, { role: 'assistant', content: '' }]);
        }
        await runToolCall(pending[i], assistantMsgIndex + i);
      }

      // A reply that reasoned and then ran out of budget leaves content empty.
      // Saying so beats an empty bubble the user cannot interpret.
      if (!assistantContent && assistantReasoning) {
        setChatMessages(prev => {
          const updated = [...prev];
          updated[assistantMsgIndex] = {
            role: 'assistant',
            content: 'The model spent its whole token budget reasoning and never wrote an answer. '
              + 'Ask again, or raise max tokens.',
          };
          return updated;
        });
      }
    } catch (e: any) {
      console.error(e);
      const raw = e.message || 'Failed to get response from Venice.';
      const friendly = raw.includes('429') || raw.toLowerCase().includes('overloaded')
        ? 'The model is currently overloaded on Venice.ai. Try switching models (GLM or Kimi often have capacity) or wait a bit and retry.'
        : raw;
      toast(friendly, 'error');
      setChatMessages(prev => prev.slice(0, -1));
    } finally {
      setIsChatGenerating(false);
    }
  };

  const handleChatKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendChatMessage();
    }
  };

  // The chat earns the whole window: a conversation with a session list and an
  // image strip in it was being squeezed into 1100px, with the controls wrapping
  // into vertical slivers. The image tab is a form and stays narrow.
  return (
    <div className={`h-full overflow-y-auto custom-scrollbar p-6 mx-auto ${
      activeTab === 'chat' ? 'max-w-[1800px]' : 'max-w-[1100px]'}`}>
      <FeddaPanel className="overflow-hidden">
        {/* Shared Header + Tabs */}
        <div className="border-b border-white/10 px-6 py-4 bg-black/20">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 flex items-center justify-center border border-white/10">
                <Sparkles className="h-4.5 w-4.5 text-violet-300" />
              </div>
              <div>
                <div className="font-semibold text-lg tracking-[-0.3px]">Venice.ai</div>
                <div className="text-[10px] text-white/40 tracking-[0.5px] -mt-px">PRIVATE • DIRECT API • IMAGE + AGENT</div>
              </div>
            </div>
            <div className="text-[10px] px-3 py-1 rounded-full border border-white/10 bg-white/5 text-white/50 font-mono tracking-widest">uncensored • tools • vision</div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-white/10 -mx-1">
            <button
              onClick={() => setActiveTab('image')}
              className={`px-6 py-2.5 text-sm font-medium flex items-center gap-2 border-b-2 transition-colors ${
                activeTab === 'image'
                  ? 'border-violet-500 text-white'
                  : 'border-transparent text-white/60 hover:text-white/90'
              }`}
            >
              <ImageIcon className="h-4 w-4" /> Image Generation
            </button>
            <button
              onClick={() => setActiveTab('chat')}
              className={`px-6 py-2.5 text-sm font-medium flex items-center gap-2 border-b-2 transition-colors ${
                activeTab === 'chat'
                  ? 'border-violet-500 text-white'
                  : 'border-transparent text-white/60 hover:text-white/90'
              }`}
            >
              <Settings className="h-4 w-4" /> Agent Chat
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="p-6">
          {activeTab === 'image' && (
            <div className="space-y-6 max-w-3xl mx-auto">
              {/* IMAGE UI - adapted from previous */}
              <div className="space-y-4">
                {/* Prompt */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <ImageIcon className="h-3.5 w-3.5 text-white/50" />
                    <div className="text-xs font-semibold uppercase tracking-[1px] text-white/60">Prompt</div>
                  </div>
                  <textarea
                    value={imgPrompt}
                    onChange={e => setImgPrompt(e.target.value)}
                    placeholder="A cinematic portrait of a cyberpunk samurai in neon rain..."
                    className="w-full min-h-[90px] resize-y rounded-xl fedda-input p-4 text-sm focus:border-violet-500/40"
                  />
                </div>

                {/* Model + Negative */}
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                  <div className="md:col-span-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Sliders className="h-3.5 w-3.5 text-white/50" />
                      <div className="text-xs font-semibold uppercase tracking-[1px] text-white/60">Model</div>
                    </div>
                    <select
                      value={imgModel}
                      onChange={e => setImgModel(e.target.value)}
                      className="w-full rounded-xl fedda-input p-3 text-sm focus:border-violet-500/40"
                    >
                      {imageModels.map(m => (
                        <option key={m.id} value={m.id}>{m.label}</option>
                      ))}
                    </select>
                    {modelLimits[imgModel]?.length ? (
                      <div className="text-[10px] text-white/45 mt-1">
                        {veniceTier ? `${veniceTier} tier - ` : ''}
                        {modelLimits[imgModel]
                          .map(l => `${l.amount.toLocaleString()} ${l.type}`)
                          .join(' / ')}
                      </div>
                    ) : (
                      <div className="text-[10px] text-amber-400/70 mt-1">
                        Popular models can be overloaded - try venice-sd35 or chroma if you see 429 errors.
                      </div>
                    )}
                  </div>
                  <div className="md:col-span-2">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="text-xs font-semibold uppercase tracking-[1px] text-white/60">Negative Prompt</div>
                    </div>
                    <input
                      type="text"
                      value={negativePrompt}
                      onChange={e => setNegativePrompt(e.target.value)}
                      placeholder="blurry, low quality, deformed"
                      className="w-full rounded-xl fedda-input p-3 text-sm focus:border-violet-500/40"
                    />
                  </div>
                </div>

                {/* Dimensions & Settings */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Hash className="h-3.5 w-3.5 text-white/50" />
                    <div className="text-xs font-semibold uppercase tracking-[1px] text-white/60">Dimensions &amp; Settings</div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="space-y-1">
                      <div className="text-[10px] text-white/50">Width</div>
                      <input type="number" value={width} onChange={e=>setWidth(+e.target.value)} className="w-full rounded-xl fedda-input p-2.5 text-sm focus:border-violet-500/40" />
                    </div>
                    <div className="space-y-1">
                      <div className="text-[10px] text-white/50">Height</div>
                      <input type="number" value={height} onChange={e=>setHeight(+e.target.value)} className="w-full rounded-xl fedda-input p-2.5 text-sm focus:border-violet-500/40" />
                    </div>
                    <div className="space-y-1">
                      <div className="text-[10px] text-white/50">Steps</div>
                      <input type="number" value={steps} onChange={e=>setSteps(+e.target.value)} className="w-full rounded-xl fedda-input p-2.5 text-sm focus:border-violet-500/40" />
                    </div>
                    <div className="space-y-1">
                      <div className="text-[10px] text-white/50">CFG Scale</div>
                      <input type="number" step="0.5" value={cfgScale} onChange={e=>setCfgScale(+e.target.value)} className="w-full rounded-xl fedda-input p-2.5 text-sm focus:border-violet-500/40" />
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="text-[10px] text-white/50 mb-1">Seed (optional)</div>
                    <input type="number" value={seed ?? ''} onChange={e=>setSeed(e.target.value ? +e.target.value : undefined)} placeholder="Leave blank for random" className="w-full rounded-xl fedda-input p-2.5 text-sm font-mono focus:border-violet-500/40" />
                  </div>
                </div>

                {/* Generate Button */}
                <div className="pt-1">
                  <FeddaButton
                    variant="violet"
                    onClick={generateImage}
                    disabled={isImgGenerating || !imgPrompt.trim()}
                    className="w-full h-11 text-base font-semibold tracking-tight flex items-center justify-center gap-3 rounded-2xl active:scale-[0.985] transition-all disabled:opacity-60"
                  >
                    {isImgGenerating ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Generating with {imageModels.find(m => m.id === imgModel)?.label.split(' (')[0] || imgModel}…</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4.5 w-4.5" />
                        <span>Generate Image</span>
                      </>
                    )}
                  </FeddaButton>
                </div>

                {imgError && (
                  <div className="flex items-start gap-3 rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-300">
                    <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">{imgError}</div>
                    <FeddaButton
                      size="sm"
                      variant="ghost"
                      onClick={() => { setImgError(''); generateImage(); }}
                      className="text-red-300 hover:text-red-100 border-red-500/30"
                    >
                      Retry
                    </FeddaButton>
                  </div>
                )}

                {/* Results Gallery */}
                {images.length > 0 && (
                  <div className="pt-4 border-t border-white/10">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="text-xs font-semibold uppercase tracking-[1px] text-white/60">Generated Images</div>
                        <div className="text-[10px] px-1.5 py-px rounded bg-white/5 text-white/40 font-mono">{images.length}</div>
                      </div>
                      <button onClick={() => setImages([])} className="text-xs text-white/50 hover:text-white/80 transition">CLEAR</button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {images.map((src, i) => (
                        <div key={i} className="group relative overflow-hidden rounded-2xl border border-white/10 bg-black/50 aspect-square">
                          <img 
                            src={src} 
                            alt={`Venice image ${i + 1}`} 
                            className="absolute inset-0 h-full w-full object-cover transition-all duration-300 group-hover:scale-[1.025] cursor-pointer" 
                            onClick={() => setLightboxImage(src)}
                          />
                          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/30 to-black/80 opacity-0 group-hover:opacity-100 transition-opacity" />
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              triggerMediaDownload(src, `venice-${imgModel}-${Date.now()}.png`);
                            }}
                            className="absolute bottom-3 right-3 flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/90 text-black text-xs font-semibold tracking-wide hover:bg-white transition shadow-lg active:scale-95"
                          >
                            <Download className="h-3.5 w-3.5" /> DOWNLOAD
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setLightboxImage(src);
                            }}
                            className="absolute top-3 right-3 px-2 py-1 rounded-full bg-white/80 text-black text-[10px] font-medium hover:bg-white transition opacity-0 group-hover:opacity-100"
                          >
                            Fullscreen
                          </button>
                          <div className="absolute top-3 left-3 px-2 py-0.5 rounded-full bg-black/60 text-[10px] font-mono text-white/60 backdrop-blur">
                            {i + 1}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'chat' && (
            <div
              className={`w-full rounded-2xl transition-colors ${
                isChatDragOver ? 'ring-2 ring-violet-400/70 ring-offset-2 ring-offset-[#07080d]' : ''
              }`}
              onDragOver={(e) => { e.preventDefault(); setIsChatDragOver(true); }}
              onDragEnter={(e) => { e.preventDefault(); setIsChatDragOver(true); }}
              onDragLeave={(e) => {
                // Leaving for a child element still fires here; ignore those.
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsChatDragOver(false);
              }}
              onDrop={handleChatDrop}
            >
              {/* CHAT UI - adapted from previous full page */}
              <div className="space-y-4">
                {/* Chat Header Controls */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                  <div className="flex items-center gap-3">
                    {/* The 429 note used to sit here as a sentence and wrapped
                        into a one-word-per-line column. It belongs on the thing
                        it is about. */}
                    <select
                      value={chatModel}
                      onChange={(e) => setChatModel(e.target.value)}
                      title="If you hit overload (429), switch models or retry in a minute."
                      className="rounded-lg fedda-input px-3 py-1.5 text-sm focus:border-violet-500/40"
                    >
                      {VENICE_CHAT_MODELS.map(m => (
                        <option key={m.id} value={m.id}>{m.label}</option>
                      ))}
                    </select>
                    <label className="flex items-center gap-1.5 text-white/60 cursor-pointer text-xs whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={enableWebSearch}
                        onChange={(e) => setEnableWebSearch(e.target.checked)}
                        className="accent-violet-500"
                      />
                      <Globe className="h-3.5 w-3.5" /> Web Search
                    </label>
                  </div>
                  <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-2">
                  <label className="flex items-center gap-1.5 text-[11px] text-white/45 whitespace-nowrap">
                    Image&nbsp;model
                    <select
                      value={imgModel}
                      onChange={(e) => setImgModel(e.target.value)}
                      title="Which model the agent generates with. Shared with the Image tab, so it is one choice, not two."
                      className="max-w-[150px] rounded-lg fedda-input px-2 py-1 text-[11px] focus:border-violet-500/40"
                    >
                      {imageModels.map((m) => (
                        <option key={m.id} value={m.id}>{m.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-1.5 text-[11px] text-white/45 whitespace-nowrap">
                    Character
                    <select
                      value={characterSlug}
                      onChange={(e) => setCharacterSlug(e.target.value)}
                      title={characters.find((c) => c.slug === characterSlug)?.description
                        || 'Answer as a public Venice character. Off means the app\'s own agent prompt.'}
                      className="max-w-[160px] rounded-lg fedda-input px-2 py-1 text-[11px] focus:border-violet-500/40"
                    >
                      <option value="">No character</option>
                      {characters.map((c) => (
                        <option key={c.slug} value={c.slug}>{c.name}{c.adult ? ' (18+)' : ''}</option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-1.5 text-[11px] text-white/45">
                    Edit&nbsp;model
                    <select
                      value={editModel}
                      onChange={(e) => setEditModel(e.target.value)}
                      title="Which Venice model performs an edit when you attach an image and ask for a change"
                      className="rounded-lg fedda-input px-2 py-1 text-[11px] focus:border-violet-500/40"
                    >
                      {(editModels.length ? editModels : [editModel]).filter(Boolean).map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </label>

                  {/* Your own GPU. Empty means Venice, so these two are the
                      only place the question is answered - a separate on/off
                      would let a Venice model be picked while something else
                      quietly overrode it. */}
                  <label className="flex items-center gap-1.5 whitespace-nowrap text-[11px] text-emerald-300/60">
                    Local&nbsp;image
                    <select
                      value={localImgModel}
                      onChange={(e) => setLocalImgModel(e.target.value)}
                      title="Generate on this machine instead of Venice. Free, unmetered, and as fast as your GPU."
                      className="max-w-[150px] rounded-lg fedda-input px-2 py-1 text-[11px] focus:border-emerald-500/40"
                    >
                      <option value="">Use Venice</option>
                      {LOCAL_IMAGE_MODELS.map((m) => (
                        <option key={m.id} value={m.id}>{m.label}</option>
                      ))}
                    </select>
                  </label>
                  {/* Only the ones whose weights this workflow can load. A
                      character with nothing but wan22 LoRAs has nothing to give
                      a z-image run, and offering them returns a stranger from a
                      generation that looked like it worked. */}
                  <label className="flex items-center gap-1.5 whitespace-nowrap text-[11px] text-emerald-300/60">
                    Character
                    <select
                      value={localCharacter}
                      onChange={(e) => setLocalCharacter(e.target.value)}
                      disabled={!localImgModel}
                      title={localImgModel
                        ? 'Generate as one of your own characters, using their LoRA and sheet.'
                        : 'Pick a local image model first - Venice cannot load a LoRA.'}
                      className="max-w-[150px] rounded-lg fedda-input px-2 py-1 text-[11px] focus:border-emerald-500/40 disabled:opacity-40"
                    >
                      <option value="">Nobody</option>
                      {feddaChars
                        .filter((c) => {
                          const m = LOCAL_IMAGE_MODELS.find((x) => x.id === localImgModel);
                          return m ? characterMatchesFamily(c, m.family) : false;
                        })
                        .map((c) => (
                          // Flagged, not hidden. Without a sheet there is no
                          // trigger word and the name alone is a guess, which
                          // is the difference between their face and a
                          // stranger wearing the prompt.
                          <option key={c.name} value={c.name}>
                            {c.has_sheet ? c.name : c.name + '  (no sheet)'}
                          </option>
                        ))}
                    </select>
                  </label>
                  {/* Only worth showing when there is something to choose
                      between. One file is not a decision. */}
                  {charLoraOptions.length > 1 && (
                    <label className="flex items-center gap-1.5 whitespace-nowrap text-[11px] text-emerald-300/60">
                      LoRA
                      <select
                        value={activeCharLora?.path || ''}
                        onChange={(e) => setLocalCharLora(e.target.value)}
                        title="Which of this character's LoRAs to load."
                        className="max-w-[190px] rounded-lg fedda-input px-2 py-1 text-[11px] focus:border-emerald-500/40"
                      >
                        {charLoraOptions.map((l) => (
                          <option key={l.path} value={l.path}>{loraFileName(l.path)}</option>
                        ))}
                      </select>
                    </label>
                  )}
                  {/* Not called Style: the list also holds Lightning
                      speedups and fixers, and some of those change what the
                      workflow needs. Hence off by default. */}
                  {extraLoraOptions.length > 0 && (
                    <label className="flex items-center gap-1.5 whitespace-nowrap text-[11px] text-emerald-300/60">
                      Extra
                      <select
                        value={localExtraLora}
                        onChange={(e) => setLocalExtraLora(e.target.value)}
                        title="A second LoRA stacked over the character - styles, fixers, speedups."
                        className="max-w-[170px] rounded-lg fedda-input px-2 py-1 text-[11px] focus:border-emerald-500/40"
                      >
                        <option value="">No extra</option>
                        {extraLoraOptions.map((path) => (
                          <option key={path} value={path}>{loraFileName(path)}</option>
                        ))}
                      </select>
                    </label>
                  )}
                  <label className="flex items-center gap-1.5 whitespace-nowrap text-[11px] text-emerald-300/60">
                    Local&nbsp;edit
                    <select
                      value={localEditModel}
                      onChange={(e) => setLocalEditModel(e.target.value)}
                      title="Edit an attached image on this machine instead of Venice."
                      className="max-w-[150px] rounded-lg fedda-input px-2 py-1 text-[11px] focus:border-emerald-500/40"
                    >
                      <option value="">Use Venice</option>
                      {LOCAL_EDIT_MODELS.map((m) => (
                        <option key={m.id} value={m.id}>{m.label}</option>
                      ))}
                    </select>
                  </label>
                  <FeddaButton size="sm" variant="ghost" onClick={newChat} className="gap-1.5 whitespace-nowrap">
                    <Trash2 className="h-3.5 w-3.5" /> New chat
                  </FeddaButton>
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
                  {/* Saved chats. They were already being written to the store;
                      there was simply no way to reach one. */}
                  <aside className="hidden lg:flex max-h-[min(70vh,780px)] flex-col gap-1 overflow-y-auto rounded-2xl border border-white/10 bg-black/30 p-2 custom-scrollbar">
                    <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-[1px] text-white/35">
                      Saved chats {sessions.length > 0 && `(${sessions.length})`}
                    </div>
                    {sessions.length === 0 && (
                      <p className="px-2 py-2 text-[11px] leading-relaxed text-white/30">
                        Chats are saved as you talk. This one will appear here once you send something.
                      </p>
                    )}
                    {sessions.map((sess) => (
                      <div
                        key={sess.id}
                        className={`group flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] transition ${
                          sess.id === chatSessionId ? 'bg-violet-500/15 text-violet-100' : 'text-white/55 hover:bg-white/5'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => void openSession(sess.id)}
                          className="min-w-0 flex-1 text-left"
                          title={sess.title}
                        >
                          <span className="block truncate">{sess.title || 'Untitled'}</span>
                          <span className="block text-[9px] text-white/25">
                            {sess.count} messages · {(sess.updated || '').slice(0, 10)}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => void deleteSession(sess.id)}
                          title="Delete this chat"
                          className="opacity-0 transition group-hover:opacity-100 hover:text-red-300"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </aside>

                <div className="min-w-0">
                {/* Messages */}
                <div className="h-[min(70vh,780px)] overflow-y-auto p-4 space-y-5 bg-black/30 rounded-2xl border border-white/10 custom-scrollbar">
                  {chatMessages.map((msg, idx) => (
                    <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${msg.role === 'user' ? 'bg-white/10' : 'bg-white/5 border border-white/10'}`}>
                        {msg.images && msg.images.length > 0 && (
                          <div className="mb-2">
                            {msg.role === 'assistant' && (
                              <div className="text-[10px] text-emerald-400/80 mb-1 font-medium">Generated images</div>
                            )}
                            <div className="flex flex-wrap gap-2">
                              {msg.images.map((img, i) => (
                                <div key={i} className="group relative">
                                  <img 
                                    src={img} 
                                    className="max-h-28 rounded-lg border border-white/10 cursor-pointer hover:scale-[1.02] transition" 
                                    alt="generated or attached" 
                                    onClick={() => setLightboxImage(img)}
                                  />
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      triggerMediaDownload(img, `venice-${msg.role}-${i + 1}.png`);
                                    }}
                                    className="absolute bottom-1 right-1 p-1 rounded bg-black/60 text-white opacity-0 group-hover:opacity-100 hover:bg-black/80 transition flex items-center justify-center"
                                    title="Download"
                                  >
                                    <Download className="h-3 w-3" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        <div className="whitespace-pre-wrap">{msg.content}</div>
                      </div>
                    </div>
                  ))}
                  {isChatGenerating && (
                    <div className="flex justify-start">
                      <div className="bg-white/5 border border-white/10 rounded-2xl px-4 py-2 flex items-center gap-2 text-sm text-white/60">
                        <Loader2 className="h-4 w-4 animate-spin" /> Thinking...
                      </div>
                    </div>
                  )}
                  <div ref={chatMessagesEndRef} />
                </div>

                {/* Input */}
                <div>
                  {attachedImages.length > 0 && (
                    <div className="flex gap-2 mb-2 flex-wrap">
                      {attachedImages.map((img, i) => (
                        <div key={i} className="relative group">
                          <img src={img} className="h-12 w-12 object-cover rounded-lg border border-white/10" />
                          <button onClick={() => removeAttachedImage(i)} className="absolute -top-1 -right-1 bg-red-500 text-white text-xs px-1 rounded-full opacity-80">×</button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex items-end gap-2">
                    <button
                      onClick={() => chatFileInputRef.current?.click()}
                      className="h-10 w-10 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 flex items-center justify-center transition"
                      title="Attach an image - you can also drop one anywhere here, or paste"
                    >
                      <ImageIcon className="h-4 w-4" />
                    </button>
                    <input ref={chatFileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageAttach} />

                    <textarea
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={handleChatKeyDown}
                      onPaste={handleChatPaste}
                      placeholder="Ask the agent, or drop and paste images straight in..."
                      className="flex-1 resize-y min-h-[44px] max-h-32 rounded-2xl fedda-input p-3 text-sm focus:border-violet-500/40"
                      rows={1}
                    />
                    <FeddaButton
                      onClick={sendChatMessage}
                      disabled={isChatGenerating || (!chatInput.trim() && attachedImages.length === 0)}
                      variant="violet"
                      className="h-10 px-5 gap-2"
                    >
                      {isChatGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      Send
                    </FeddaButton>
                  </div>
                  <div className="text-[10px] text-white/40 mt-1.5 px-1">The agent supports tools including image generation (Kimi K2.5 can call generate_image). Generated images appear inline. Use the Image tab for advanced controls.</div>
                </div>
                </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </FeddaPanel>

      {lightboxImage && (
        <Lightbox 
          imageUrl={lightboxImage} 
          onClose={() => setLightboxImage(null)} 
        />
      )}
    </div>
  );
}
