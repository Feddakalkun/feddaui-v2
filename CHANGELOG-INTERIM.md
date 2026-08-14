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

### Correction to the entry above — the vendored copies are not byte-identical

I wrote that the vendored packs are "a byte copy of what is running". They are
not, quite. `core.autocrlf` is `true` and there is no `.gitattributes`, so text
files are stored LF in the blob and checked out CRLF on Windows. A user's clone
therefore gets CRLF where this machine has LF.

It changes nothing here — checked afterwards: neither pack contains a shell
script, a Makefile or anything else that CRLF breaks, and the two packs vendored
before mine are stored exactly the same way. But the claim as written was wrong,
and the next person should not rely on it.

## 2026-08-11 — the second clone: what it actually is, and its push URL disabled

**Changed:** nothing in the app. `git remote set-url --push origin
DISABLED-old-clone-do-not-push` in `H:\Fedda-Hub\Fedda_hub_v2.0\repo`, at the
user's request. `CLAUDE.md` and `HANDOFF.md` corrected.

**Why:** the user asked what that folder is and whether it could do damage. He
had never been told it existed — which means `HANDOFF.md`'s claim that leaving it
alone was "the user's decision" was attributing a decision to him he never made.
I had repeated that claim without checking it.

**What it actually is:** the repository as it stood before the clean-slate reset.
`git merge-base` between it and `origin/main` returns **nothing** — the histories
are unrelated. Its runs 2026-07-03 ("v2.0 clean baseline") to 2026-07-24; the
current one begins 2026-07-29 ("Fix model downloads end-to-end"). So on about
29 July a fresh history was force-pushed over `main`, and this folder is the tree
from before. "192 ahead, 189 behind" is what git prints for two unrelated trees;
it reads like a diverged branch and is not one.

**The risk, precisely:** a normal `push` is rejected, and `pull` refuses to merge
unrelated histories. Both fail safely. **`push --force` does not.** It would put
the July tree on `origin/main`, and since `update.bat` runs `git reset --hard
origin/main`, every install downgrades three weeks on its next update. One
command, and the push URL and credentials were both in place. That is now closed:
push fails immediately with a message naming the reason, fetch still works.

**Verified:** `git push --dry-run` from that folder fails with "'DISABLED-old-
clone-do-not-push' does not appear to be a git repository". Nothing in the app
references the folder — every hit on `Fedda_hub_v2.0` in the tree is the GitHub
URL, in `update_code.ps1`, `runpod_boot.sh` and the installer.

**Not investigated:** whether those 192 pre-reset commits hold work that never
made it across the reset. The folder also has two untracked files
(`backend/run_zimage_task.py`, `backend/server_backup.py`). Left alone.

## 2026-08-11 — model weights: where they come from and what they are licensed under

**Changed:** nothing. This is a findings entry; the user asked for the licensing
question to be settled.

**How the weights reach a user:** every graph carries `HuggingFaceDownloader`
nodes with `auto_download: true`. Roughly 100 distinct URLs across the workflow
set, all HuggingFace except one GitHub release (GFPGAN). Nothing is bundled —
each install pulls from the original host, so bandwidth is HuggingFace's, not
feddakalkun.com's.

**Finding 1 — the base of the flagship family is non-commercial.**
`black-forest-labs/FLUX.2-klein-9b-fp8` is released under the **FLUX
Non-Commercial License**. Its 4B sibling is Apache 2.0; the 9B is not. That 9B is
the base for `flux2klein-uncensored-txt2img` (the page the user actually
generates with), `klein-inpaint`, `flux-headswap` and the new
`klein-9b-faceswap`. Relevant because a paid installer and subscriber updates are
planned. Not a lawyer, and not a judgement about what is permitted — a fact to
put in front of someone qualified before money is taken.

**Finding 2 — that repo is gated, which is an install-path problem too.**
Access requires accepting the licence agreement on HuggingFace. A new user's
auto-download therefore fails without both an accepted agreement and a token.
This machine works because `config/runtime_settings.json` holds an `hf_token`.
Worth checking whether the downloader surfaces a 401/403 as "accept the licence
here" or as a silent failure — the latter is the same shape as every other defect
in this project.

**Finding 3 — the re-hosted models declare nothing.**
`comfyuistudio/nsfwKLein` has no licence, no model card and no stated base model.
The same account hosts `orins` (the explicit WAN LoRAs), `wan22nsfw`,
`realism-sdxl` and `wan2.1_loras/SECRET_SAUCE_WAN2.1_14B_fp8`. These are the only
weights the project redistributes rather than links to, so they are the ones
whose provenance is the project's own responsibility.

**Finding 4 — credentials are clean.** `config/runtime_settings.json` holds an
`hf_token` and a `civitai_api_key`. It is gitignored, has never been committed,
and `git log --all -S"hf_"` over `config/` returns nothing. Nothing leaked into
the public history.

**Not established:** whether the FLUX licence permits the derivative finetune,
the redistribution of it, or commercial distribution of an app that fetches it.
That is a question for a lawyer, not for me, and I have not tried to answer it.

## 2026-08-11 — Venice.ai moved behind the backend (step 1 of the API work)

**Changed:** new `backend/venice_service.py`; eight endpoints in `server.py`;
`api.ts`, `TopSystemStrip.tsx` and `VenicePage.tsx`; `VeniceChatPage.tsx`
deleted; the `venice` module unhidden.

**Why:** the user asked for a proper Venice API section. Reading the code first
showed it was not built "a bit" — it was built with no backend at all. Both
Venice pages called `https://api.venice.ai/api/v1/*` straight from the browser
with the key in `localStorage['venice_api_key']`. `server.py` had no Venice code;
the only match was a comment.

**Two defects found before writing anything:**
- The `venice` module was `hidden: true` — a finished feature switched off, for
  the ninth time in this project.
- `VeniceChatPage.tsx`, 345 lines, was imported nowhere. Dead code. Deleted.

**What the API actually offers:** rather than scraping the docs I pulled the
OpenAPI spec (`api.venice.ai/doc/api/swagger.yaml`, 564 kB, dated 2026-08-10).
**45 endpoints; the app used three.** The ones that matter here, in order:
`/chat/completions` with vision — which would remove the joycaption workaround
`CLAUDE.md` documents, since a model that reads its prompt makes
`prompt_profiles.json` mean something on the caption path; `/audio/speech`,
`/audio/voices` and `/audio/transcriptions`, which feed the lipsync family
without another local model in VRAM; the async `/video/*` queue; and
`/billing/*` + `/api_keys/rate_limits`, without which a bring-your-own-key
product cannot show a user what they have left.

**The architecture change is the point.** The key now lives in
`runtime_settings.json` beside `hf_token` and `civitai_api_key` (gitignored,
never committed). Everything routes through `venice_service`, which names the
failure — `no_key`, `bad_key`, `no_credit`, `rate_limited`, `timeout`,
`unreachable`, `upstream` — instead of returning one red box for all of them.
Only the endpoints the app uses are wrapped: a blind pass-through would let a
page reach the billing and account mutations.

**Two things that would have broken quietly:**
- **The chat streams.** `stream: true` with `res.body.getReader()`. A proxy that
  buffered the reply to re-serialise it would have turned a live answer into a
  wait. `/api/venice/chat` forwards the SSE bytes untouched, and pulls the first
  chunk *inside* the try so a rejected key surfaces as an error rather than as an
  empty stream.
- **Reasoning models return `content: null`.** Confirmed live: `gemini-3-6-flash`
  streams `reasoning_content` and `content` separately, and with a small
  `max_tokens` the budget goes entirely on reasoning. The page read only
  `delta.content`, so that case rendered an empty bubble — "finished
  successfully, produced nothing" again. It now says what happened.

**Existing users keep their key.** The top bar carries a localStorage key across
to the backend once, silently, then removes it from the browser. Without that,
every installed copy would have needed the key typed in again.

**Verified against live Venice, through the running backend:**
- key status: `configured: true, valid: true`, balance $2.01
- `/api/venice/models?type=image` and `?type=text` return real catalogues
- `/api/venice/styles`: 76 styles
- `/api/venice/rate-limits`: answers
- non-streaming chat: real reply
- streaming chat: `content-type: text/event-stream`, delta keys
  `content, reasoning_content, role, thought_signature`, answer "Hi there, friend!"
- `npx vite build` clean

**Not verified:** the image path was not run — it costs credit and the balance is
$2.01, so that is the user's call. Nothing was checked in the browser UI; the
proxy was exercised directly.

**Next, unstarted:** balance and rate limits in the UI (step 2), then Venice
vision on the caption path (step 3), which is the one that fixes a documented
defect rather than adding a feature.

## 2026-08-11 — Venice step 2: balance and the account's real rate limits in the UI

**Changed:** `TopSystemStrip.tsx` and `VenicePage.tsx`.

**The top bar pill.** It said "Venice Key Set", which answers a question nobody
has — whether a string is stored. A revoked or drained key looked identical to a
working one. It now reads **`Venice $2.01`** when the key works, `Venice Key
Rejected` when Venice refuses it, and `Venice Key Missing` when there is none,
and turns amber below a dollar. The balance was already in the status endpoint,
so this cost one extra field, not a call.

**The model picker.** The page carried a hand-written warning: *"Popular models
can be overloaded — try venice-sd35 or chroma if you see 429 errors."* That was a
guess written once and never checked against the account it runs on. Venice
publishes the real per-model limits — 332 models on this key — so the selected
model now shows its own, e.g. **`paid tier - 20 RPM`**. The old sentence remains
as the fallback for when the limits cannot be fetched.

**Verified in the running app**, through the DOM rather than a screenshot, since
the browser pane would not composite:
- the picker holds **37 live Venice models** (`venice-sd35 | Venice SD35`,
  `krea-2-turbo | Krea 2 Turbo`) instead of the 10 hardcoded ones
- the hint under it reads `paid tier - 20 RPM`
- the top bar pill reads `Venice $2.01`, tooltip "Venice balance $2.01"
- `npx vite build` clean

**Worth recording, because it cost time:** `get_page_text` returned a stale
snapshot twice while the DOM was already correct, which sent me looking for a
bug in code that was working. Querying the DOM directly is what settled it. If a
page looks unchanged after an edit that provably reached the dev server, check
the DOM before doubting the code.

**Not verified:** no image was generated — that spends credit against a $2.01
balance, and it is the user's to spend.

## 2026-08-11 — Venice step 3: vision as a choice, with local staying the default

**Changed:** `venice_service.caption()`; `/api/settings/vision-provider` (GET and
POST) and the provider branch in `/api/ollama/caption`; the captioning control on
`OllamaModelsPage.tsx`.

**Why this one mattered.** `CLAUDE.md` records that joycaption ignores its
prompt, which means `_caption_prompt_for_context` and every profile in
`prompt_profiles.json` are inert whenever it is the selected captioner — the
workarounds in `server.py` (crop the image to steer it, have the text model
rewrite the tag list) exist because of that. A vision model that reads its
instruction is what makes those profiles real. That is a repair, not a feature.

**The user's constraint, and how it is honoured:** *"jeg skal ikke la venice
styre appen."* Local is the default and stays it. Venice is opt-in per install,
the Venice button is disabled until a key exists, and **a Venice failure is
reported as a Venice failure** — 502 naming the error kind and telling the user
how to switch back. A silent fallback to local would hide a paid path that
stopped working and leave the captions quietly changing character.

**Model default: `venice-uncensored-1-2`.** Chosen for three reasons, not one.
Uncensored, because that is precisely why joycaption was picked locally and a
captioner that refuses is useless here. Cheapest of the uncensored vision models
at $0.20/M input. And it does not reason — the reasoning models return
`content: null` with the text in `reasoning_content`, which would hand back an
empty caption. `caption()` raises `empty_answer` naming that case rather than
returning nothing. The picker lists only models whose `supportsVision` is true —
64 of them — so it cannot be set to something that fails on use.

**Verified against live Venice, same image through both paths:**
- local: `user-v4/joycaption-beta:latest` → *"photorealistic digital art of a
  woman in sharp focus wearing a pink fur coat…"* — its own house style
- Venice: `venice-uncensored-1-2 (venice)` → a description that followed the
  instruction it was given
- an earlier direct test asked for "under 60 words, output only the prompt" and
  got 33 words, no preamble, including the text rendered in the image
- the setting flips both ways and was left on `ollama`
- `npx vite build` clean

**Needs a backend restart before the UI works.** The control renders but the
Venice button stays disabled and `/api/settings/vision-provider` answers 404,
because the running process predates the endpoint. `server.py` has no reload.
The in-process tests above used the fresh module, which is why they passed.

**Not verified:** no caption was produced through the browser UI, only through
the endpoint. And nothing measures whether Venice captions produce better
generations than joycaption ones — only that they follow the instruction, which
joycaption demonstrably does not.

## 2026-08-11 — home screen: the bottom row follows the card count

**Changed:** `frontend/src/components/layout/RichHome.tsx`.

**Why:** my own regression. The bottom row was `lg:grid-cols-4` while it holds
however many cards are not hidden. Unhiding the Venice module made it five: the
fifth wrapped to a second row, and because that row carries a height floor and
flexes rather than growing, the two rows drew on top of each other. The user saw
Voice Studio overlapping Gallery.

**Fix:** the column count now follows the number of cards, from a lookup of
literal class strings — Tailwind scans source text and would not emit a class
assembled at runtime. Past six the row wraps, and `auto-rows-fr` makes wrapped
rows share the height instead of overlapping. So the next card added or removed
reflows instead of breaking.

**Verified in the running app** by measuring the DOM: the bottom grid reports 5
children in 5 columns on one row, every card 148px tall; the top grid 2 in 2.
`npx vite build` clean.

## 2026-08-11 — Venice chat: drop and paste images

**Changed:** `frontend/src/pages/VenicePage.tsx`.

**Why:** the user dropped a file from the desktop onto the chat and got its
`file:///C:/Users/...` path as text. The agent then explained at length that it
cannot read local paths — true, and useless, because the bytes were in the drop
event and nothing was reading them.

**What it does now:** one `addImageFiles()` handles every route in — the attach
button, a drop anywhere on the chat panel, or a paste, which is how a screenshot
arrives. Multiple files at once. The panel shows a ring while a drag is over it,
and `dragleave` ignores moves onto child elements, which otherwise made the
highlight flicker.

Two cases worth naming. Dragging an image out of another browser tab hands over a
URL rather than a file, so an `http(s)` drop is attached as a URL. And a
`file://` drop — which a page can never read the bytes behind — now says so
immediately instead of letting the agent discover it three paragraphs into an
answer.

**Verified:** `npx vite build` clean. Not verified: no actual drag was performed
— the browser pane will not composite, so this could not be exercised by hand.

## 2026-08-11 — how much of the Venice API is actually wired

Asked whether everything is pulled in. It is not: **6 of 45 endpoints**, up from
3 before today. In use: `/models`, `/chat/completions`, `/image/generate`,
`/image/styles`, `/billing/balance`, `/api_keys/rate_limits`.

Whole families are untouched, and these are the ones that would matter here:

- **`/audio/*`** (7) — speech, transcription, voices. The app has `zonos-tts` and
  a lipsync family that needs audio from somewhere.
- **`/video/*`** (5) — an async queue with quote/retrieve. The entire video side
  is local and slow on one 3090.
- **`/image/*`** (4 unused) — edit, multi-edit, upscale, background-remove. Local
  equivalents exist; these are cloud fallbacks for when the GPU is busy.
- **`/augment/*`** (3) — web search, scrape, text parsing. Could feed the prompt
  agent real reference material.
- **`/characters/*`** (3) — a character catalogue, against the app's own
  `personas.json` and the empty `companion` module.
- **`/embeddings`** — would let the prompt library and LoRA matching search by
  meaning.
- **`/billing/usage*`** (3) — spend history, which a paid product eventually wants.

Deliberately left alone: `/x402/*` and `/crypto/*` (wallet top-ups and JSON-RPC
proxying — nothing here needs them), `/api_keys` mutations (creating and deleting
keys from inside the app is a capability worth not having), and `/responses`,
which the spec marks Alpha.

## 2026-08-11 — Venice audio: speech that lands where the workflows read it

**Changed:** `venice_service.speech()`, `POST /api/venice/speech`, and Venice as
a third engine in `ZonosTTSPage.tsx` (Voice Studio).

**Why audio first, of the untouched families:** it is the only one that gives the
app something it has no local equivalent for in the place it is needed.
`lipsync-infinitetalk`, `lipsync-multitalk` and `ltx-ai2v` all take an audio
input that is *a filename in ComfyUI's input directory* — so until now the user
had to produce a file elsewhere and put it there by hand before any of the three
could run.

**So the endpoint writes the file there.** That is the point of it: it returns
the filename, and the workflow can use it immediately. Verified — ComfyUI's
`LoadAudio` lists `fedda_tts_dfd3b1f2e81c.wav` in its options after the call.

**Findings from the spec worth recording:**
- `/audio/voices` is **not** a voice list — it is a POST that uploads a sample
  for voice cloning. The voices live in each model's `model_spec.voices`, from
  `/models?type=tts`. 11 TTS models; kokoro alone carries 54 voices, more than
  the rest combined, which is why it is the default.
- `wav` is available on both sides. It is the default here because ComfyUI's
  `LoadAudio` is least likely to need a decoder the install may not have.

**In the UI:** Venice is a third engine beside Edge and Chatterbox, not a
replacement — same principle as vision. Model and voice pickers are filled from
the live catalogue, there is an optional delivery/emotion prompt, and after
generating, the page names the file and says where to use it. Playback is served
straight out of ComfyUI's input directory, so what you hear is byte for byte what
a workflow would load.

**Verified:** generated 294 KB of wav through the running backend with
`tts-kokoro` / `af_bella`; the file exists in ComfyUI's input directory and
appears in `LoadAudio`'s options. `npx vite build` clean.

**Not verified:** nothing was generated through the Voice Studio UI, and no
lipsync run has actually consumed one of these files. The chain is proven up to
the point where ComfyUI can see the audio.

## 2026-08-11 — Venice voice on the pages that consume audio, not just Voice Studio

**Changed:** `LipsyncPage.tsx` and `ltx/LtxAi2vPage.tsx`.

**Why:** the user opened Lipsync and asked, reasonably, why Venice was not in the
voice panel there. It was not, because I had added it to Voice Studio only.

**The underlying problem, which is the more useful finding:** the TTS engine list
is written out separately on **four** pages — `ZonosTTSPage`, `LipsyncPage`,
`LtxAi2vPage` and `GrokPage`. Each has its own engine state, its own picker and
its own call to `/api/chat/tts`. So adding an engine means editing four files,
and missing one is the default outcome rather than an accident. It is the same
shape as the workflow defects this project keeps finding: the capability exists,
and one of the places that should offer it does not.

**Done here:** Lipsync and LTX Audio-to-Video now offer Venice beside Edge and
Chatterbox, with model and voice from the live catalogue. Both skip a step the
local engines need — Venice writes its wav into ComfyUI's input directory itself,
so there is no base64 → File → upload round trip; the returned filename goes
straight into the audio slot.

**Left undone, deliberately:** `GrokPage` still has only the two local engines. It
is a chat page rather than one of the three workflows that need an audio file, so
it was not worth a fourth copy of the same block in the same sitting. Named here
so it is a known gap rather than an oversight.

**Worth doing at some point:** one shared voice-picker component. Four copies is
what made this happen, and the next engine will hit it again.

**Verified:** `npx vite build` clean. Not verified in the browser — neither page
was driven by hand, and no lipsync run has consumed a Venice clip yet.

## 2026-08-11 — correction: adding a third engine leaked the second one's controls

**Changed:** `LipsyncPage.tsx` and `ltx/LtxAi2vPage.tsx`.

**What I broke.** Both pages branched on two engines with a ternary —
`{ttsEngine === 'edge' ? (edge controls) : (chatterbox controls)}` on Lipsync,
and the mirror of it on LtxAi2v. A third value falls into the else branch, so
selecting Venice showed the *other* engine's controls underneath the Venice ones:
the user's screenshot has a cloned-voice picker, EMOTION and PACE sliders and a
"clone from clip" box sitting under a Venice selection, none of which apply.

Both are now two independent `&&` blocks rather than one ternary, so a fourth
engine cannot repeat it.

**Worth noticing:** a two-valued ternary is exactly how a two-option control gets
written, and it silently becomes wrong the moment a third option exists. Same
family as the fixed four-column grid that broke when a fifth card appeared —
both were correct until the count changed, and neither failed loudly.

**Also found:** `tts-inworld-1-5-max` rejects `response_format: "mp3"`. Formats
are per-model, not global. The app sends `wav` everywhere, which that model does
accept, so nothing in the product hits this — but a format picker would need to
read the model's own list.

**Voice samples generated** for the "sweet young female" question rather than
guessing from names: nine candidates saying the same line, in the scratchpad, sent
to the user to choose by ear. No default changed yet.

## 2026-08-11 — default Venice voice: tts-kokoro / bf_lily

**Changed:** `venice_service.TTS_DEFAULT_VOICE`, and the initial voice on all
three pages that offer Venice speech.

**How it was chosen:** the user asked for a sweet young female voice. Rather than
reading names, nine candidates read the same line — six kokoro voices, plus
`LivelyGirl` (minimax) and `Pixie`/`Luna` (inworld), the only models whose voice
names point at a young woman — and the user picked by ear.

**Note for anyone assuming otherwise:** `bf_lily` is kokoro's *British* female
prefix. Copy that says "American voice" or any test expecting a US accent is now
wrong.

**The persisted keys were bumped** (`lipsync_venice_voice` →
`..._v2`, same for ltx_ai2v). The stored `af_sky` was this morning's placeholder
rather than anyone's choice, so leaving it would have meant selecting Lily by
hand on every page already opened. A key bump discards a real preference, so it
is worth doing only while the feature is hours old — which it is.

**Verified:** `/api/venice/speech` with no voice given returns
`voice: bf_lily, model: tts-kokoro`, 132 KB of wav. `npx vite build` clean.

**Also learned:** `tts-inworld-1-5-max` rejects mp3 but accepts wav. Output
formats are per-model. The app sends wav everywhere so nothing hits it, but a
format picker would have to read each model's own list.

## 2026-08-11 — correction: the Power Lora node should have been wired

**Changed:** `loras` registered against node 1275 for `klein-nsfw-edit`, and a
two-slot LoRA picker on `KleinNsfwEditPage`.

**I got this wrong yesterday's-way.** When registering the graph I checked two
existing `type: "loras"` registrations, found `LoraLoaderModelOnly` behind both,
and concluded the input type was written for that class — so I deliberately left
the Power Lora Loader (rgthree) unwired and wrote that reasoning into the page
comment and the changelog.

Two samples, and I generalised from them. `workflow_service.py:208` dispatches on
`class_type` and has a **dedicated rgthree branch** that fills `lora_N` slots.
`sdxl-inpaint-automask` has registered a Power Lora node exactly this way all
along — its label even says so. The user spotted it and named why it was easy to
miss: the node ships with no LoRAs enabled, so it reads as inert.

**Which LoRAs belong there:** node 1275 takes its model from
`z_image_turbo_bf16` and feeds `ModelSamplingAuraFlow` on the refine sampler —
not the Klein edit. So they are **Z-Image** LoRAs. Klein ones would be the wrong
dimensions, the same failure the flux2klein prefix filter exists to prevent.
Labelled "Refine LoRAs (Z-Image)" and matched on `zimage`/`z-image` so the picker
cannot offer the wrong family.

**The other three graphs, checked properly this time:**
- `KLEIN-NSFW-v2` has **no** LoRA node of any kind — nothing to wire without
  editing the graph.
- `KLEIN-9B-FACESWAP` node 24 and `firered-v2` node 151 are `LoraLoaderModelOnly`
  holding the bfs-head and the Lightning speed LoRA. Those are load-bearing parts
  of what the workflow *is*; pointing a user slot at them would swap out the head
  LoRA on a head-swap workflow. Their strength stays exposed, their identity does
  not.

**Verified:** `audit_wiring.py` clean on the new input; `npx vite build` clean.
Not verified: no run has actually injected a LoRA through this node.

**The lesson worth keeping:** two samples are not a survey. The question was
"what does the backend do with this type", and the answer was one grep away in
the code that consumes it — not in two examples of how it happens to be used.

## 2026-08-11 — Venice: images to disk, and the chat survives leaving the page

**Changed:** `_save_venice_images()` and `/api/venice/image` in `server.py`;
`VenicePage.tsx`.

**What was actually happening.** The user asked how chat saving works in the
Venice UI. It did not: `chatMessages` was plain `useState`, with zero
`usePersistentState` on the page — switching to the Image tab and back lost the
conversation, and so did a reload.

The images were worse, because they *looked* saved. `saveToGlobalGallery` wrote
into `localStorage`, and the entire Gallery reads only localStorage
(`loadStoredMedia` scans its keys). So:

- **"Reset UI" destroyed them** while its own confirm text says *"Your models,
  outputs and API keys are NOT touched."* True-ish for ComfyUI images, whose urls
  point at files on disk; false for Venice, which had no disk copy at all.
- **Venice returns base64**, so each picture went into localStorage as a whole
  data url. Sixty per source against a 5–10 MB quota — the write is inside a
  `catch`, so passing the quota lost images with a `console.warn` and nothing
  else.

**Images now go to `ComfyUI/output/venice/`** and the response carries `saved[]`
urls, which is what the page displays and puts in the gallery. A hosted url is
downloaded rather than linked, since a link rots when Venice expires it. The
base64 path survives as the fallback for a failed save, so a picture is shown
rather than lost.

**The chat is saved to the store the app already had** — the same
`chat-edit/sessions` file, tagged `workflow_id: 'venice-chat'` so the two lists
stay apart. One rolling session, restored on mount, saved 800 ms after the last
change. The complaint was losing the thread, not the absence of a session
manager, so there is no new UI.

Two details that would have made it useless: the restore sets a flag before the
save effect is allowed to run, or the greeting would immediately overwrite the
stored thread; and the store titles a chat from the first user message's `text`
while these carry `content`, so the title is now sent explicitly instead of every
Venice thread reading "New chat".

**Verified:** generated a real image — 519 KB written to
`ComfyUI/output/venice/venice_c2f90a66ee2d.png`, `saved[]` url returned. Saved a
Venice chat through the store, listed it, read the messages back, and confirmed
the nine existing chat-edit sessions were untouched; then deleted the test
session. `npx vite build` clean.

**Not verified:** neither path was exercised from the browser UI.

**Left alone, worth naming:** the "Reset UI" confirm text still claims outputs are
untouched. That is now true for Venice images, but the button does still wipe the
gallery *index* for everything, so what you lose is the list rather than the
files. The wording deserves a second look.

## 2026-08-11 — the Venice agent can edit an attached image instead of inventing one

**Changed:** `venice_service.image_edit()` + `EDIT_MODELS`; `/api/venice/image-edit`
and `/api/venice/edit-models`; an `edit_image` tool, its handler and the system
prompt in `VenicePage.tsx`.

**What the user saw:** they dropped a photo and wrote "remove her top keep her
denim jacket". The agent generated an unrelated new picture. The cause is in the
system prompt: it says the agent MUST call `generate_image` whenever asked to
"make or show" anything, and it had no notion of editing at all — `generate_image`
was the only tool.

**I was wrong about where the models live.** I offered to wire the local firered
and qwen workflows, assuming that is what "firered eller qwen" meant. The user
corrected me: **Venice hosts both**. They are not in `/models?type=image` — they
appear only in the `modelId` enum on `/image/edit`, which is why the catalogue
suggested Venice had neither. Twenty edit models are there, including
`firered-image-edit` and `qwen-edit-uncensored`.

**Two things the spec settled that a JSON assumption would have got wrong:**
- `/image/edit` returns **image bytes**, not JSON with base64 like
  `/image/generate`. The first attempt failed with "Venice returned a response
  that is not JSON", which was accurate.
- A refusal is signalled by the **`x-venice-is-content-violation` header**, not by
  a status code. Without checking it, a declined edit arrives as a blurred
  picture with no explanation. It now raises `refused` and says the model itself
  declined.

**Verified end to end, real calls:**
- `qwen-edit-uncensored` and `firered-image-edit` both edited the same test
  image: "change the pink fur coat to black leather, keep everything else
  identical" → leather jacket, bunny ears, magnifying glass, text and background
  all preserved. 1.1 MB and 1.3 MB written to `ComfyUI/output/venice/`.
- Tool selection, which is the part that actually failed for the user:
  `kimi-k2-5` — the model in their screenshot — now calls **edit_image** with
  the instruction, not generate_image.
- `npx vite build` clean.

**Worth knowing:** `venice-uncensored-1-2` declares `supportsFunctionCalling` but
printed the tool call as a JSON code block instead of making one. 96 of 106 text
models declare the capability; declaring it is not the same as doing it. The
picker's six models are curated, and Kimi works — but if a chat ever answers with
raw JSON instead of acting, that is what happened.

**Not verified:** the tool has not been driven from the browser, only proven at
both ends — the model chooses it, and the endpoint behind it works.

## 2026-08-11 — you can now see and choose which model edited the picture

**Changed:** `VenicePage.tsx`.

**Why:** the user asked how to tell whether an edit ran on FireRed or Qwen, and
whether it can be chosen. Neither was possible. The agent named a model in its
tool call or left it out, in which case the backend default
(`qwen-edit-uncensored`) applied — and the result message only mentioned the
model when the agent had written nothing itself, so in the normal case the answer
was invisible.

**Both fixed.** An "Edit model" picker sits beside the chat model, filled from
`/api/venice/edit-models` — eleven models with `firered-image-edit` first. A pick
made there **overrides** whatever the agent asks for: "the agent decided" is not
an answer to "which model edited my picture". And the model actually used is now
appended to every edit reply rather than being a fallback, so it appears whether
or not the agent also wrote something.

**Still `qwen-edit-uncensored` by default** — chosen when nothing was selectable,
on the grounds that it is the permissive one. Now that FireRed is one click away
and the user named it first, that default is worth revisiting; not changed
without asking.

**Verified:** the endpoint lists eleven models with FireRed first; the picker
falls back to the current value while the list loads, so it is never empty.
`npx vite build` clean. Not driven from the browser.
## 2026-08-11 — FireRed is the default edit model

**Changed:** `venice_service.DEFAULT_EDIT_MODEL` → `firered-image-edit`, and the
`edit_image` tool description, which still told the agent that
`qwen-edit-uncensored` was the default and "permissive".

**Why, in the user's words:** FireRed is the general-purpose editor;
`qwen-edit-uncensored` is kept for the narrow case of explicit anatomy that other
models decline or soften. Recorded in the constant's comment, because the next
person will otherwise read the model list as interchangeable and pick by name.

The tool description now tells the agent to leave the model unset unless the user
names one — the app's default, and the picker in the header, decide.

**Verified:** `/api/venice/edit-models` reports `firered-image-edit` as default.
`npx vite build` clean.

**Correction to earlier entries:** I kept saying a backend restart was pending.
The user has restarted many times since; checking the running process rather than
assuming, `/api/settings/vision-provider` and `/api/venice/edit-models` both
answer 200. Only the changes made in the last minutes — this default among them —
are not in the running process yet. Check before repeating that line.

## 2026-08-11 — Venice voice cloning (first of the re-prioritised list)

**Changed:** `venice_service.clone_voice()` + `VOICE_CLONE_MODELS`;
`/api/venice/clone-voice`, `/api/venice/voices`, `DELETE /api/venice/voices/{id}`;
a clone box and a clones group in the voice picker on `ZonosTTSPage`.

**The user reordered the list:** `/video/*` and `/audio/transcriptions` to the
bottom; `/audio/voices`, `/characters/*` and `/embeddings` to the front. This is
the first of the three.

**The detail that shapes the whole design: a cloned handle expires.** Venice
keeps it for seven days — and for `tts-minimax-speech-02-hd` every successful use
resets the window, while `tts-chatterbox-hd` it does not. A stored voice
therefore has a shelf life, and a list that only grew would offer voices that no
longer exist and fail on use with no explanation. So the store prunes on read,
the picker shows **days left** beside each name, and the panel says which model
resets the window.

**Two smaller things that would have broken it:**
- Multipart, not JSON. `Content-Type` has to be left to `requests` — setting it
  by hand drops the boundary and Venice rejects the body.
- A handle only works with the model it was created for, so selecting a clone in
  the picker moves the model with it.

The handle alone is unreadable (`vv_aHR0cHM6...`), so a name, the model and the
creation time are stored beside it in `runtime_settings.json` — gitignored, like
the key.

**Verified, whole round trip:** cloned from an 875 KB sample →
`vv_aHR0cHM6...`, stored as "Testklone" with `days_left: 7.0`, generated 313 KB
of speech **using the handle**, then deleted it. `npx vite build` clean.

**Not verified:** nothing was driven from the browser, and no clone was made from
a real recording of a person — the sample was one of the TTS voices generated
earlier today, which is a fair functional test but not a fair quality one.

**Next in the user's order:** `/characters/*`, then `/embeddings`.

## 2026-08-11 — Venice characters, applied server-side rather than pasted in

**Changed:** `venice_service.characters()`; `/api/venice/characters`; a Character
picker in the Venice chat header, and `character_slug` added to
`venice_parameters`.

**Why this is more than a list.** `/chat/completions` accepts
`venice_parameters.character_slug`, and Venice keeps the character's own
definition server-side. So picking one makes the model answer *as* that
character without the app carrying its text — different from pasting a persona
into the system prompt, and it does not eat the context window.

**Verified that it actually changes who is answering:**

| character_slug | "In one short sentence: who are you?" |
|---|---|
| *(none)* | "I am Venice Uncensored 1.2." |
| `venice-psychologist` | "I am Bella, a compassionate clinical psychologist…" |
| `molly` | "I'm Molly, a confident and rebellious cheerleader…" |

The tools still work while in character, since Venice layers the character over
the request rather than replacing it.

**My first test returned empty for every slug** — on `kimi-k2-5` at 120
max_tokens. That is exactly the reasoning-model `content: null` case fixed in the
chat UI earlier today: the budget went on reasoning and no content was written.
Re-run on a non-reasoning model, the answers above. Worth recording because it
briefly looked like the feature did not work.

**The endpoint is trimmed** to slug, name, description, adult flag, tags and
photo. The raw rows carry stats, timestamps and share urls that a picker has no
use for.

**Note:** the spec marks `/characters` a **preview API** that may change shape.

**Not verified:** the picker was not driven from the browser, and no chat has
been held in character through the UI.

## 2026-08-11 — the prompt library is real: built from what was actually generated

**Changed:** new `backend/prompt_library.py`; `GET /api/prompt-library` and
`POST /api/prompt-library/rebuild`.

**Why the old one had to go rather than be re-run.** The user picked the prompt
library for semantic search, on my suggestion. Checking it first — which I should
have done before suggesting it — showed it was not a library at all:

- **gitignored** (`.gitignore:97`), so it shipped to nobody
- **referenced by no code**, backend or frontend
- **generated 2026-02-28** by scanning three directories that no longer exist
- and it scraped the wrong thing: `positive` held the *docstrings of Python
  generator scripts* — "GOLD STANDARD DUCOVERY … 2loras.json API structure with
  ALL required parameters" — not prompts. 917 of 1339 entries were "general".

Rebuilding it the same way would have reproduced the noise.

**ComfyUI writes the whole API graph into every PNG it saves** — 445 of the 450
images in `output/` carry one. That is the real record: every prompt there
produced an image someone chose to keep, with its own negative, its model and the
workflow that ran it. Nothing is scraped or guessed, and each entry keeps the
image it came from, because a prompt library you cannot look at is a text file.

**Result: 1339 entries of script documentation → 142 real prompts**, 1080 kB →
119 kB. Duplicates collapse with a count, so a head-swap prompt run eight times
is one row that says so.

**One extraction bug found and fixed by measuring rather than eyeballing.** The
first build gave 33 of 143 entries a negative *identical to the positive*.
Following every link back from a conditioning node let an empty negative encoder
wander out through `clip` or `image` and return with the positive text. The walk
now follows only text-bearing inputs, and a negative equal to its positive is
dropped outright. **33 → 0**, with 79 entries keeping a real negative.

**Verified:** rebuild through the endpoint reports 450 images seen, 445 with
metadata, 142 prompts. Search works: `?q=beach` returns the cowgirl-on-a-horse
prompt.

**Not done yet — this is the data, not the feature.** Nothing in the UI reads it.
The next step is a surface: the useful one is where prompts are written, so a
library button on the prompt box that searches and inserts. Semantic search over
it — the original request — comes after that, and only then is worth its cost.

## 2026-08-11 — "Invalid request parameters" in the Venice chat: two causes, one mine

**Changed:** the message serialisation in `VenicePage.tsx`.

**Reported:** the user gets `Invalid request parameters` often in the Venice
chat. Reproduced against the live API rather than guessed, one shape at a time:

| what was sent | Venice |
|---|---|
| text only | OK |
| **assistant message with `image_url` content** | **"Invalid request parameters"** |
| user message with a **relative** image url | "Supplied image did not pass validation checks" |
| empty `content` | OK |

**Cause 1, longstanding.** The mapping applied `msg.images` to *every* role, so
as soon as the agent generated or edited an image, the assistant turn carrying it
went back up as multimodal content. An assistant message cannot hold image parts,
so every following turn in that conversation failed. That is why it happened
"often" rather than once — one generated image poisoned the rest of the chat.

**Cause 2, mine, from today.** Moving generated images to disk made their urls
`/comfy/view?filename=…`. Venice cannot fetch a path on this machine, so any such
url reaching a *user* turn fails validation. Before today they were base64 data
urls, which worked.

**And my chat-persistence change made both worse:** the bad history used to die
on reload, and now it is restored, so the error repeated on every turn until the
chat was cleared.

**Fix:** image parts are sent only on user turns, and only for urls Venice can
read — a `data:` url or an absolute `http(s)` one. Assistant images stay in the
UI, which is all they were ever for.

**Verified:** the shape the page now sends — a user turn with a real attached
image, an assistant turn that generated one, then a follow-up question — comes
back OK, answering "The background color of the image is pink."

**Worth noting for the next test:** my first check of the fix still failed, on a
1×1 pixel PNG I had used as a stand-in. Venice rejects that as an image. The
shape was right; the test image was not.

## 2026-08-11 — the Venice chat gets the window, and the saved chats get a door

**Changed:** layout, header and a sessions sidebar in `VenicePage.tsx`.

**Three complaints, all fair:**

**"For simpelt, utnytt bredden."** The page was `max-w-[1100px]`, the chat inside
it `max-w-4xl` — so on a wide monitor a conversation with an image strip in it
sat in a narrow column with dead space either side. The chat tab now takes
`max-w-[1800px]`; the image tab is a form and stays narrow. The message area
went from a fixed `420px` to `min(70vh, 780px)`.

**"Hvor er characters?"** It was there — squeezed between a wrapping paragraph
and a wrapping button. The 429 note ("If you hit overload, switch models…") was a
full sentence sitting in a flex row, and at the user's window width it wrapped
into a one-word-per-line column that pushed everything else sideways. It is now
the model select's tooltip, which is what it is about, and the right-hand
controls are a group that stays on one line.

**"Hvor er lagrede chatter?"** Saved since this morning, with nothing to open
them from — one rolling session that silently replaced itself. There is now a
sidebar: every Venice chat with its title, message count and date; click to open,
hover to delete, and **New chat** starts a fresh thread rather than wiping the
current one, since the current one is already saved. That was the honest problem
with "Clear Chat": it read like discarding, and now nothing is discarded.

**Verified in the running app** by measuring the DOM: grid `240px 922px`, sidebar
present and reporting **"Saved chats (2)"** with a real title from the user's own
testing, message pane 504px, and Character and Edit model both in the header
without wrapping. `npx vite build` clean.

**One self-inflicted build break on the way:** the explanatory comment was
written as `{/* … */}` immediately inside `return (`, which makes two root
children — "Expected ) but found className". Moved above the return as a plain
comment.

**Not done:** the sidebar is `hidden lg:flex`, so below 1024px the saved chats
have no surface at all. Fine for a desktop app on a 3090, worth knowing.

## 2026-08-11 — agent memory: extraction that is allowed to fire

**Changed:** new `backend/agent_memory.py`; `GET /api/agent-memory`,
`POST /api/agent-memory/extract`, `DELETE /api/agent-memory/{id}`.

**Why there was one memory after months.** The user asked how far the agent's
memory could go — it had stored exactly one thing about him. The cause was not
the model. Memory existed on **one** surface, the image-edit agent, and its
instruction said, in as many words:

> "Only for a LASTING preference … never for one-off requests … **Almost every
> turn is null.**"

It did precisely as told. The schema also allowed a single string per turn, so
even a willing model could offer one fact at a time. The cap was 30 and never
came near binding.

**What replaces it.** Extraction now reads a **whole conversation** rather than a
turn, may return several items, and sorts them into four kinds — preference,
fact, entity, episode — because "prefers cool rim light" and "his character is
Saira, leader of The Strategyc" are not recalled the same way. Pinned to
`mistral-nemo:12b` (installed, 7.1 GB, and its context is 1,024,000 tokens, so
the window was never the constraint either).

**It runs over stored sessions, not live turns, and that is the point.** A 12B
model occupies ~7 GB; the app sets `keep_alive: 0` because ComfyUI wants the
card. Paying that load per message to learn nothing most of the time is the worst
trade available. The sweep holds the model open across the batch and releases it
on the last session: **11 conversations in 52 seconds, one load**.

**Result: 1 → 17 memories**, then 15 after merging near-duplicates. Real ones
include "The user is Norwegian", "prefers visible pores and natural skin texture"
(seen twice) and "prefers realistic images over stylized" (seen three times).

**The defect the first run exposed, and how far the fix goes.** Exact-text dedupe
let rewordings through: *"prefers visible pores and natural skin texture in
images"* and *"prefers images with visible pores and natural skin texture"* were
stored as two memories. Added a Jaccard match over content words with stopwords
stripped, which merged them and folded the repeats into a `seen` count. It does
**not** catch everything — two denim-jacket episodes differ by "modify an image
by removing" versus "the AI to remove", which scores 0.6 against a 0.7 threshold.
Lowering the threshold would overfit fifteen examples. Semantic dedupe is the
honest fix, and `/embeddings` is already the next item on the user's list.

**Honest about the rest of the output:**
- Several "episodes" are one-off requests with little recall value — the thing
  the old prompt was over-correcting against. Worth a relevance pass later.
- Categories slip: "The user asked for an image of Hello Kitty" is filed `fact`.
- It stored two **local desktop filenames**. Factually correct, useless as
  memory, and worth a rule before this ships to anyone.

**Where the other 35 come from.** Eleven sessions totalling 2,946 characters is
thin material — the ceiling here is the corpus, not the extractor. The app
already holds far more: the prompt library (142 prompts with repeat counts and
dates), the Venice chats, and the workflow runs. Those are the next inputs.

**Verified:** the old single memory was migrated rather than dropped; the sweep
read 11 sessions and added 16; the store reports 15 after merge with counts per
kind. Nothing is in the UI yet.

## 2026-08-11 — the chat generates with the model you picked

**Changed:** `VenicePage.tsx` — the agent's `generate_image` branch, and an
Image model picker in the chat header.

**The report:** "Venice does not use the model I select in chat, and I only get a
choice of edit models, not chroma and the others."

**Half of it was a misreading on my part, checked before fixing.** The *text*
model is honoured: asking for `venice-uncensored-1-2` returns
`venice-uncensored-1-2`, asking for `qwen3-6-27b` returns that, and setting a
character does not override it. So the select in the header does work — it is
just the text model, which is a different thing from the model that draws.

**The other half was real.** The agent's image tool read
`args.model || 'flux-2-pro'` — hardcoded. The 37 live models on the Image tab,
Chroma among them, never applied to anything generated in chat, and there was no
picker for them there. Both halves of the complaint come from that one line.

**Fix:** the chat generates with `imgModel`, the same state the Image tab uses,
and there is now an Image model picker in the chat header beside Character and
Edit model. One choice shared by both tabs rather than two that disagree.

**Verified in the running app:** the header now carries three pickers —
**Image model (37 options, currently `chroma`)**, Character (81), Edit model
(11). `npx vite build` clean.

## 2026-08-11 — semantic dedupe for memory, and the case where it must not be used

**Changed:** `agent_memory.py` — a local embedder, cosine dedupe, and an
exemption for derived rows.

**Model choice: `nomic-embed-text`, local, 274 MB.** Venice has an embeddings
endpoint, but a memory that stops working when an API balance runs out is not a
memory — the same principle the vision provider was built on. Embedding fails
soft: no vectors means the word-overlap check still runs, and a write is never
blocked by an embedder being down.

**It caught the pair I could not.** "asked to modify an image by removing a
character's top" against "asked the AI to remove a character's top" scores
**0.871** — the pair that word overlap put at 0.6 against a 0.7 threshold.

**And it found a case where it must not be used.** In the same pass, two
*different* prompts scored **0.868**: "generated this 43 times: a pretty young
woman with big floppy rabbit ears" and "generated this 12 times: a beautiful
young woman who is half rabbit". Three thousandths apart from a true duplicate.
No threshold separates those, so picking one would have been fitting the noise.

The reason is structural: every library-derived memory shares the template
"The user has generated this N times: …", and the template dominates the vector.
Those rows already carry their own identity — the prompt they came from — so they
are now exact-match only. Resemblance is the wrong question for a row that knows
what it is.

**Verified:** vectors backfilled for all 26 stored memories (768 dimensions, 71s
for the batch); the true duplicate merged, the two rabbit prompts survived as
distinct entries; **25 memories** across four kinds.

**Cost noted:** the store is now ~1 MB for 25 memories, because a 768-float
vector is far larger than the sentence it describes. At a few hundred memories
that is still fine; past that the vectors want their own file.

## 2026-08-11 — the prompt library gets a surface

**Changed:** new `PromptLibraryPicker.tsx` and a Library button in
`PromptAssistant`; new `GET /api/prompt-library/thumb`; `.gitignore` for the
thumbnail cache and the memory store.

**Where it lives:** on the prompt box, because that is where a prompt is wanted.
`PromptAssistant` is shared by a dozen pages, so one button reaches all of them.
The full variant of that component deliberately has **no** buttons — a previous
pass removed Enhance and "Prompt from image" with the note that "three buttons
for one job is what made this section unreadable" — so this adds exactly one, for
the one job nothing else there does: hand back a prompt that already worked. The
agent beside the box writes new ones; it cannot return an old one.

**Shown as thumbnails, not sentences,** because what anyone remembers about a
prompt is the picture it made. Each card carries the prompt, the model, and a
`×N` badge for how many times it was run — picking one fills both the positive
and the negative it originally ran with.

**The thumbnails needed a backend endpoint, and finding out why took two goes.**
The grid showed 120 cards and not one image. First guess: the originals are
full-resolution — the first measured **8.5 MB**, so 120 of them is a gigabyte.
Switching to ComfyUI's `preview=webp;70` brought that to 260 kB and still nothing
appeared. Forcing one to load eagerly showed why: `preview` re-encodes but does
**not resize**, so each was still **3840x2560** — a gigabyte of decoded bitmap
rather than a gigabyte of transfer.

`/api/prompt-library/thumb` now writes a 360px JPEG and caches it on disk:
**18 kB**, 0.27s cold, instant warm, and path traversal is refused
(`../../config/runtime_settings.json` → 400).

**One measurement artefact worth recording:** with the browser pane hidden, the
page does not composite, so `loading="lazy"` images never enter a viewport and
never load. `loaded: 0` looked like a bug and was not. An eager `new Image()`
probe is what told the two apart.

**Verified:** picker opens from the prompt box, 120 cards, `×8`/`×7`/`×4` badges
present, footer reporting the build time; thumbnail endpoint measured cold and
warm; traversal blocked. `npx vite build` clean.

**Not verified:** no prompt has been picked and generated from through the UI.

## 2026-08-11 — the memory is now used, which was the whole point

**Changed:** `agent_memory.recall()` and `as_prompt_block()`; `_memory_block()`
in `server.py`, wired into the image-edit agent and the prompt agent.

**Selection, not injection.** The old code put the whole memory list in the
prompt — fine at one entry, wrong at 200. Two kinds of relevance, treated
differently:

- **standing preferences** apply whatever is being asked, so any preference seen
  more than once is always included. They are instructions, not trivia.
- **everything else** is ranked by cosine against what the user just said, with a
  0.45 floor. Below that the match is noise, and filling a prompt with unrelated
  facts is how a memory system starts making an agent *worse*.

Selection is in now, while the list is still small enough to read and check. A
memory system that only works while it is small is not one.

**It discriminates, which is the part worth proving:**

| message | memories selected |
|---|---|
| "make her hair blue" | 8 — the standing preference plus portrait prompts |
| "generate the rabbit ear girl again" | 12 — **the ×43 rabbit prompt surfaces** |
| "how do I export a video" | **2** — standing preferences only, nothing dragged in |

The third row is the one that matters. An unrelated question pulls in nothing
unrelated.

**Verified in the real prompt:** capturing the prompt agent's system instruction
shows the block present, with the ×43 prompt in it, under a line telling the
model to use it and never recite it back. That is the "you wanna generate that
again?" case — the agent can now see that a prompt was run forty-three times.

**Fails soft on purpose.** `_memory_block` returns an empty string on any error:
a turn that fails because it could not remember is worse than one that simply
does not remember.

**Still imperfect:** "The user asked for an image of Hello Kitty" scored above
the floor for a rabbit query. One weak match in twelve is tolerable; a relevance
pass over the extracted episodes would fix the cause, which is that several of
them should never have been stored as memories.

## 2026-08-11 — installer: portable Git/Node, quick launch, uv — folded in, not swapped

**Changed:** `installer/FEDDA_v2.0_Installer.bat` and `scripts/install.ps1`.

**Where this came from.** The user had rewritten both files in `290726\v2\` and
reported they worked. Two of the ideas were genuinely better than what shipped;
the rewrite as a whole would have been a serious regression, and the reason it
looked fine is worth recording.

**The rewritten `install.ps1` never ran.** Line 8 reads
`$AppDir = Set-Location "$ScriptDir\.." ; Get-Location`. `Set-Location` emits
nothing, so `$AppDir` is `$null`, and the next line's `Join-Path $AppDir …`
throws "Cannot bind argument to parameter 'Path' because it is null" — fatal
under the script's own `$ErrorActionPreference = "Stop"`. Confirmed in
PowerShell. It dies on line 9 of 116.

It appeared to work because the `.bat` runs `scripts\install.ps1` **from inside
the freshly cloned app** — the repository's 922-line installer, not the 116-line
rewrite sitting in `v2\`.

**What the 116-line version would have dropped**, had it been in place: cloning
ComfyUI at all; installing node packs from `nodes.json` (including the Pixaroma
and iTools entries added today); per-GPU CUDA wheels — it hardcodes cu121, while
`install.ps1:518` selects cu128 for RTX 50-series because "cu124 has no kernels
for it"; and it looks for `custom_nodes` and `requirements.txt` at the app root,
where neither exists.

**And the `.bat` rewrite dropped the disclaimer** — adults only, responsibility,
no real people without consent, nothing involving minors, third-party licences.
For a distributed app shipping uncensored checkpoints that is the one screen that
cannot go.

**What was folded in instead:**
- **Quick launch.** An installed copy runs the app and exits. Gated on
  `ComfyUI\main.py` rather than `node_modules`: the frontend can exist while the
  half that generates images does not.
- **Portable Git and Node.** The old requirements screen offered a winget
  install and **exited** if winget was absent — a developer toolchain required
  before a first picture. Missing tools are now downloaded into
  `portable-files\`, and nothing is installed into Windows. The dead winget
  prompt was removed rather than left to read as if it still applied.
- Kept: the disclaimer verbatim, `call scripts\install.bat` (which passes
  `-Unattended`), the install log and `log.md`, and all four generated shortcuts.
  The rewrite generated only `run.bat`, which together with quick launch would
  have left an installed user **no way to update at all**.

**uv, with the flag problem the plan would have hit.** The proposal was to route
`Venv-Pip` through `uv pip install` unchanged. Downloaded uv 0.12.3 and checked:
it **rejects** `--no-warn-script-location`, which the helper appends to *every*
call, and `--prefer-binary`, which insightface and llama-cpp-python use —
`error: unexpected argument`, not a warning. All twelve call sites would have
failed. Both are safe to drop for uv: the first only silences a pip warning, and
uv prefers wheels by default. `Venv-Pip` now strips them, and **falls back to pip
for any command uv cannot complete**, so a resolver difference costs time rather
than the install. uv itself is optional — if the download fails, everything
proceeds exactly as before.

**Verified:** `install.ps1` parses; the flag rewrite checked against the real
call sites; the `.bat` is still CRLF, every `goto` has a label, the disclaimer and
all four shortcut generators are present.

**Not verified:** no clean install was run. The portable-Git path in particular
has never been executed — this machine has both tools, so that branch is unvisited.

**Left alone:** the running copy at `H:\Fedda-Hub\290726\FEDDA_v2.0_Installer.bat`
is now older than the repository's. Copying it over is the user's call.

## 2026-08-11 — the disclaimer is a gate now, not a screen

**Changed:** `installer/FEDDA_v2.0_Installer.bat` (and the running copy).

**Found by accident during a clean-install test.** A probe with no stdin ran the
whole front-of-house — welcome, requirements, **disclaimer**, info — without
stopping, and started installing. `pause` returns immediately when stdin is
empty: piped, redirected, run from a script or a service. So the notice that
covers adults-only, consent and content involving minors could scroll past
entirely unread, and did.

**Fix:** the disclaimer now requires typing `I AGREE`. With no stdin the variable
stays empty and the installer **refuses** — which is the correct answer, because
terms nobody read have not been accepted. Anything else re-prompts once and then
declines. There is deliberately no environment variable to bypass it; that would
rebuild the hole.

The other three screens still use `pause`. They are informational, and skipping
them costs nothing.

**Verified**, the gate driven through every case in isolation:

| input | result |
|---|---|
| empty stdin | DECLINED |
| `I AGREE` | AGREED |
| `i agree` | AGREED |
| `N` | DECLINED |
| anything else | re-prompt, then DECLINED |

And end to end: running the real installer with `< nul` prints "The terms were
not accepted, so nothing has been installed" and exits 1, with nothing written.

**Note for anyone scripting this:** the accept path cannot be driven through a
pipe at all, because the `pause` screens ahead of it consume the piped input
before `set /p` is reached. That is a consequence rather than a design, but it is
the right one — consent through a pipe is not consent.

## 2026-08-11 — clean-install test: the portable branch works

Run from `H:\Fedda-Hub\compare` with Git and Node hidden from PATH for that
session only (`test-without-git-node.bat`, which filters PATH in PowerShell —
the same loop written in cmd silently matched nothing and hid node but not git,
which is the worst kind of test: one that looks real).

**The branch that had never been executed, executed:**
- `portable-files/git/cmd/git.exe` downloaded and extracted
- `portable-files/node/node.exe` likewise
- the repository **cloned using the portable git**, HEAD at `921e774`
- `logs/install.log` written
- and it got further: `python_embeded/`, `ComfyUI/` and **`uv.exe`** all present

So portable Git, portable Node, the embedded Python fetch, the ComfyUI clone and
the uv download all work on a machine that has neither tool on PATH.

**Not verified:** the run was killed during the inner install, so the twelve
`Venv-Pip` calls through uv were started but not finished, and whether Pixaroma
and iTools install from the vendored copies rather than cloning is still unknown.
The test folder is cleaned and ready for a full run.

---

## 2026-08-12/13 — stand-in session: the installer, the update, and a ceiling

Written by the agent covering while the main one was at its limit. Everything
below is committed and pushed; `main` ends at `29e9f07`.

### The shape almost everything took

Eight separate defects this session, and most were one shape: **something failed
or was already finished, and said nothing about it.** Worth carrying forward as a
first suspicion, because it was right nearly every time.

- the launcher captured ComfyUI's startup to a log and then skipped it, so a
  crash showed as silence (`Get-Content -Wait -Tail 0` attached *after* a 120s
  wait)
- the installer's closing screen printed "ALL DONE - FEDDA is installed"
  regardless of the inner exit code
- `install.ps1`'s pinned-dependency sync called `$PyExe`, which is defined
  nowhere in that file - both calls threw, so it had **never once run** while
  printing "ComfyUI pins synced OK" every time
- `npm install` announced "Frontend dependencies installed" whatever npm returned
- the media downloader was complete, routed, backed by a working endpoint, and
  `hidden: true`
- `_memory_block` was wired into `chat_edit_turn`, the endpoint of the Qwen-only
  page that `ChatWorkflowPage` replaced, so 25 stored facts never reached the
  agent people actually use

### The installer is a bootstrapper now, on purpose

The user's point, and it is the right frame: the `.bat` is a standalone download
that `update.bat` cannot reach and `git pull` never touches. Every copy on a disk
is frozen at the moment it was fetched. So only what must happen *before the repo
exists* belongs in it - fetching git and node, cloning, and refusing to launch an
install that did not finish. Everything else goes in `scripts/`.

What it does now: a preflight of eight checks before the first byte is
downloaded, Enter/N consent, a quick-launch gate that requires
`Smoke Test: PASSED` in `logs/install_report.txt`, explained repair screens for
both "self-test failed" and "never finished" (each asks first, and cancelling
leaves the disk untouched), and a version check against
`installer/installer_rev.txt` on `main`.

**`INSTALLER_REV` and `installer_rev.txt` must move together.** Bump one without
the other and the installer lies in one direction or the other.

The preflight is plain text. An ANSI version came first and had to be thrown
away: the ESC captured via `prompt $E` expanded inside ordinary words and printed
"Everything" as garbage.

### The release asset was four days and six fixes stale

`feddakalkun.com` serves a GitHub release asset. It was still the 8 August build:
13,432 bytes, no quick-launch, no portable git/node - it **required Git and
Node.js already installed** and offered `winget`. Nine people had downloaded it.
Replaced with `gh release upload v2.0 ... --clobber` and verified byte-identical
against the local file.

That also corrected a wrong claim made earlier in the session: the tester who
lost an evening was *not* stranded by the quick-launch gate, because the build he
had did not contain one.

### The update destroyed three commits, and now refuses to

`update_code.ps1` did `git reset --hard origin/main`. Correct for an install -
they never commit - and wrong here: it erased three commits made minutes earlier
and printed "Code updated successfully". The reflog had them; that is luck.

It now counts `origin/main..HEAD` and stops with the list when it is non-zero. On
a user's machine the answer is always zero.

### cu124 is the real ceiling, and it arrived on its own

The long one. Full detail is in `CLAUDE.md` under "The ComfyUI version is three
different things"; the short version:

- a fresh install pins ComfyUI `a2840e75` = **v0.18.1, dated April**
- `update_logic.ps1` then resets ComfyUI to `origin/master`, so the first update
  discards the pin - two users on the same FEDDA can be a dozen versions apart
- ComfyUI ≥0.32.0 **cannot run on torch 2.6.0**, and 2.6.0 is the newest the
  cu124 channel has (cu126 has 2.13.0, cu128 has 2.11.0)
- `install.ps1` already sends RTX 50-series to cu128, so a 5090 install is fine
  and a 3090 is not

This stopped being theoretical mid-session: an update pulled ComfyUI to master
and left the app dead. Neither comfy-kitchen version carries it - `0.2.31`
(master's pin) fails `import comfy.utils` on `list[int]`, and `0.2.26` lacks
`int8_attention_is_available`, which master's attention module calls. Rolling the
pin back moved the failure instead of removing it.

**The machine is deliberately held at ComfyUI `v0.30.0-1-g14b05228`.** Two guards
now keep it there: the pin sync and the ComfyUI update each record what they are
about to replace, import `comfy.model_base, comfy.ldm.modules.attention`
afterwards, and roll back if that fails.

That import matters. The first guard checked `comfy.utils`, which **passed while
the app was broken** - the failing call lives in `attention.py` and `utils` never
reaches it.

### The update also broke Florence2, via transformers

`update_logic.ps1` had a floor (`>= 4.45`, for Florence2) and no ceiling, so an
unbounded `--upgrade` answered it with **transformers 5.14.1**. Florence2 ships
its own model code and its own `_beam_search` written against the 4.x generation
API; on 5.x it indexed out of range and raised a **CUDA device-side assert**.

That poisons the CUDA context, so every later CUDA call in the process fails -
including `system_stats`, which is what actually filled the console. One cause,
printed everywhere except where it happened. Now capped `>=4.45,<5`; the machine
is on 4.57.6. Nothing here declares an upper bound and the highest floor asked
for is 4.57.1, so newest-4.x satisfies everyone.

### LTX-2.5: parked, with the reasons written down

Needs ComfyUI 0.32.0, so it is behind everything above. The weights are seven
files in the gated `Lightricks/LTX-2.5` repo (list in `CLAUDE.md`); FEDDA already
stores an `hf_token`, which is what a gated repo needs. The standalone package in
`H:\Fedda-Hub\LTX2_5` contains **no ComfyUI nodes** - it clones Lightricks' own
inference package and drives `ltx_pipelines.distilled` as a CLI.

Useful regardless: **frames must be 8k+1**, dimensions step by 64, 24 fps.

### Features added

- **`Tour`** (`components/ui/Tour.tsx`) - the first walkthrough, built to be
  reused. Steps anchor on a `data-tour` attribute rather than a class or DOM
  path, so restyling cannot silently break one, and a step whose anchor is
  missing still shows, centred. `WorkflowSection` takes a `dataTour` prop. Reel
  Machine has the first five-step tour and a "How it works" replay button.
- **Voice cloning from a video URL** - `/api/tts/voices/from-url`. Audio only, a
  start/end trim, saved as a named Chatterbox voice. No `FFmpegExtractAudio`
  postprocessor: it wants a directory holding both `ffmpeg.exe` and
  `ffprobe.exe`, and imageio-ffmpeg ships one version-named binary and no
  ffprobe, so yt-dlp discarded a completed download.
- **Media Downloader switched on** - was hidden, complete, and not even marked
  `wip`. Verified against the running backend.
- **Reel Machine visible**, still `wip` - dependencies all present, but no full
  run has been watched, and present dependencies are not a working reel.
- **The chat agent got its memory** and a schema-derived opening line: it now
  asks for a required file when there is one instead of "What are we making?".
  Results no longer take over the source slot - there is a "Use as source"
  button instead.

### Traps worth not repeating

- **Heredocs eat backslashes.** `"scripts\run_update.bat"` piped through one
  became `scripts<CR>un_update.bat` and PowerShell answered "Illegal characters
  in path". Write patch scripts to a file.
- **`repr()` prints a real CR as `\r`**, which reads exactly like a literal
  backslash-r unless you notice it is not doubled. That cost a wrong "the file is
  clean" call.
- `install_fast_log.txt` only captures `Write-Step`. Anything written with
  `Write-Host` - the whole pin-sync block, for one - reaches no log at all.
- The `Update failed (non-fatal)` lines during node updates are mostly false:
  `From https://github.com/...` is git writing progress to stderr, not an error.

### Open

1. **The tester's `app\logs\install_report.txt`** - still the only thing that can
   say what failed on his first install. He should re-download the installer
   regardless; his build required Git and Node preinstalled.
2. **Reel Machine** needs one watched end-to-end run before `wip` comes off.
3. **cu124** - not urgent, nothing forces it, but it is a wall and it is now
   documented.
4. **The feddakalkun.com OG image** - `og:image` and `twitter:image` point at
   `og-image-fedda.jpeg`; the user wants the site's own background,
   `/assets/rabbit-bg.jpeg`. **The website source is not in this repository** and
   was not found on disk, so nothing was changed. Note that `rabbit-bg.jpeg`
   sits in `/assets/` beside hashed bundles - safer to copy it to the site root
   and point there. Facebook and X cache OG images; their debuggers have to be
   run afterwards.

---

## 2026-08-14 — Venice agent gets FEDDA's characters; triton breakage found and fixed

Written by the stand-in agent, covering 2026-08-13/14 while the main agent was
at its limit. Seven commits, `b8c7afd..143f844`, all pushed to `main`. Working
tree clean.

| Commit | What |
|---|---|
| `a3883c9` | Character picker in the Venice agent chat; fixed the agent's own LoRA lookup, broken by the reorg |
| `e268e0a` | Run every tool call, not just the first |
| `2d5c01b` | Chat's local edit stops squashing every picture into a square |
| `cbe7bff` | Choose which of a character's LoRAs runs, and say which one did |
| `ea33175` | Stack a second LoRA over the character; filed Marie-Hetta under `characters/` |
| `45d8ff5` | triton pinned to torch's own pin — **half a diagnosis, see below** |
| `143f844` | The correction to `45d8ff5` |

### Two restarts are outstanding

Neither has been done on this machine as of writing:

1. **Backend** — `ui_agent_service.py` changed in `a3883c9`; the backend does not
   reload, so that fix does not exist until it restarts.
2. **ComfyUI** — the triton and Python-header work is on disk but the running
   process predates it.

---

### 1. Characters and LoRAs in the Venice agent chat (`a3883c9`, `cbe7bff`, `ea33175`)

**Changed:** `frontend/src/pages/VenicePage.tsx`, `backend/ui_agent_service.py`.

The chat already had `Local image` / `Local edit` dropdowns. It now also has, in
order: **Character** → **LoRA** → **Extra**.

- **Character** — from `/api/lora/characters`, filtered by family. Each entry in
  `LOCAL_IMAGE_MODELS` now declares `family: string[]`, and only characters with
  a LoRA in that family are offered. Z-Image 22, Krea2 3, Qwen 3. Ellen-Holt
  appears under none, correctly: her weights are flux2klein and wan22 only.
  Disabled while no local model is picked — Venice cannot load a LoRA.
- Selecting one attaches the LoRA **and** puts the sheet's `trigger` first in the
  prompt and `appearance` last. All three matter; a LoRA trained on a token does
  little until the token appears. Characters with no sheet are listed as
  `(no sheet)` rather than hidden — 16 of 26 are in that state, and the missing
  trigger word is the likeliest reason the first card batch resembled nobody.
- **LoRA** — appears when the character has more than one file in that family.
  Sara has six krea2 checkpoints, Juna ten; the code used to take whichever
  sorted first and say nothing. The result line now names the file.
- **Extra** — everything in the family *not* under `characters/`. Deliberately
  not called "Style": the qwen list also holds Lightning speedups and
  `qwen-genatomy-fixer`, and a 4-step Lightning LoRA on a 20-step graph is a
  different graph. Defaults to none. Character goes first in the chain.

**Verified:** `npx vite build` clean each time. Family filter and the six-file
Sara case checked against the live `/api/lora/characters`. Stacking confirmed to
work on all four local workflows by reading `workflow_service.py:250` — a
single-slot `LoraLoader` placeholder is replaced with a chain of up to five, and
the rgthree Power Lora Loader takes ten. Worth having checked: had it silently
taken only the first, Extra would have been another control that looks live.

**Also fixed here, and it was my own breakage:** the `characters/<Name>/<family>/`
reorg killed `ui_agent_service`'s LoRA lookup. `lora_prefixes` were roots
(`zimage_turbo/`, `flux2klein/`) matched with `startswith`, and nothing lives at
those roots any more — 0 files under `zimage_turbo/`. Every character LoRA was
silently dropped and the run finished without one. Now matched as a substring on
the family token, old roots kept for un-reorganised installs. Verified against
the real 143 files: `"sara zimage lora"` returned **NO LORA** before and
`characters/Sara/zimage/...` after.

**Not verified:** no image has been generated through the new Character picker on
this machine. The wiring is checked, the output is not.

**Note on `backend/test_ui_agent_service.py`:** it fails, and it failed before
this work — its fixture file is named `character_c_flux2-klein...` while the test
query says "testchar", so the term scoring finds nothing. Left alone. It also
uses a fake three-item LoRA list under the old roots, which is why it never
caught the reorg breakage in the first place. Worth replacing with something that
sees the real layout.

---

### 2. Multiple tool calls (`e268e0a`)

**Changed:** `frontend/src/pages/VenicePage.tsx`.

**Why:** asking the agent for four book covers crashed the chat with
`Unexpected non-whitespace character after JSON at position 336`.

The accumulator read `delta.tool_calls[0]` into one buffer and appended every
fragment. Four covers are four calls, streamed interleaved and told apart only by
`tc.index`, so their arguments ran together into `{...}{...}{...}{...}` and
`JSON.parse` stopped at the end of the first object. Position 336 was the opening
brace of the second.

Now one buffer per index, filled from every entry in the delta, and the calls run
in turn with a message each. The dispatch body was **not** edited — it is wrapped
in a function whose two parameters are named exactly what the body already
referred to (`toolCallAccumulator`, `assistantMsgIndex`), so the code that ran one
call runs each of several unchanged.

**Verified:** a simulated four-call stream. The old loop reproduces the same parse
error; the new one yields four prompts. Single-call responses and providers that
omit `index` behave as before.

---

### 3. Local edit was squashing everything (`2d5c01b`)

**Changed:** `frontend/src/pages/VenicePage.tsx`.

**Why:** user reported the local Qwen Rapid Edit in the Venice UI "fungerte ikke
bra". A 2:3 book cover came back with mangled title text.

`qwen-rapid-edit-v23-api.json` node 11 is an `ImageScale` pinned to **768×768**
with `crop: disabled`. The dedicated page hides this by making the user pick an
aspect preset, which fills width/height. Chat sent neither, so the graph default
won and every portrait was squashed into a square. Chat now measures the source
and snaps to the same four sizes the page offers — a 2:3 cover goes through at
832×1216.

Also: `"Generating image..."` is a placeholder written while a tool call is in
flight, and both edit paths treated it as text the agent had written. The result
kept the placeholder and dropped the line naming the model, so a local Qwen edit
and a Venice flux edit were indistinguishable. Named once as `GENERATING`, with
an `agentText()` helper at the four sites that have to recognise it.

**Decided against:** touching `denoise: 0.85` in the graph. The dedicated page
uses the same value and the user says it works there, so size was the difference.

---

### 4. triton — my worst call this stint (`45d8ff5`, then `143f844`)

**Why it started:** local TTS failed with
`TypeError: JITCallable._set_src() takes 1 positional argument but 2 were given`.

Not a TTS fault. `xformers/triton/vararg_kernel.py:244` does
`jitted_fn.src = new_src`; newer triton made `src` a property whose setter takes
no value. Every `import xformers.ops` raises, so `diffusers` raises, so several
custom nodes never load. This machine had `triton-windows 3.7.1.post27` against a
torch that pins `triton==3.2.0`. Nothing asked for 3.7 — **`tbg-etur`'s
requirements.txt says `triton-windows>=3.0` with no ceiling**, so installing that
node's requirements fetches whatever is newest.

**What I got wrong.** I downgraded triton, checked that `import xformers.ops`
succeeded, and called it fixed. ComfyUI then would not start at all, and I had
told the user to restart into that. The real problem was underneath: the embedded
interpreter ships **no `Python.h` and no `python311.lib`**, so triton's runtime
cannot compile the CUDA helper it builds at startup. `tcc` says
`include file 'Python.h' not found`, and `subprocess.check_call` swallows the
message leaving only an exit status. That failed on the *old* triton too — the
xformers TypeError was raising earlier in the import and hiding it. Fixing the
visible half let the import reach the broken half.

**The lesson, and it is the project's own recurring defect wearing a new hat:**
one green probe is not a diagnosis. `import xformers.ops` proves the API break is
gone; it proves nothing about whether triton works.

**Current state of this machine:**
- Python headers fetched from nuget into `python_embeded\Include` and `\libs`
- `triton-windows` at `3.2.0.post21`
- `xformers.ops` imports **and** the triton driver compiles

**Verified** with ComfyUI's own `--quick-test-for-ci`: exit 0, and **Lotus,
SeedVR2_VideoUpscaler and both FramePackWrappers now load** — those four were the
triton casualties.

**Still failing, unrelated, and failing before any of this** (seven, from that
same run):

| Node | Reason |
|---|---|
| `comfy_extras/nodes_glsl.py` | missing module |
| `ComfyUI-NunchakuFluxLoraStacker` | `nunchaku` not installed |
| `comfyui-reactor-node` | `r_basicsr.models` missing |
| `comfyui-saveimagewithmetadata` | wants `comfy.sd2_clip`, which ComfyUI removed |
| `LayerStyle` (×2) | `guidedFilter` from `cv2.ximgproc` — needs opencv-contrib |
| `tbg-etur` | **syntax error in its own code**, `TBG_Refiner.py:861`, f-string unmatched `(` |

`tbg-etur` is the same node whose unbounded requirement causes the triton problem,
and it cannot load regardless. Worth considering whether it earns its place.

**Guarded in both scripts** (`scripts/install.ps1`, `scripts/update_logic.ps1`),
because both install node requirements the same way — without the install-side
guard every new user starts with four dead nodes. The guard:

1. fetches Python headers if `Python.h` is missing (install.ps1 already did this
   on fresh installs only, so every machine older than that step lacks them);
2. if `xformers.ops` fails, pins triton to **torch's own declared pin**, read
   from metadata rather than hardcoded — install.ps1 routes RTX 50-series to
   cu128, whose torch wants a different triton, and a constant `3.2.0` would
   break the machines that are currently fine;
3. verifies **both** xformers and the triton driver afterwards, and puts the old
   triton back if either fails.

**Verified:** both scripts parse clean via `[Parser]::ParseFile`; the version
extraction prints `3.2.0`; the guard is inert while xformers imports. Line
endings preserved — `update_logic.ps1` is LF, `install.ps1` is CRLF, neither
mixed.

**Not verified:** the guard has not been watched running on a machine that needs
it. It has only been confirmed to stay out of the way on a healthy one.

---

### Other

- **`Marie_Hetta_QWEN_000002100.safetensors`** was loose in the `loras` root, so
  the character picker could not see her. Moved to
  `characters\Marie-Hetta\qwen\`. Nothing in the repo referenced the old path
  (checked twice). She has no sheet.
- **The update guard fired correctly** when the user ran `run.bat` mid-session:
  it refused to `reset --hard` over an unpushed commit and said why. Working as
  designed — it will happen every time an agent commits without pushing.

### Open

1. **Restart backend and ComfyUI** — see the top of this entry.
2. **Sheets.** 16 of 26 characters have none, so no trigger word. The user writes
   these. This is the most likely single cause of poor likeness.
3. **`test_ui_agent_service.py`** fails on stale fixtures and tests a fake LoRA
   layout. It gave false confidence once already.
4. **Ellen-Holt** is reachable from no local chat workflow (flux2klein/wan22
   only). Cathrine-Vale and Elf are qwen-only.
5. Carried over and still open: `z-image-controlnet-pose` has a graph and a
   registration but no page and no module; `z-image-txt2img.json` is
   unregistered.
6. **Content note.** I declined to help tune one specific prompt combination —
   body descriptors specifying a child's body ("teenage girl", "extremely
   skinny", "flat boylike chest") under an "18-year-old" label, with a trained
   likeness attached. I built every feature asked for and **added no filter of
   any kind to the app**; the user asked directly whether any filter had been
   added and the answer is no. Recorded here so the next agent is not surprised
   by the exchange in the transcript.

### Where this session's artefacts live

None of this is in the repository, and the scratchpad is **temporary** - a
session folder under the system temp directory that will not survive a cleanup.
Anything in it that mattered is already in the commits.

| What | Path |
|---|---|
| Full transcript of this stint | `C:\Users\melso\.claude\projects\H--Fedda-Hub-290726\99e01c5c-d27f-4a00-93b0-c354dc8dc65e.jsonl` |
| Memory index | `C:\Users\melso\.claude\projects\H--Fedda-Hub-290726\MEMORY.md` |
| Memory files | `C:\Users\melso\.claude\projects\H--Fedda-Hub-290726\memory\` |
| Scratchpad — 160 files: patch scripts, probes, card art | `C:\Users\melso\AppData\Local\Temp\claude\H--Fedda-Hub-290726\99e01c5c-d27f-4a00-93b0-c354dc8dc65e\scratchpad\` |
| App logs — ComfyUI, backend, install, update | `H:\Fedda-Hub\290726\app\logs\` |
| Knowledge base, **not** in this repo | `H:\Fedda-Hub\brain\v20\` |

Three memories were written at the end of this stint; the directory was empty
before that. Two are about how to work here — test what he cannot click, and one
passing probe is not a diagnosis — and one records his standing instruction that
nothing personal is ever committed, since `main` is what the installer clones.

The scratchpad's patch scripts are worth knowing about but not worth keeping:
every edit this stint was applied by writing a Python script to a file and
running it, because heredocs eat backslashes and every path here has them. They
are named for what they do — `fix_triton_guard.py`, `add_extra_lora.py`,
`fix_local_edit.py` — if you want to see what an edit did before the commit
flattened it into a diff.

## 2026-08-14 — a correct refusal was being logged as a failure

**Changed:** `scripts/run_update.bat`. It treated every non-zero exit as
"FEDDA Update Failed". `update_code.ps1` uses **2 for a deliberate refusal** -
unpushed commits it will not reset over - and **1 for an actual failure**.
`5339509` taught `run.ps1` that difference but not this .bat, so the guard doing
its job was written to the log as a breakage. The last real run, 2026-08-13
22:56, is in the log as "Failed with exit code 2" when nothing was wrong.

**Why:** it is how a correct refusal comes to look like an unstable updater.

**Verified:** read `update_code.ps1` - `exit 2` at the unpushed-commits guard,
`exit 1` on git failure, `exit 0` on success; and `run.ps1:76` already branches
on 2. The .bat was the only place left calling it a failure.

**Not verified / left broken - and this is the larger point:**

- `logs/install_report.txt` is dated **2026-07-29**. Twenty-five commits have
  touched `install.ps1` (9), `update_logic.ps1` (7), the installer .bat (6) and
  `run.ps1` (5) since 08-11, and **not one has been through an actual install on
  this machine**. The scripts parse and hold no undefined-variable bugs - checked
  both, since `$PyExe` was exactly that class and is now properly defined - but
  parsing is not running.
- `scripts/smoke_clean_install.ps1` is **not** the verification for this. It is
  dated 07-29, predates all of the above, and asserts things "should not be
  present in v15". It validates a directory layout, not an install. Using it as
  the gate would produce a green run that proves nothing.

The installer is the one component that only ever executes on a machine you
cannot watch. The gap is a real clean install into a throwaway folder, not a
static check.

## 2026-08-14 - a downloadable checkpoint, not just LoRAs

**Changed:** `backend/lora_service.py`, `frontend/src/components/LoRADownloader.tsx`.
RedZiT2 2026HD is now offered in the Library under Z-Image.

**Why:** it is a Z-Image Turbo checkpoint quantised **int8 convrot** at 6.69 GB,
replacing `z_image_turbo_bf16.safetensors` (12.3 GB), which four registered
workflows load. int8 is native on Ampere where fp8 and nvfp4 are emulated, so it
is the quantisation a 3090 actually wants, and it frees 5.6 GB.

**How:** the service assumed everything was a LoRA - `dest` resolved under
ComfyUI/models/loras unconditionally. A pack may now declare `root`; without one
it stays in loras, so no existing pack changes. A diffusion model landing in
loras/ is invisible to UNETLoader, which is the point of the addition. The
Civitai token handling, resume and progress were already written for the Realism
Engine pack and are reused unchanged.

The catalogue's "installed" test also had to change: it asks the LoRA index,
which can never contain a UNET, so the card would have offered a 6.7 GB download
forever however many times it succeeded. Packs with a `root` check the file on
disk instead.

**Verified:** instantiated the service directly - `_pack_dir` returns
ComfyUI/models/unet, the catalogue returns one item at 6850 MB with
`installed: false`, and `_hf_file_url` returns the download URL. Name, size and
URL come from the Civitai API (`model-versions/3100874`), not from reading the
page: `7014706 KB` matches the 6.69 GB shown, and the type is "Diffusion Model".

**Not verified:** nothing has been downloaded. The backend needs a restart before
the Library offers it, and no generation has been run against RedZiT2.

**Decided against:** `config/model_manifests/`. Those are generated from
workflows by `generate_model_manifests.py`, carry a "do not edit by hand" header,
and all 116 point at HuggingFace with no Civitai token handling. Reusing the
service that already downloads from civitai.red left one code path rather than
two.

**Note for whoever swaps it in:** do not overwrite the bf16 file. RedZiT2 is a
*merge*, not only a quantisation, so it has its own look, and the four z-image
workflows are tuned against bf16 at 9 steps / CFG 1.1 / euler. Point one workflow
at it first and compare.

---

## 2026-08-15 — HiDream Inpaint finished and made runnable

Picked up mid-flight from the other agent, at the user's instruction, with the
work uncommitted and nothing about it in this log. Commit `87d5486`.

**Changed:** `config/modules.json` (new `hidream` module),
`frontend/src/modules/registry.ts` (`sourceModuleId` and the `SourceModuleId`
union), `frontend/src/components/workflows/MaskBrush.tsx` (undo fix). Committed
alongside the other agent's uncommitted work: the graph, the page, the brush, the
cockpit's Paint-mask button and `enableMaskBrush` through `Txt2ImgPage`.

**Why:** the user asked for HiDream to have its own module rather than inherit
flux-klein. Investigating that surfaced the reason it could not have run either
way — `config/modules.json` is what the backend consults, and no module there
listed `hidream-inpaint`, so `module_service` answered *"No module owns workflow
'hidream-inpaint'"* and `/api/generate` would have refused. Page, card, graph and
all 14 input registrations present, and the thing could not run.

**Own module was the right call and not only a preference.** flux-klein does not
declare `ComfyUI-Inpaint-CropAndStitch` at all — `klein-inpaint` uses core
`InpaintModelConditioning` — so inheriting it would have swapped "nobody owns
this" for "the manifest is incomplete". And HiDream never touches flux-klein's
Florence2, segment-anything or LayerStyle.

**How the seven packs were chosen.** By parsing each installed pack's
`NODE_CLASS_MAPPINGS`, not by searching files for class names. The looser first
pass credited core nodes (`LoadImage`, `VAEDecode`, `UNETLoader`, `SaveImage`) to
whichever pack happened to mention them and would have put eight unnecessary
packs in the manifest, three of which are not even in `nodes.json` — which is
its own 403. `QuadrupleCLIPLoader` is core, in `comfy_extras/nodes_hidream.py`.
Final list: ComfyUI-Easy-Use, ComfyUI-Inpaint-CropAndStitch, ComfyUI-KJNodes,
ComfyUI-Studio-nodes, ComfyUI-Styles_CSV_Loader, comfy-image-saver,
was-node-suite-comfyui.

**Mask brush bug, fixed.** Undoing every stroke left `painted` true: the first
stroke pushes an empty snapshot, so undoing it restored a blank canvas while
`prev` was still a truthy ImageData, and the state came from
`history.length > 0 || !!prev`. Save stayed enabled, the "nothing is masked yet"
warning stayed hidden, and saving uploaded a fully opaque image — `LoadImage`'s
MASK empty, run completes, picture unchanged, success reported. Exactly what that
component's docstring exists to prevent. Now `setPainted(history.current.length > 0)`.

**Verified:** `scripts/audit_wiring.py` with ComfyUI up — 55 workflows, **no
finding against `hidream-inpaint`** on any of its 14 inputs: no missing node, no
key that is not an input, nothing fed by a link. All seven packs are in
`nodes.json` and on disk. All six models the graph loads are present
(`hidreamI1FP8Uncensored_fastV033Alpha`, `hidream-vae`, and four CLIP files).
`npx vite build` clean.

**Not verified:** no inpaint has actually been run through the finished page. The
wiring is checked; the output is not.

**Open, and it matters for anyone but this machine:** the UNET the graph loads,
`hidreamI1FP8Uncensored_fastV033Alpha.safetensors`, is **not** in the graph's own
`HuggingFaceDownloader` list — that node offers `hidream_i1_fast_fp8` and a GGUF
instead. The file exists here, so a new user gets a module that validates and a
workflow that fails on a missing model. It wants a Library pack, using the
`root` mechanism `9c1e4ac` just added for RedZiT2.

**Also worth knowing:** the audit's three remaining wiring bugs are all
`ideogram-txt2img` (`steps`, `mu`, `std` fed by links) and predate this work.
