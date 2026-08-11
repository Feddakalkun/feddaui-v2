# Interim change log

**Append here after every change.** The user is away roughly 2026-08-11 to
2026-08-14 and will hand this project back to the previous agent on return. This
file is the only thing that carries the intervening work across that handover —
commit messages explain individual changes, this explains the sequence, including
what was tried and abandoned and what could not be verified.

Newest entry at the **bottom**. Do not rewrite earlier entries; if you were wrong
about something, add a correction entry saying so.

## Template

```
## YYYY-MM-DD — short title

**Changed:** files touched, and what now behaves differently.
**Why:** the reason. If the user asked for it, quote the ask.
**Verified:** what you actually ran, and what it printed. "Build passed" is not
verification of behaviour.
**Not verified / left broken:** be explicit. Anything needing a restart, a model
download, or a decision.
**Decided against:** options considered and rejected, with the reason.
```

---

## 2026-08-11 — starting state (written by the outgoing agent)

**Changed:** nothing in this entry; it records the baseline you are starting from.

**State:** `main` at `6e6ba83`, pushed, on both repositories. Working tree clean
except `frontend/public/cards/bunny-clean/`, which is untracked on purpose.

Nine commits landed today (`37e5792..6e6ba83`) — see `HANDOFF.md`
section 2 for the list and the five silent bugs they fixed.

**Verified today, in the running app:**
- prompt builder end to end on the FLUX page: 13 dropdowns → agent → prompt in
  the textarea, 142 words, complete sentence
- sdxl-outpaint after the graph edits: 1168x784 → 1488x784, exactly +320, in 12s
- outpaint agent reads the edge being extended and differs per edge
- chat image-drop: caption in 10s, `set: {}` and `ready: false`
- all 159 WAN 2.2 LoRAs visible to ComfyUI after the search-path change
  (1040 → 1201 loras)
- `scripts/audit_wiring.py`: 0 dangling, 0 not-an-input, 3 known ideogram findings

**Not verified:** `config/prompt_profiles.json`'s six new profiles have never been
measured against the models. `config/prompt_builder.json`'s vocabulary is
reasoned, not tested.

**Open decisions** are listed in `HANDOFF.md` section 4. Do not settle
them unilaterally — the ideogram presets, the bunny-clean folder and the CivitAI
trigger-word fetch are all waiting on the user.

<!-- Append your entries below this line -->

## 2026-08-11 — hidden-module sweep: eight unhidden, one declaration corrected

**Changed:** `frontend/src/modules/registry.ts` only. Removed `hidden: true` from
eight entries — `qwen-reference`, `qwen-multi-angle`, `z-image-inpaint`,
`sdxl-controlnet-openpose`, `wan22-img2vid`, `wan22-vid2vid`, `wan22-story`,
`wan21-scail2` — so their cards appear on the home screen. Changed
`wan22-story`'s declaration from `workflows: ['wan22-img2vid-6frames']` to
`['wan22-flf-segment']`, with a comment explaining that the tab id is historical.

**Why:** the user asked for the nine "graph is fine" hidden modules to be gone
through one at a time. Eight passed; the ninth (`chat-ltx-flf`) is hidden on
purpose and was left alone — its own registry comment says it is parked until the
conversational driver is good enough to show, and `ltx-flf` already has a visible
page via `ltx-first-last`.

**The wan22-story finding, since it is the one that mattered:** the registry said
the module depends on `wan22-img2vid-6frames`, but the page submits
`wan22-flf-segment` (`Wan226FramesPage.tsx:206`) — one story transition per call,
chained by the storyboard. Two different ids, two different graph files. There
was no 403, because `wan-video` happens to own both, so nothing ever surfaced it.
The consequence was silent: `audit_wiring.py` reads the registry's `workflows`,
so every audit run had been validating a graph this module does not use. The
graph it does use was checked by hand and has no missing nodes or models.

**Verified:**
- static pass on all nine, five checks each: which workflow id the page actually
  submits, that a module in `modules.json` owns it (else `/api/generate` answers
  403 "unowned"), that `ModuleService.validate_module` returns ok, that the card
  poster file exists, and that the params the page sends are registered inputs.
  All five owning modules (`qwen-image`, `ltx-video`, `z-image-advanced`,
  `sdxl-pack`, `wan-video`) validate ok=True.
- `shot_count` on `qwen-multi-angle` is sent but not a registered input. Not a
  defect: `workflow_service.py:541` uses it to trim the save nodes.
- `npx vite build` — built in 17.37s, no errors.
- `python scripts/audit_wiring.py` — hidden modules 22 → 14, still the same 3
  known ideogram findings and 0 dangling / 0 not-an-input. The remaining 14 are
  7 shells declaring no workflows, 6 that would fail, and `chat-ltx-flf`.

**Not verified / left broken:** none of the eight pages was actually run. The
checks prove the page targets its own workflow and that the graph would load —
not that the page renders or that a generation completes. If one of these turns
out to be broken on opening, that is the gap. The user chose this over eight test
generations, knowingly.

**Also noticed, not touched:** `config/navigation.ts` is a hand-maintained
sidebar list, not a mirror of the cards — it already lists broken pages
(`sdxl-controlnet-depth`, `wan21-steady-dancer`) and omits `z-image-inpaint-automask`,
which is now the only one of the eight with a card but no sidebar entry. Left
alone because that list is curation, not wiring.

**Decided against:** unhiding `chat-ltx-flf` (deliberate product decision, not a
defect); repairing the `sdxl-controlnet-depth` / `steady-dancer` / `liveportrait`
/ `wan22-vace` graphs (missing `LoadLotusModel`/`LotusSampler`/`ReActorRestoreFace`
are installs, not wiring); and touching the 3 ideogram findings, which are the
user's to settle.

## 2026-08-11 — the prompt agent's rules were never sent to the model

**Changed:** `backend/server.py` (`/api/prompt-agent/turn`) and
`config/prompt_profiles.json`.

**Why:** the user opened Chroma1-HD, typed "a teenage girl" into the prompt agent
and got back "An adolescent girl." — and for "a image of a girls first day at
school", "Her first day nerves." Three-word paraphrases, dropped straight into
the prompt box as if they were prompts.

**The actual defect, which was not what I first said it was.** My first reading
was a contradiction between the `image` rules and the shared video tail. That
contradiction is real, but it was not the cause: `rules` is assembled across
~140 lines and **never joined into the system prompt**. Nothing referenced the
list after building it. Every rule in that endpoint has been inert since it was
written — the image/video/outpaint split, the motion budget, the ban on
follow-up questions, the "never refuse", all of it. What the model actually
received was three sentences: the persona, "There is NO picture in this
conversation", and "Reply with the image prompt itself and nothing else". The
persona's own manner line says "Short lines". Given that and no length, no
shape and no instruction to invent, "An adolescent girl." obeys everything it
was told.

This is the same shape as `sdxl-outpaint` and the FLUX pages: finished work that
was switched off. It is the sixth instance.

**The four changes, in the order they matter:**
1. `system += "\n".join(rules)` — the rules now reach the model.
2. The two clip-only rules ("never describe a still", the seconds budget) are
   gated on `kind not in ("image", "outpaint")`. They were in the shared tail,
   so once the rules went live a still page would have been told to describe a
   still and never to describe a still, in one list. Outpaint would have had it
   worse, having just been told nothing in the picture may move.
3. The image branch states a target: one flowing paragraph, 0.6×`words` to
   `words`, taken from the workflow's profile. Nothing had ever stated a length
   for a still; the video branch has the seconds budget doing that job.
4. New `_agent_profile(workflow_id)` reads `match` + `agent` from
   `prompt_profiles.json`, so the agent finally uses the workflow id it has
   always been handed. Eight profiles carry a steering line now (zimage, chroma,
   flux2-klein, qwen, firered, sdxl, ideogram, sdxl-outpaint). `task` and `add`
   are deliberately NOT reused: they are written for the caption pass and say
   things like "do not invent", which is the opposite of this job.

**Verified:** by monkeypatching `_ollama_chat_text` and printing the composed
system prompt per kind — that is how the dead `rules` list was found, and how
two follow-on defects were caught before commit: `sdxl-outpaint` was inheriting
the generic `sdxl` steering ("lead with the subject") which contradicts every
outpaint rule, and two rules appeared twice because both the branch tails and
the shared tail carried them. Both fixed; recomposed and re-read.

Then live against Ollama, same input as the screenshot, no backend restart
needed because the test imports the module directly:
- `chroma1-hd-txt2img` → 41 words, naming the black band t-shirt, ripped jeans,
  wet ground and tungsten light.
- `flux2klein-txt2img` → 115 words of flowing prose.
Against three and five words before.

**Not verified / left broken:**
- **The backend must be restarted** before the running app sees any of this.
  `prompt_profiles.json` re-reads on mtime, but `server.py` does not reload.
- The length rule steers, it does not bind: Chroma came back at 41 against a
  51–85 target and FLUX at 115 against 54–90. Good enough to fix the symptom,
  not calibrated.
- The eight steering lines are reasoned from the existing caption profiles, not
  measured. Same caveat the six new caption profiles already carry.
- `krea2-*` has no profile at all, so those pages get no steering. Left rather
  than inventing one.
- Only the image and outpaint paths were re-read end to end. The video paths
  gain their rules for the first time too, and nobody has looked at whether a
  WAN or LTX prompt is better or worse for it.

**Decided against:** reusing `task`/`add` for the agent (written for a different
direction, and `zimage`'s "do NOT invent facts not clearly visible" would have
been actively harmful); and deduplicating the rule list programmatically —
the wordings differ slightly, so the redundant lines were removed from the
branch tails instead, leaving the shared tail as the single source.

## 2026-08-11 — Krea2 follows Z-Image in the agent, as it already did in captions

**Changed:** `config/prompt_profiles.json`. Added `"krea2"` to the `zimage`
profile's `match`, and reworded that profile's `agent` line from "Z-Image is
photographic" to "This is a photographic model".

**Why:** the user chose this over giving Krea2 its own profile. The caption path
had already made the same call — `Krea2Txt2Img.tsx:13` passes
`promptContext="zimage"` — but the agent lookup keys on `workflow_id`, not on the
context name, so `krea2-turbo-txt2img-gguf` matched nothing and those pages got
no model-specific steering. The two paths now agree. The rewording follows from
the match: one profile serving two model families should not name one of them.

**Verified:** `_agent_profile()` on `krea2-turbo-txt2img`,
`krea2-turbo-txt2img-gguf`, `z-image` and `chroma1-hd-txt2img` — the three
Z-Image-family ids resolve to the photographic line, Chroma still resolves to its
own. Line endings unchanged (0 LF-only lines).

**Not verified:** whether Z-Image's instruction is actually right for Krea2.
Nobody has measured that; this inherits the caption path's assumption rather than
testing it. If Krea2 turns out to want something different, it needs its own
profile and this match entry comes back out.

**Still needs:** the backend restart from the previous entry. This file re-reads
on mtime, but it is `_agent_profile()` in `server.py` that reads it, and that
function does not exist in the running process yet.
