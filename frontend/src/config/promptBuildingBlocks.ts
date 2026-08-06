import type { SimpleImagePromptPreset } from '../components/workflows/SimpleImageCockpit';

/**
 * Building blocks for writing a text-to-image prompt.
 *
 * The hard part of txt2img is not the subject - everyone can say "a woman in a
 * red dress". It is everything after: the lens, the light, the film stock, the
 * words that decide whether the result looks like a photograph or like AI. That
 * vocabulary is learned, and most people never learn it.
 *
 * So these are deliberately not complete prompts. Each one is a clause you can
 * stack onto whatever you already wrote, grouped by the decision it makes.
 * Chained, they build the kind of prompt someone experienced would type.
 *
 * Shared rather than per-page: the same choices apply to every text-to-image
 * model here, and a copy per page would drift within a week.
 */
export const TXT2IMG_BUILDING_BLOCKS: SimpleImagePromptPreset[] = [
  // ── Shot: the single biggest lever on how a subject reads ──────────────────
  { group: 'Shot', label: 'Close-up', prompt: 'tight close-up portrait, face filling the frame' },
  { group: 'Shot', label: 'Half body', prompt: 'half body shot, waist up' },
  { group: 'Shot', label: 'Full body', prompt: 'full body shot, head to feet in frame' },
  { group: 'Shot', label: 'Wide angle', prompt: 'wide establishing shot on a 24mm lens, the room stretching away behind her' },
  { group: 'Shot', label: 'Three quarter', prompt: 'turned three quarters away, glancing back at the camera' },
  { group: 'Shot', label: 'From below', prompt: 'shot from below looking up, she towers over the camera' },

  // ── Light: what actually separates a photo from a render ──────────────────
  { group: 'Light', label: 'Hard flash', prompt: 'harsh direct on-camera flash, hard shadow thrown on the wall behind her' },
  { group: 'Light', label: 'Golden hour', prompt: 'low golden hour sun, long warm shadows, rim light through her hair' },
  { group: 'Light', label: 'Window light', prompt: 'soft daylight from a large window to one side, gentle falloff' },
  { group: 'Light', label: 'Neon rim', prompt: 'dark room with a strong coloured neon rim light along her edge, deep contrast' },
  { group: 'Light', label: 'Overcast', prompt: 'flat overcast daylight, soft even shadows, no highlights' },
  { group: 'Light', label: 'Candlelit', prompt: 'candlelit from below, warm falloff into darkness, baroque chiaroscuro' },

  // ── Camera: the words that buy photographic realism ───────────────────────
  { group: 'Camera', label: '35mm film', prompt: 'shot on a 35mm lens, 35mm film grain, unretouched' },
  { group: 'Camera', label: 'Medium format', prompt: 'medium format camera, extremely fine detail, shallow depth of field' },
  { group: 'Camera', label: 'Phone snapshot', prompt: 'candid smartphone snapshot, slightly imperfect framing, looks like a real photo someone took' },
  { group: 'Camera', label: 'Shallow focus', prompt: 'shallow depth of field, background falling out of focus, face tack sharp' },
  { group: 'Camera', label: 'Motion blur', prompt: 'slight motion blur, caught mid-movement' },

  // ── Skin: the usual tell, and the usual fix ───────────────────────────────
  { group: 'Skin', label: 'Real skin', prompt: 'realistic skin with visible pores and fine peach fuzz, natural texture, no retouching' },
  { group: 'Skin', label: 'Freckles', prompt: 'light freckles across the nose and cheekbones' },
  { group: 'Skin', label: 'No makeup', prompt: 'no makeup, natural healthy look' },
  { group: 'Skin', label: 'Glossy', prompt: 'glossy lips, dewy highlighted skin, editorial beauty finish' },

  // ── Mood: expression carries more than styling does ───────────────────────
  { group: 'Mood', label: 'Deadpan', prompt: 'deadpan expression, mouth closed, staring level into the camera' },
  { group: 'Mood', label: 'Laughing', prompt: 'caught mid-laugh, eyes creased, entirely unposed' },
  { group: 'Mood', label: 'Bored', prompt: 'bored and faintly amused, one eyebrow raised' },
  { group: 'Mood', label: 'Intense', prompt: 'intense unbroken eye contact, jaw set' },
  { group: 'Mood', label: 'Looking away', prompt: 'looking off out of frame, caught thinking about something else' },

  // ── Colour: sets the whole image before anything else is read ─────────────
  { group: 'Colour', label: 'Saturated', prompt: 'high saturation, bold graphic colour, deep contrast' },
  { group: 'Colour', label: 'Muted', prompt: 'muted desaturated palette, soft contrast' },
  { group: 'Colour', label: 'Warm', prompt: 'warm amber colour grade' },
  { group: 'Colour', label: 'Cool', prompt: 'cool blue-green colour grade' },
  { group: 'Colour', label: 'Colour block', prompt: 'subject cut out against a flat solid colour block background' },
];
