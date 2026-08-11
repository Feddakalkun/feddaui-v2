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

## 2026-08-11 — removed Chroma1-HD and FLUX2-KLEIN txt2img; registered two node packs

**Changed:** deleted `chroma1-hd-txt2img` and `flux2klein-txt2img` outright — the
user's call, chosen over hiding or de-registering. Gone: both `workflow_api.json`
entries, both graph files (`chroma/chroma1-hd-txt2img-api.json`,
`fluxklein/FLUX2-klein-9b-txt2imgv2api.json`), both pages
(`pages/chroma/`, `pages/flux/`, directories removed), both cards, both
`registry.ts` entries, four `workflowPageRegistry` keys, the `chroma-image`
module, the `chroma` prompt profile, the `chroma` member of `PromptContext`, both
`ScailStudioPage` entries, both `ModelOverview` mappings, and the stale
`flux2klein-txt2img9b` entry in `api.ts` that pointed at no workflow at all.

**Why:** "fjerne noen workflows jeg aldri kommer til å bruke" — Chroma is unused,
and FLUX2-KLEIN txt2img never worked for the user, who generates with
`flux2klein-uncensored-txt2img` instead.

**Two follow-on decisions, both taken deliberately:**
- The sidebar slot in `navigation.ts` was repointed from `flux-txt2img` to
  `flux-uncensored-txt2img` rather than deleted — the user said outright that is
  the page they use. `'flux'` was also dropped from `VALID_TABS`; it was a bare
  alias for the page that is now gone.
- The `flux-klein` module's `tabs` listed `flux` and `flux-txt2img` but never
  `flux-uncensored-txt2img`, although it has always owned that workflow. Fixed
  while removing the other two.

**`ComfyUI-Pixaroma` and `ComfyUI-iTools` are now in `nodes.json`.** The user
installed both to finish KLEIN. Pixaroma resolved `klein-inpaint`'s missing
`PixaromaCompare` (audit: 8 missing node classes → 7), and `flux-klein` now
declares it — it never did, which is the same defect that kept `sdxl-outpaint`
from running: the graph needs a pack the manifest does not name, so a fresh
install would not get it. iTools is registered but unused so far: only
`V2/KLEIN-9B-FACESWAP.json` needs it (`iToolsCompareImage`), and that graph is
not registered yet.

**Verified:** `npx vite build` clean in 18.10s. `audit_wiring.py`: still 0
dangling, 0 not-an-input, the same 3 known ideogram findings; missing models
21 → 20; missing node classes 8 → 7. Orphan graphs 24 → 28, which is **not** from
this change — `git status` shows the user added four untracked graph files (three
in `V2/`, plus `firered/firered-v2.json`).

**Not verified:** nothing was opened in the app. The removal is by construction —
every reference found by a full-tree grep was accounted for — but no page was
loaded to confirm the home screen and sidebar look right.

**Left alone, needs a decision:** the four untracked graph files are **not
committed**. Three are `V2/KLEIN-*` and this repository is public; adding graphs
the user has not asked to publish is not mine to decide. They are also
unregistered, so they cannot run yet.

**Two mistakes made and corrected before commit**, recorded because the shapes
recur:
- A brace-matching cut that scanned *forward* for `{` worked for
  `"chroma": {` but not for `"id": "chroma-image"`, where the enclosing brace is
  on an earlier line. It wrote a corrupt `modules.json` before validating.
  Restored from git; array elements now scan backwards, object values forwards.
- `str.replace(old, new, 1)` for the Pixaroma insert hit the *first* module whose
  `custom_nodes` opens with rgthree + Styles_CSV_Loader, which is `z-image-core`,
  not `flux-klein`. Both modules matched the anchor. Fixed by slicing the
  `flux-klein` element first and replacing only inside it. Any anchored edit to
  these config files needs to be scoped to the element, not the file.

## 2026-08-11 — Qwen Multi Angle: the UI now speaks the node's language

**Changed:** `frontend/src/pages/qwen/QwenMultiAnglesPage.tsx` only.

**Why:** the user asked for a good job on the angle selection, pointing at the
node's own widget. Reading `ComfyUI/custom_nodes/ComfyUI-qwenmultiangle/nodes.py`
showed the page and the node disagreed about what the controls mean. The node
converts the three numbers into the phrase it appends to the prompt
(`<sks> front view low-angle shot medium shot`), so a label that disagrees with
its thresholds is a false statement about what is about to be generated.

**What was wrong, all of it silent:**
- Zoom preset **"Wide" (8) produces a close-up.** The node calls anything ≥6 a
  close-up. The label was the opposite of the effect.
- **"Close" (3) and "Medium" (5) were the same shot** — both fall in the node's
  2–6 "medium shot" band. Four zoom presets, two distinct outcomes.
- **`ZOOM_MIN = 3` made "wide shot" unreachable.** The node needs <2 for it, so
  one of its three distances could not be selected at all.
- **"Worm" (−55) was outside the node's range.** It clamps to −30, so Worm and
  Low produced identical output. A dead control.
- The vertical slider allowed −60..60 where the node accepts **−30..60**.
- Six horizontal presets against the node's **eight 45° sectors**; the two that
  could not be expressed were back-left and back-right quarter view — the ones
  the graph's own baked shots (135° and 225°) use.
- Two of the six default shots (`v: 28` and `v: -28`, both `h: 0`) were the same
  camera position at different tilts, on a page whose purpose is different
  positions.

**What it does now:**
- `horizontalPhrase` / `verticalPhrase` / `zoomPhrase` are `nodes.py:133-165`
  transcribed, and `nodePhrase()` composes the exact string the node will emit.
  Each shot card shows that string in mono, so the user reads what the node will
  actually say rather than three numbers.
- Presets are one per bucket the node distinguishes: 8 horizontal, 4 vertical,
  3 zoom. No two presets can mean the same thing any more.
- Ranges are the node's: h 0-360, v −30..60, zoom 0-10.
- Internal representation switched from −180..180 to the node's 0-360, and
  `toWorkflowHorizontalAngle` is gone. Saved shots wrap through `wrapDegrees`,
  so a stored −45 becomes 315 — the same physical angle, no migration needed. A
  stored v below −30 now clamps to −30, which is what the node was doing to it
  anyway.
- Default shots are six distinct sectors.

**Verified:**
- A sweep of every legal value — 361 horizontal, 91 vertical, 101 zoom — through
  both the node's chain (parsed out of `nodes.py`) and the page's (parsed out of
  the TSX): **0 mismatches**, and all 8/4/3 buckets reachable from the page.
  Every preset lands in a distinct bucket; the six defaults in six sectors.
- `npx vite build` clean.
- Opened `localhost:5173/#/tab/qwen-multi-angle` in a browser. Shot 1 renders
  `<sks> front view eye-level shot medium shot` with the overlay reading
  FRONT / EYE / MEDIUM. That check found one wart of my own: default zoom 5 hit
  no preset, so the dropdown read "Custom". Defaults are 4 now, which is the
  preset value for the same bucket.

**Not verified:** no generation was run. The wiring was already sound — the page
sends one value per shot and the audit has always passed on this workflow — so
what changed is which numbers the user can pick and what they are told those
numbers mean, not how they reach ComfyUI.

**Worth knowing:** the three phrase functions must be kept in step with
`nodes.py`. If that node retunes a threshold, every label on this page silently
becomes wrong again. The comment above them says so; the sweep script that
proves it is throwaway, so a future change means re-deriving it.

## 2026-08-11 — registered the four new graphs, and scrubbed them before publishing

**Changed:** `config/workflow_api.json` (+4 entries, 55 → 59), `config/modules.json`
(ownership + the packs these graphs import), `config/nodes.json`, four new pages
under `pages/fluxklein/` and `pages/firered/`, plus `registry.ts`,
`workflowPageRegistry.tsx` and `navigation.ts`. The four graph files themselves
are now tracked.

| Workflow | Module | Page |
|---|---|---|
| `klein-nsfw-v2` | flux-klein | Unfiltered v2 — txt2img |
| `klein-nsfw-edit` | flux-klein | Unfiltered Edit — Klein edit + Z-Image refine |
| `klein-9b-faceswap` | flux-klein | Head Swap 9B — base image + face |
| `firered-v2` | firered-image | FireRed Edit 1.1 — three reference images |

**Why:** the user asked for them to be registered, and confirmed the graph files
should be committed.

**All 41 input mappings were checked against their graphs before anything was
written** — the registration script refuses to write if any maps to a missing
node, a key that is not an input, or an input fed by a link. Three findings came
out of that check rather than out of a later bug report:

- **`klein-nsfw-v2`'s prompt belongs on the PrimitiveStringMultiline (1212), not
  the CLIPTextEncode (1219)**, whose `text` comes from a Text Concatenate. The
  obvious registration would have been inert and the graph would have kept
  generating its baked prompt. Identical to the z-image-inpaint "sunset" bug.
- **`firered-v2` carries two step/CFG pairs behind a switch** — 8 steps at CFG 1
  with the Lightning LoRA, 40 at CFG 4 without, chosen by node 153, which
  defaults to on. The page exposes the LoRA pair as Steps and CFG. The other
  pair is registered but deliberately not shown: a control that only takes
  effect when an invisible switch is flipped is worse than no control.
- **`aspect_ratio` in KLEIN-NSFW-v2 does nothing.** `AspectRatioImageSize` uses
  width and height verbatim when both exceed zero, and the graph sets both to
  1504 — so it renders 1504x1504 while the widget says 16:9. This is the user's
  graph, not the app, so it is reported rather than changed. Width and height
  are the live controls and are what the page exposes.

**Packs:** `comfyui-itools` was entered earlier with folder `ComfyUI-iTools`;
the folder on disk is lowercase. Corrected. `comfyui-various` (JWImageContrast,
used by KLEIN-NSFW-EDIT) was missing entirely. `flux-klein` now declares all
eight packs its graphs import, taken from `object_info`'s `python_module` rather
than guessed. **This matters more than it looked:** the user has since said the
app is being built for distribution, so a wrong folder name or an undeclared
pack is a broken install on every machine that is not this one — the same shape
as the sdxl-outpaint failure.

**Scrubbed before committing**, on the user's instruction never to commit
personal notes or files. Nothing functional was touched:
- three `LoadImage` placeholders naming the user's own pictures (including one
  Topaz-upscaled filename) → `example.png`, which already exists in
  `ComfyUI/input` and is the convention in five shipped graphs
- four stale `rgthree_comparer` preview URLs pointing at temp images from runs
  on this machine
- two `Show Any` nodes holding download reports from a past execution

**Left in, deliberately:** the baked prompts ("nude naked woman sexy model hq
4k", "a cowgirls on a horse…"). They are default content rather than leftovers,
and what a shipped product opens with is a product decision, not a privacy one.
Worth a look before release — they are the first thing a new user would see.

**Verified:** the mapping check above; `npx vite build` clean; `audit_wiring.py`
with no new findings and orphan graphs 28 → 24; and two of the four pages opened
in a browser — FireRed shows its three image slots and Head Swap its base/face
pair, both with "Models ready for this workflow", which also confirms the
backend re-reads `workflow_api.json` without a restart.

**Not verified:** none of the four has been run. The wiring is proven against
the graph, not against a generation.

**Noticed, not fixed:** the already-shipped graphs carry the same kind of
leftovers — `f5b879fe-d055-46fe-84a4-95c35a77c82e.png`,
`VeniceAI_l4UhOC_Z4E67KA.0.jpeg`, `2000PX LATENT UPSCALE_00004_.png` and others
sit in `LoadImage` placeholders where `example.png` or `fedda_placeholder.png` is
the convention. Harmless locally, untidy in something being distributed.

## 2026-08-11 — vendored the two unverifiable node packs; installer text corrected

**Changed:** `vendor/custom_nodes/ComfyUI-Pixaroma/` and
`vendor/custom_nodes/comfyui-itools/` added (26 MB, `__pycache__` and `.pyc`
stripped); their notes in `config/nodes.json` say the url is provenance only;
`installer/FEDDA_v2.0_Installer.bat` line 163 no longer claims the source is
private.

**Why:** neither pack has a `.git` on this machine — both were installed by hand
— so the clone URLs I put in `nodes.json` earlier today could not be verified
against anything. `install.ps1:632` prefers `vendor/custom_nodes/<folder>` over a
clone precisely because "some nodes have no reliable upstream", and two packs
already ship that way. A URL guessed on the user's behalf sitting in the install
path is worse than 26 MB in the repository: it fails only on machines that are
not his, which is the exact shape of the sdxl-outpaint defect.

`install.ps1` looks up the vendor directory by the `folder` field, and both match
(`ComfyUI-Pixaroma`, `comfyui-itools`), so the clone branch is now unreachable
for these two.

**The installer line:** it told the user the wizard would "Download a private
copy of the app source". The repository is public. Now reads "Download the app
source from GitHub". Corrected in `installer/`, which BREADCRUMBS names as the
source of truth.

**Verified:** `nodes.json` parses, 61 packs, CRLF intact; both vendor folders
match their `folder` fields; the installer edit kept all 384 CRLF line endings.

**Two things found while doing it:**
- `installer/FEDDA_v2.0_Installer.bat` and the running copy at
  `H:\Fedda-Hub\290726\FEDDA_v2.0_Installer.bat` differ. Byte-for-byte the
  content is identical — only the line endings differ, repo CRLF and running copy
  LF. Not fixed: the running copy is outside this repository.
- **`scripts/smoke_clean_install.ps1` cannot serve as the release gate it was
  suggested for.** It is a static structure check, not an install: it never
  exercises the clone-or-vendor path, so it cannot tell whether these two packs
  reach a fresh machine. It is also stale — it forbids `frontend/public/cards`,
  which now exists and carries every card in the product, so it would fail the
  current tree for a reason that is not a defect. Proving the vendor path needs a
  real `install.ps1` run into an empty root, which downloads gigabytes and takes
  30-60 minutes. Not run; that is the user's call.

**Not verified:** the vendored copies have not been installed from. They are a
byte copy of what is running on this machine, which is the strongest evidence
available short of a clean install.

**Still held back:** six commits, unpushed. `update.bat` does
`git reset --hard origin/main`, so pushing publishes to every existing install.
Nothing goes out without an explicit go-ahead, each time.
