import type { ComponentType } from 'react';
import { ZImageTxt2Img } from './zimage/ZImageTxt2Img';
import { FireRedImageEditPage } from './firered/FireRedImageEditPage';
import { QwenImageReferencePage } from './qwen/QwenImageReferencePage';
import { QwenTxt2Img } from './qwen/QwenTxt2Img';
import { QwenMultiAnglesPage } from './qwen/QwenMultiAnglesPage';
import { QwenRapidEditPage } from './qwen/QwenRapidEditPage';
import { ChatWorkflowPage } from './ChatWorkflowPage';
import { ZImageDualLoraPage } from './zimage/ZImageDualLoraPage';
import { SDXLInpaintAutomask } from './sdxl/SDXLInpaintAutomask';
import { ZImageInpaintAutomask } from './zimage/ZImageInpaintAutomask';
import { FaceFixPage } from './facefix/FaceFixPage';
import { SDXLOutpaint } from './sdxl/SDXLOutpaint';
import { SDXLControlNetDepth } from './sdxl/SDXLControlNetDepth';
import { SDXLControlNetOpenPose } from './sdxl/SDXLControlNetOpenPose';
import { Wan22Vid2Vid } from './wan22/Wan22Vid2Vid';
import { Wan22Img2Vid } from './wan22/Wan22Img2Vid';
import { Wan226FramesPage } from './wan22/Wan226FramesPage';
import { Wan21SteadyDancerPage } from './wan21/Wan21SteadyDancerPage';
import { Wan21Scail2Page } from './wan21/Wan21Scail2Page';
import { LtxImg2VidPage } from './ltx/LtxImg2VidPage';
import { LtxT2VPage } from './ltx/LtxT2VPage';
import { MiniMaxH3Page } from './minimax/MiniMaxH3Page';
import { LtxFlfPage } from './ltx/LtxFlfPage';
import { LtxMultiFramePage } from './ltx/LtxMultiFramePage';
import { FluxHeadSwapPage } from './fluxklein/FluxHeadSwapPage';
import { KleinInpaintPage } from './fluxklein/KleinInpaintPage';
import { HiDreamInpaint } from './hidream/HiDreamInpaint';
import { KleinNsfwV2Page } from './fluxklein/KleinNsfwV2Page';
import { KleinNsfwEditPage } from './fluxklein/KleinNsfwEditPage';
import { Klein9bFaceSwapPage } from './fluxklein/Klein9bFaceSwapPage';
import { FireRedV2Page } from './firered/FireRedV2Page';
import { FluxKleinUncensoredTxt2Img } from './fluxklein/FluxKleinUncensoredTxt2Img';
import { LivePortraitPage } from './liveportrait/LivePortraitPage';
import { Wan22VacePage } from './wan22/Wan22VacePage';
import { LtxAi2vPage } from './ltx/LtxAi2vPage';
import { LipsyncPage } from './tools/LipsyncPage';
import { IdeogramTxt2ImgPage } from './ideogram/IdeogramTxt2ImgPage';
import { HunyuanImg2VidPage } from './hunyuan/HunyuanImg2VidPage';
import { Wan22XxxImg2VidPage } from './wan22/Wan22XxxImg2VidPage';
import { Krea2Txt2Img } from './krea2/Krea2Txt2Img';

export const IMAGE_WORKFLOW_PAGES: Record<string, ComponentType> = {
  'z-image': ZImageTxt2Img,
  'krea2-turbo-txt2img': Krea2Txt2Img,
  'krea2': Krea2Txt2Img,
  'z-image-txt2img': ZImageTxt2Img,
  'z-image-dual-lora': ZImageDualLoraPage,
  'flux-uncensored-txt2img': FluxKleinUncensoredTxt2Img,
  'flux-headswap': FluxHeadSwapPage,
  'klein-inpaint': KleinInpaintPage,
  'hidream-inpaint': HiDreamInpaint,
  'klein-nsfw-v2': KleinNsfwV2Page,
  'klein-nsfw-edit': KleinNsfwEditPage,
  'klein-9b-faceswap': Klein9bFaceSwapPage,
  'firered-v2': FireRedV2Page,
  'firered-image-edit': FireRedImageEditPage,
  'qwen': QwenTxt2Img,
  'qwen-txt2img': QwenTxt2Img,
  'qwen-image-ref': QwenImageReferencePage,
  'qwen-rapid-edit-v23': QwenRapidEditPage,
  'qwen-multi-angle': QwenMultiAnglesPage,
  'sdxl-inpaint-automask': SDXLInpaintAutomask,
  'z-image-inpaint-automask': ZImageInpaintAutomask,
  'facefix': FaceFixPage,
  'sdxl-outpaint': SDXLOutpaint,
  'sdxl-controlnet-depth': SDXLControlNetDepth,
  'sdxl-controlnet-openpose': SDXLControlNetOpenPose,
  'ideogram': IdeogramTxt2ImgPage,
  'ideogram-txt2img': IdeogramTxt2ImgPage,
};

export const VIDEO_WORKFLOW_PAGES: Record<string, ComponentType> = {
  'video': Wan22Vid2Vid,
  'wan22-vid2vid': Wan22Vid2Vid,
  'wan22-img2vid': Wan22Img2Vid,
  'wan22-img2vid-6frames': Wan226FramesPage,
  'wan21-steady-dancer': Wan21SteadyDancerPage,
  'wan21-scail2': Wan21Scail2Page,
  'ltx': LtxImg2VidPage,
  'ltx-txt2vid': LtxT2VPage,
  'minimax-h3-txt2vid': () => <MiniMaxH3Page mode="txt2vid" />,
  'minimax-h3-img2vid': () => <MiniMaxH3Page mode="img2vid" />,
  'minimax-h3-videdit': () => <MiniMaxH3Page mode="videdit" />,
  'ltx-img2vid': LtxImg2VidPage,
  'ltx-flf': LtxFlfPage,
  // Same workflow, conversational entry point alongside the full page.
  'chat-ltx-flf': () => <ChatWorkflowPage workflowId="ltx-flf" />,
  'ltx-flf3': LtxMultiFramePage,
  'liveportrait': LivePortraitPage,
  'wan22-vace': Wan22VacePage,
  'ltx-ai2v': LtxAi2vPage,
  'hunyuan-i2v': HunyuanImg2VidPage,
  'wan22xxx-img2vid': Wan22XxxImg2VidPage,
  'lipsync-infinitetalk': LipsyncPage,
  'lipsync-multitalk': LipsyncPage,
};