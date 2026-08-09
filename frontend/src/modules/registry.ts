import { Bot, Download, Film, Images, LayoutDashboard, MessagesSquare, Sparkles, Users, Video, Volume2, Heart, Wand2, type LucideIcon } from 'lucide-react';

export type ModulePack = 'core' | 'booster';
export type ModuleArea = 'home' | 'image' | 'video' | 'system' | 'automation';

export type SourceModuleId =
  | 'core-shell'
  | 'z-image-core'
  | 'z-image-advanced'
  | 'sdxl-pack'
  | 'chroma-image'
  | 'firered-image'
  | 'qwen-image'
  | 'wan-video'
  | 'ltx-video'
  | 'minimax-h3'
  | 'flux-klein'
  | 'flux-klein-uncensored'
  | 'krea2-txt2img'
  | 'ideogram';

export interface FeddaModule {
  id: string;
  sourceModuleId: SourceModuleId;
  requiresAnyOf?: SourceModuleId[];
  label: string;
  description: string;
  area: ModuleArea;
  pack: ModulePack;
  tabs: string[];
  workflows?: string[];
  defaultTab: string;

  Icon: LucideIcon;
  /** Feature still being built — surfaces an "Under construction" badge on its card. */
  wip?: boolean;
  /** Hide from the home screen. The feature + its page/code stay; it's just off the home. */
  hidden?: boolean;
  card?: {
    poster?: string;
    video?: string;
  };
}

export const APP_VERSION_LABEL = 'FEDDA Hub v2.0';
export const ACTIVE_TAB_STORAGE_KEY = 'fedda_v21_active_tab';

// Every card is now BUNNY CREW art at /cards/bunny/<module-id>.jpeg, so
// replacing art is a file overwrite and never a change here. The old
// veniceCard() helper is gone with the last module that used it.
//
// Cards are stills. Both renderers (RichHome, SectionCards) still handle a
// `video` field, so adding one to a card re-enables hover playback - left off
// because dozens of cards autoplaying is noisy and costs decode work.

export const FEDDA_MODULES: FeddaModule[] = [
  {
    id: 'image-studio',
    sourceModuleId: 'z-image-core',
    requiresAnyOf: ['z-image-core', 'z-image-advanced', 'sdxl-pack', 'qwen-image', 'chroma-image', 'firered-image', 'flux-klein', 'flux-klein-uncensored', 'ideogram'],
    label: 'Image Studio',
    description: 'Text, reference and LoRA-driven image workflows synced with ComfyUI.',
    area: 'home',
    pack: 'core',
    tabs: ['image'],
    defaultTab: 'image',
    Icon: Sparkles,
    card: { poster: '/cards/bunny/image-studio.jpeg' },
  },
  {
    id: 'video-studio',
    sourceModuleId: 'wan-video',
    requiresAnyOf: ['wan-video', 'ltx-video'],
    label: 'Video Studio',
    description: 'WAN and LTX motion workflows with a consistent workbench layout.',
    area: 'home',
    pack: 'booster',
    tabs: ['video'],
    defaultTab: 'video',
    Icon: Video,
    card: { poster: '/cards/bunny/video-studio.jpeg' },
  },
  {
    // Conversational front-end to the same qwen-rapid-edit workflow: each
    // result becomes the next turn's input, so editing is a chat instead of
    // a series of re-uploads.
    id: 'chat-edit',
    sourceModuleId: 'qwen-image',
    label: 'FEDDA Agent',
    description: 'Stop filling in forms. Describe what you want and the agent runs the workflow, remembers how you like to work, and builds on every result.',
    area: 'home',
    pack: 'booster',

    tabs: ['chat-edit'],
    workflows: ['qwen-rapid-edit-v23'],
    defaultTab: 'chat-edit',
    Icon: MessagesSquare,
    card: { poster: '/cards/bunny/chat-edit.jpeg' },
  },
  {
    id: 'gallery',
    sourceModuleId: 'core-shell',
    label: 'Gallery',
    description: 'One unified place for generated images and videos.',
    area: 'system',
    pack: 'core',
    tabs: ['gallery'],
    defaultTab: 'gallery',
    Icon: Images,
    card: { poster: '/cards/bunny/gallery.jpeg' },
  },
  {
    id: 'lora-character',
    sourceModuleId: 'core-shell',
    label: 'Models & LoRAs',
    description: 'Characters, LoRA installs, and what models every workflow still needs.',
    area: 'system',
    pack: 'core',

    tabs: ['library'],
    defaultTab: 'library',
    Icon: LayoutDashboard,
    card: { poster: '/cards/bunny/lora-character.jpeg' },
  },
  {
    id: 'ollama-models',
    sourceModuleId: 'core-shell',
    label: 'Ollama Models',
    description: 'Download and remove local text and vision models used by FEDDA tools.',
    area: 'system',
    pack: 'core',

    tabs: ['ollama'],
    defaultTab: 'ollama',
    Icon: Bot,
    card: { poster: '/cards/bunny/ollama-models.jpeg' },
  },
  {
    id: 'venice',
    hidden: true,
    sourceModuleId: 'core-shell',
    label: 'Venice.ai',
    description: 'Image generation + Agent chat with web search, vision & tools using your API key.',
    area: 'home',
    pack: 'core',

    tabs: ['venice'],
    defaultTab: 'venice',
    Icon: Sparkles,
    card: { poster: '/cards/bunny/venice.jpeg' },
  },
  {
    id: 'grok',
    hidden: true,
    sourceModuleId: 'core-shell',
    label: 'Grok',
    description: 'Chat with Grok and generate images using your xAI/SuperGrok subscription or API key.',
    area: 'home',
    pack: 'core',

    tabs: ['grok'],
    defaultTab: 'grok',
    Icon: Sparkles,
    card: { poster: '/cards/bunny/grok.jpeg' },
  },
  {
    id: 'zonos-tts',
    sourceModuleId: 'core-shell',
    label: 'Voice Studio',
    description: 'Generate speech from text — fast Edge neural voices or natural Chatterbox with voice cloning. Send clips straight to Audio to Video.',
    area: 'system',
    pack: 'core',

    tabs: ['zonos-tts'],
    defaultTab: 'zonos-tts',
    Icon: Volume2,
    card: { poster: '/cards/bunny/voice-studio.jpeg' },
  },
  {
    id: 'media-downloader',
    hidden: true,
    sourceModuleId: 'core-shell',
    label: 'Media Downloader',
    description: 'Download TikTok, YouTube, Instagram and any yt-dlp URL. Send videos directly to WAN or LTX workflows.',
    area: 'home',
    pack: 'core',
    tabs: ['media-downloader'],
    defaultTab: 'media-downloader',
    Icon: Download,
    card: { poster: '/cards/new/venice/33.jpeg' },
  },
  {
    id: 'transform-reel',
    hidden: true,
    sourceModuleId: 'core-shell',
    label: 'Transform Reel',
    description: 'The viral beat-drop transformation: photo → character version of the same frame → seamless morph video, ready for reels.',
    area: 'automation',
    pack: 'core',
    tabs: ['transform-reel'],
    defaultTab: 'transform-reel',
    Icon: Wand2,
    wip: true,
    card: { poster: '/cards/bunny/transform-reel.jpeg' },
  },
  {
    id: 'reel-machine',
    hidden: true,
    sourceModuleId: 'core-shell',
    label: 'Reel Machine',
    description: 'Photo + sound in, finished viral reel out — outfit switches cut on every beat, or a full transformation morph. Fully automatic.',
    area: 'automation',
    pack: 'core',
    tabs: ['reel-machine'],
    defaultTab: 'reel-machine',
    Icon: Film,
    wip: true,
    card: { poster: '/cards/bunny/reel-machine.jpeg' },
  },
  {
    id: 'scail-studio',
    hidden: true,
    sourceModuleId: 'core-shell',
    label: 'Scail Studio',
    description: 'Make or upload a character, dress her with inpaint, then bring her to motion with SCAIL-2 (motion step coming next).',
    area: 'automation',
    pack: 'core',
    tabs: ['scail-studio'],
    defaultTab: 'scail-studio',
    Icon: Sparkles,
    wip: true,
    card: { poster: '/cards/bunny/scail-studio.jpeg' },
  },
  {
    id: 'companion',
    hidden: true,
    sourceModuleId: 'core-shell',
    label: 'Companion',
    description: 'Your persistent AI friend and partner. Remembers everything with MemPalace, speaks with a natural voice, full intrigue and long-term memory.',
    area: 'system',
    pack: 'core',

    tabs: ['companion'],
    defaultTab: 'companion',
    Icon: Heart,
    card: { poster: '/cards/bunny/companion.jpeg' },
  },
  {
    id: 'z-image-basic',
    sourceModuleId: 'z-image-core',
    label: 'Z-Image Txt2Img',
    description: 'Fast core text-to-image generation.',
    area: 'image',
    pack: 'core',

    tabs: ['z-image', 'z-image-txt2img'],
    workflows: ['z-image'],
    defaultTab: 'z-image-txt2img',
    Icon: Sparkles,
    card: { poster: '/cards/bunny/z-image-basic.jpeg' },
  },
  {
    id: 'z-image-2loras-v2',
    sourceModuleId: 'z-image-advanced',
    label: 'Two People',
    description: 'Two characters, two LoRAs — one drives the image, the other detail-passes its own face.',
    area: 'image',
    pack: 'booster',

    tabs: ['z-image-2loras-v2'],
    workflows: ['z-image-2loras-v2'],
    defaultTab: 'z-image-2loras-v2',
    Icon: Users,
    card: { poster: '/cards/bunny/z-image-2loras-v2.jpeg' },
  },
  {
    id: 'z-image-dual-lora',
    hidden: true,
    sourceModuleId: 'z-image-advanced',
    label: 'Z-Image Dual LoRA',
    description: 'Two-person LoRA image with selected-person refinement.',
    area: 'image',
    pack: 'booster',

    tabs: ['z-image-dual-lora'],
    workflows: ['z-image-dual-lora'],
    defaultTab: 'z-image-dual-lora',
    Icon: Sparkles,
    card: { poster: '/cards/bunny/z-image-dual-lora.jpeg' },
  },
  {
    id: 'chroma1-hd',
    sourceModuleId: 'chroma-image',
    label: 'Chroma1-HD',
    description: 'Official Lodestones Chroma1-HD text-to-image base workflow.',
    area: 'image',
    pack: 'booster',

    tabs: ['chroma', 'chroma-txt2img'],
    workflows: ['chroma1-hd-txt2img'],
    defaultTab: 'chroma-txt2img',
    Icon: Sparkles,
    card: { poster: '/cards/bunny/chroma1-hd.jpeg' },
  },
  {
    id: 'flux2-klein',
    hidden: true,
    sourceModuleId: 'flux-klein',
    label: 'FLUX2-KLEIN',
    description: 'FLUX2-KLEIN 9B image generation.',
    area: 'image',
    pack: 'booster',

    tabs: ['flux', 'flux-txt2img'],
    workflows: ['flux2klein-txt2img'],
    defaultTab: 'flux-txt2img',
    Icon: Sparkles,
    card: { poster: '/cards/bunny/flux2-klein.jpeg' },
  },
  {
    id: 'klein-inpaint',
    sourceModuleId: 'flux-klein',
    label: 'Edit',
    description: 'Uncensored FLUX2-Klein reference edit - describe the change, no mask.',
    area: 'image',
    pack: 'booster',

    tabs: ['klein-inpaint'],
    workflows: ['klein-inpaint'],
    defaultTab: 'klein-inpaint',
    Icon: Sparkles,
    card: { poster: '/cards/bunny/klein-inpaint.jpeg' },
  },
  {
    id: 'flux-headswap',
    sourceModuleId: 'flux-klein',
    label: 'Head Swap',
    description: 'Transplant a head onto another image with FLUX2-KLEIN + bfs-head LoRA.',
    area: 'image',
    pack: 'booster',

    tabs: ['flux-headswap'],
    workflows: ['flux-headswap'],
    defaultTab: 'flux-headswap',
    Icon: Sparkles,
    card: { poster: '/cards/bunny/flux-headswap.jpeg' },
  },
  {
    id: 'flux-klein-uncensored',
    hidden: true,
    // Ships inside the flux-klein pack; there has never been a module of its
    // own, which is why this entry pointed at a source id nothing declared.
    sourceModuleId: 'flux-klein',
    label: 'FLUX KLEIN UNCENSORED',
    description: 'FLUX KLEIN UNCENSORED image generation.',
    area: 'image',
    pack: 'booster',

    tabs: ['flux', 'flux-txt2img'],
    workflows: ['flux2klein-uncensored-txt2img'],
    defaultTab: 'flux-txt2img',
    Icon: Sparkles,
    card: { poster: '/cards/bunny/flux-klein-uncensored.jpeg' },
  },
  {
    id: 'krea2',
    sourceModuleId: 'krea2-txt2img',
    label: 'Krea2 Turbo',
    description: 'Krea2 Turbo text-to-image (fast 8-step, LoRA-ready).',
    area: 'image',
    pack: 'booster',

    tabs: ['krea2-turbo-txt2img'],
    workflows: ['krea2-turbo-txt2img'],
    defaultTab: 'krea2-turbo-txt2img',
    Icon: Sparkles,
    card: { poster: '/cards/bunny/krea2.jpeg' },
  },
  {
    id: 'ideogram',
    hidden: true,
    sourceModuleId: 'ideogram',
    label: 'IDEOGRAM',
    description: 'Ideogram AI image generation with advanced text and style control.',
    area: 'image',
    pack: 'booster',

    tabs: ['ideogram', 'ideogram-txt2img'],
    workflows: ['ideogram-txt2img'],
    defaultTab: 'ideogram-txt2img',
    Icon: Sparkles,
    card: { poster: '/cards/bunny/ideogram.jpeg' },
  },
  {
    id: 'firered-image-edit',
    sourceModuleId: 'firered-image',
    label: 'FireRed Edit',
    description: 'Instruction-based image editing with FireRed 1.1.',
    area: 'image',
    pack: 'booster',

    tabs: ['firered-image-edit'],
    workflows: ['firered-image-edit'],
    defaultTab: 'firered-image-edit',
    Icon: Sparkles,
    card: { poster: '/cards/bunny/firered-image-edit.jpeg' },
  },
  {
    id: 'qwen-image',
    sourceModuleId: 'qwen-image',
    label: 'Qwen Image',
    description: 'Pure text-to-image with Qwen Image (4-step Lightning).',
    area: 'image',
    pack: 'booster',

    tabs: ['qwen', 'qwen-txt2img'],
    workflows: ['qwen-txt2img'],
    defaultTab: 'qwen-txt2img',
    Icon: Sparkles,
    card: { poster: '/cards/bunny/qwen-image.jpeg' },
  },
  {
    id: 'qwen-reference',
    hidden: true,
    sourceModuleId: 'qwen-image',
    label: 'Qwen Reference',
    description: 'Edit or generate from a reference image + prompt.',
    area: 'image',
    pack: 'booster',

    tabs: ['qwen-image-ref'],
    workflows: ['qwen-edit-2509-image-reference'],
    defaultTab: 'qwen-image-ref',
    Icon: Sparkles,
    card: { poster: '/cards/bunny/qwen-reference.jpeg' },
  },
  {
    // Proof that one conversational driver covers every workflow: this runs
    // ltx-flf purely from its workflow_api.json declaration, no bespoke code.
    id: 'chat-ltx-flf',
    // Parked until the conversational driver is good enough to show; the plan
    // is a plain LTX T2V card in this slot instead.
    hidden: true,
    sourceModuleId: 'ltx-video',
    label: 'Chat · LTX First/Last',
    description: 'Run LTX First/Last by talking. The agent asks for each frame, then what should happen.',
    area: 'video',
    pack: 'booster',

    tabs: ['chat-ltx-flf'],
    workflows: ['ltx-flf'],
    defaultTab: 'chat-ltx-flf',
    Icon: MessagesSquare,
    card: { poster: '/cards/bunny/chat-ltx-flf.jpeg' },
  },
  {
    id: 'qwen-rapid-edit-v23',
    sourceModuleId: 'qwen-image',
    label: 'Qwen Rapid Edit',
    description: 'Rapid AIO v23 NSFW image editing.',
    area: 'image',
    pack: 'booster',

    tabs: ['qwen-rapid-edit-v23'],
    workflows: ['qwen-rapid-edit-v23'],
    defaultTab: 'qwen-rapid-edit-v23',
    Icon: Sparkles,
    card: { poster: '/cards/bunny/qwen-rapid-edit-v23.jpeg' },
  },
  {
    id: 'qwen-multi-angle',
    hidden: true,
    sourceModuleId: 'qwen-image',
    label: 'Qwen Multi Angle',
    description: 'Generate angle variants from one input.',
    area: 'image',
    pack: 'booster',

    tabs: ['qwen-multi-angle'],
    workflows: ['qwen-multi-angles', 'qwen-multi-angles-fast'],
    defaultTab: 'qwen-multi-angle',
    Icon: Sparkles,
    card: { poster: '/cards/bunny/qwen-multi-angle.jpeg' },
  },
  {
    id: 'sdxl-inpaint-automask',
    hidden: true,
    sourceModuleId: 'sdxl-pack',
    label: 'SDXL INPAINT AUTOMASK',
    description: 'SDXL inpainting with automatic mask generation for targeted edits.',
    area: 'image',
    pack: 'booster',

    tabs: ['sdxl-inpaint-automask'],
    workflows: ['sdxl-inpaint-automask'],
    defaultTab: 'sdxl-inpaint-automask',
    Icon: Sparkles,
    card: { poster: '/cards/bunny/sdxl-inpaint-automask.jpeg' },
  },
  {
    id: 'facefix',
    hidden: true,
    sourceModuleId: 'sdxl-pack',
    label: 'Face Fixer',
    description: 'Detect and re-detail every face in a photo — group shots and full-body renders.',
    area: 'image',
    pack: 'booster',

    tabs: ['facefix'],
    workflows: ['facefix'],
    defaultTab: 'facefix',
    Icon: Wand2,
    card: { poster: '/cards/bunny/facefix.jpeg' },
  },
  {
    id: 'z-image-inpaint',
    hidden: true,
    sourceModuleId: 'z-image-advanced',
    label: 'Z-Image Inpaint',
    description: 'Auto-mask a face/body/clothes and regenerate it with Z-Image + your character LoRAs.',
    area: 'image',
    pack: 'booster',

    tabs: ['z-image-inpaint-automask'],
    workflows: ['z-image-inpaint-automask'],
    defaultTab: 'z-image-inpaint-automask',
    Icon: Sparkles,
    card: { poster: '/cards/bunny/z-image-inpaint.jpeg' },
  },
  {
    id: 'sdxl-outpaint',
    hidden: true,
    sourceModuleId: 'sdxl-pack',
    label: 'SDXL OUTPAINT',
    description: 'Extend an image outward with SDXL according to a prompt.',
    area: 'image',
    pack: 'booster',

    tabs: ['sdxl-outpaint'],
    workflows: ['sdxl-outpaint'],
    defaultTab: 'sdxl-outpaint',
    Icon: Sparkles,
    card: { poster: '/cards/bunny/sdxl-outpaint.jpeg' },
  },
  {
    id: 'sdxl-controlnet-depth',
    hidden: true,
    sourceModuleId: 'sdxl-pack',
    label: 'SDXL ControlNet Depth',
    description: 'Control the 3D depth and spatial layers of the image using a depth map.',
    area: 'image',
    pack: 'booster',

    tabs: ['sdxl-controlnet-depth'],
    workflows: ['sdxl-controlnet-depth'],
    defaultTab: 'sdxl-controlnet-depth',
    Icon: Sparkles,
    card: { poster: '/cards/bunny/sdxl-controlnet-depth.jpeg' },
  },
  {
    id: 'sdxl-controlnet-openpose',
    hidden: true,
    sourceModuleId: 'sdxl-pack',
    label: 'SDXL ControlNet OpenPose',
    description: 'Control exact character poses using OpenPose skeletons.',
    area: 'image',
    pack: 'booster',

    tabs: ['sdxl-controlnet-openpose'],
    workflows: ['sdxl-controlnet-openpose'],
    defaultTab: 'sdxl-controlnet-openpose',
    Icon: Sparkles,
    card: { poster: '/cards/bunny/sdxl-controlnet-openpose.jpeg' },
  },
  {
    id: 'wan22-img2vid',
    hidden: true,
    sourceModuleId: 'wan-video',
    label: 'WAN 2.2 Img2Vid',
    description: 'Animate a still image with WAN 2.2 — single-shot, dual high/low LoRA slots.',
    area: 'video',
    pack: 'booster',

    tabs: ['wan22xxx-img2vid'],
    workflows: ['wan22xxx-img2vid'],
    defaultTab: 'wan22xxx-img2vid',
    Icon: Video,
    card: { poster: '/cards/bunny/wan22-img2vid.jpeg' },
  },
  {
    id: 'wan22-vid2vid',
    hidden: true,
    sourceModuleId: 'wan-video',
    label: 'WAN 2.2 Vid2Vid',
    description: 'Transform and extend a video clip.',
    area: 'video',
    pack: 'booster',

    tabs: ['wan22-vid2vid'],
    workflows: ['wan22-vid2vid'],
    defaultTab: 'wan22-vid2vid',
    Icon: Video,
    card: { poster: '/cards/bunny/wan22-vid2vid.jpeg' },
  },
  {
    id: 'wan22-story',
    hidden: true,
    sourceModuleId: 'wan-video',
    label: 'WAN Story',
    description: 'Chain 1-24 keyframes into one continuous story video - auto-storyboard, per-transition prompts, stitched automatically.',
    area: 'video',
    pack: 'booster',

    tabs: ['wan22-img2vid-6frames'],
    workflows: ['wan22-img2vid-6frames'],
    defaultTab: 'wan22-img2vid-6frames',
    Icon: Video,
    card: { poster: '/cards/bunny/wan22-story.jpeg' },
  },
  {
    id: 'steady-dancer',
    hidden: true,
    sourceModuleId: 'wan-video',
    label: 'Steady Dancer',
    description: 'Transfer dance motion from reference video.',
    area: 'video',
    pack: 'booster',

    tabs: ['wan21-steady-dancer'],
    workflows: ['wan21-steady-dancer', 'z-image-controlnet-pose'],
    defaultTab: 'wan21-steady-dancer',
    Icon: Video,
    card: { poster: '/cards/bunny/steady-dancer.jpeg' },
  },
  {
    id: 'wan21-scail2',
    hidden: true,
    sourceModuleId: 'wan-video',
    label: 'SCAIL-2',
    description: 'Animate a reference photo with dance/pose motion using SCAIL-2 GGUF.',
    area: 'video',
    pack: 'booster',

    tabs: ['wan21-scail2'],
    workflows: ['wan21-scail2'],
    defaultTab: 'wan21-scail2',
    Icon: Film,
    card: { poster: '/cards/bunny/wan21-scail2.jpeg' },
  },
  {
    id: 'liveportrait',
    hidden: true,
    sourceModuleId: 'wan-video',
    label: 'Live Portrait',
    description: 'Animate a still portrait with the motion and expressions of a driving video.',
    area: 'video',
    pack: 'booster',

    tabs: ['liveportrait'],
    workflows: ['liveportrait'],
    defaultTab: 'liveportrait',
    Icon: Video,
    card: { poster: '/cards/bunny/liveportrait.jpeg' },
  },
  {
    id: 'wan22-vace',
    hidden: true,
    sourceModuleId: 'wan-video',
    label: 'WAN VACE',
    description: 'Full-body motion transfer — animate a reference person with a driving video (pose/depth control).',
    area: 'video',
    pack: 'booster',

    tabs: ['wan22-vace'],
    workflows: ['wan22-vace'],
    defaultTab: 'wan22-vace',
    Icon: Film,
    card: { poster: '/cards/bunny/wan22-vace.jpeg' },
  },
  {
    id: 'minimax-h3-txt2vid',
    sourceModuleId: 'minimax-h3',
    label: 'MiniMax Text2Vid',
    description: 'MiniMax H3 - video and synchronised audio straight from a prompt.',
    area: 'video',
    pack: 'booster',

    tabs: ['minimax-h3-txt2vid'],
    workflows: ['minimax-h3-txt2vid'],
    defaultTab: 'minimax-h3-txt2vid',
    Icon: Film,
    card: { poster: '/cards/bunny/minimax-h3-txt2vid.jpeg' },
  },
  {
    id: 'minimax-h3-img2vid',
    sourceModuleId: 'minimax-h3',
    label: 'MiniMax Img2Vid',
    description: 'MiniMax H3 driven by one or two reference images.',
    area: 'video',
    pack: 'booster',

    tabs: ['minimax-h3-img2vid'],
    workflows: ['minimax-h3-img2vid'],
    defaultTab: 'minimax-h3-img2vid',
    Icon: Film,
    card: { poster: '/cards/bunny/minimax-h3-img2vid.jpeg' },
  },
  {
    id: 'minimax-h3-videdit',
    sourceModuleId: 'minimax-h3',
    label: 'MiniMax Video Edit',
    description: 'Re-drive an existing clip; length and height follow the source.',
    area: 'video',
    pack: 'booster',

    tabs: ['minimax-h3-videdit'],
    workflows: ['minimax-h3-videdit'],
    defaultTab: 'minimax-h3-videdit',
    Icon: Film,
    card: { poster: '/cards/bunny/minimax-h3-videdit.jpeg' },
  },
  {
    id: 'ltx-txt2vid',
    sourceModuleId: 'ltx-video',
    label: 'LTX Text2Vid',
    description: 'Video straight from a prompt - no source image needed.',
    area: 'video',
    pack: 'booster',

    tabs: ['ltx-txt2vid'],
    workflows: ['ltx-txt2vid'],
    defaultTab: 'ltx-txt2vid',
    Icon: Film,
    // No baked card art yet - the label card holds the slot Chat LTX vacated.
    card: {},
  },
  {
    id: 'ltx-img2vid',
    sourceModuleId: 'ltx-video',
    label: 'LTX Img2Vid',
    description: 'Animate one reference image with LTX.',
    area: 'video',
    pack: 'booster',

    tabs: ['ltx', 'ltx-img2vid'],
    workflows: ['ltx-img2vid'],
    defaultTab: 'ltx-img2vid',
    Icon: Film,
    card: { poster: '/cards/bunny/ltx-img2vid.jpeg' },
  },
  {
    id: 'ltx-first-last',
    sourceModuleId: 'ltx-video',
    label: 'LTX First / Last',
    description: 'Interpolate motion between two keyframes.',
    area: 'video',
    pack: 'booster',

    tabs: ['ltx-flf'],
    workflows: ['ltx-flf'],
    defaultTab: 'ltx-flf',
    Icon: Film,
    card: { poster: '/cards/bunny/ltx-first-last.jpeg' },
  },
  {
    id: 'ltx-multi-frame',
    sourceModuleId: 'ltx-video',
    label: 'LTX Multi-Keyframe',
    description: 'Drive a clip through up to 5 keyframes, not just first and last.',
    area: 'video',
    pack: 'booster',

    tabs: ['ltx-flf3'],
    workflows: ['ltx-flf3'],
    defaultTab: 'ltx-flf3',
    Icon: Film,
    card: { poster: '/cards/bunny/ltx-multi-frame.jpeg' },
  },
  {
    id: 'ltx-audio-img2vid',
    sourceModuleId: 'ltx-video',
    label: 'LTX Audio + Image2Video',
    description: 'Animate a reference image driven by an audio clip — motion follows the sound.',
    area: 'video',
    pack: 'booster',

    tabs: ['ltx-ai2v'],
    workflows: ['ltx-ai2v'],
    defaultTab: 'ltx-ai2v',
    Icon: Film,
    card: { poster: '/cards/bunny/ltx-audio-img2vid.jpeg' },
  },

  {
    id: 'lipsync',
    // Was hidden while it was being built. Everything it needs has been in
    // place for a while: both graphs, the page, both tabs and the card art -
    // so hiding it only meant two working lipsync engines nobody could reach.
    // Models download per workflow like every other one.
    sourceModuleId: 'wan-video',
    label: 'Lipsync',
    description: 'Talking-head: drive a portrait mouth from an audio clip (InfiniteTalk, MultiTalk).',
    area: 'video',
    pack: 'booster',
    tabs: ['lipsync-infinitetalk', 'lipsync-multitalk'],
    workflows: ['lipsync-infinitetalk'],
    defaultTab: 'lipsync-infinitetalk',
    Icon: Film,
    card: { poster: '/cards/bunny/lipsync.jpeg' },
  },
];

export const HOME_MODULE_CANDIDATES = FEDDA_MODULES.filter(
  (module) => module.card && (module.area === 'home' || module.area === 'system'),
);
export const IMAGE_MODULE_CANDIDATES = FEDDA_MODULES.filter((module) => module.area === 'image' && module.card);
export const VIDEO_MODULE_CANDIDATES = FEDDA_MODULES.filter((module) => module.area === 'video' && module.card);

