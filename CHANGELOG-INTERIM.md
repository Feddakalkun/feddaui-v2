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
