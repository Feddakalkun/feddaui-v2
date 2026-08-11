# Handoff — 2026-08-11

Written for whoever picks this up next. `CLAUDE.md` in this repo is the standing
reference for how the project works; this file is what is **in flight**, what was
just changed and why, and what is waiting on a decision.

Everything described here is committed and pushed to `main` on both repositories.
Working tree is clean apart from one deliberately untracked folder (below).

---

## 1. Read these first, in this order

1. **`H:\Fedda-Hub\brain\v20\`** — the project's knowledge base, and it is **not
   in this repository**. `docs/` here is gitignored, so nothing of the sort
   travels with a clone. Start with `BREADCRUMBS.md` (1675 lines, the running
   engineering log), then whichever of these touches your task:

   | File | What |
   |---|---|
   | `BREADCRUMBS.md` | the log; recipes and decisions are dated in here |
   | `CARD-ART-PROMPTS.md` | the card art recipe — read before generating any card |
   | `WORKFLOW_STANDARD.md` | how a workflow is expected to be wired |
   | `PROMPT_BRAIN.md` | prompt construction conventions |
   | `UI-CONSISTENCY-AUDIT.md` | known UI inconsistencies |
   | `PLAN-image-cockpit-migration.md` | the in-progress cockpit unification |
   | `handoff/PLAN-dual-lora-control.md` | dual-LoRA design — relevant to today's work |
   | `handoff/PLAN-hosted-multitenant.md` | per-user GPU plan; `backend/comfy_proxy.py` is written but not wired |
   | `handoff/PLAN-char-animation.md`, `handoff/PLAN-ui-first-install.md` | not started / partly done |

   Everything there is dated 2026-08-05, so treat it as design intent that may
   predate the code. Where they disagree, the code is what runs — but say so
   rather than silently diverging.

2. `CLAUDE.md` (this repo) — ports, the two clones, the traps that cost hours
3. `python scripts/audit_wiring.py` — run it before trusting any workflow control
4. This file

The single most useful thing to internalise: **the recurring defect in this
project is not missing features, it is finished features that are switched off,
or controls that are not connected to the graph.** Five separate instances were
found in one day, each because the user happened to open a page and notice. The
audit script exists to find them instead.

---

## 2. What changed (2026-08-11)

Nine commits, `37e5792..6e6ba83`. Newest first.

| Commit | What |
|---|---|
| `6e6ba83` | Removed the Load Styles CSV chain from outpaint + inpaint (user's edit), repointed their prompt/negative registrations |
| `2aa530a` | Taught the audit about `_SKIP_TYPES` and `input_keys`; fixed inpaint's prompt and dual-base's stray denoise |
| `d31c658` | Added `scripts/audit_wiring.py` and `CLAUDE.md`; fixed outpaint's seed/steps/cfg/denoise |
| `6254970` | Prompt builder from dropdowns; raised `num_predict` 120 → 320 |
| `52b12c8` | Unhid both FLUX txt2img; gave "Unfiltered" its own page so it stops running the standard checkpoint |
| `99d1686` | Recent Generations sorts by time; z-image-advanced got its own card |
| `9670fbc` | Registered the working dual-LoRA v2 graph, stripped 13 dead nodes from it, unhid sdxl-outpaint |
| `97c8f64` | Installed `comfyui-inpaint-nodes`; gave SDXL Outpaint real edge controls |
| `b137101` | Drop an image anywhere in the agent chat; `config/prompt_profiles.json` |

### The bugs worth knowing about, because they were all silent

- **`z-image-inpaint-automask` generated "sunset" on every run.** The prompt was
  registered against a CLIPTextEncode whose text came from a concatenate; the
  literal it belonged in held the word "sunset".
- **`sdxl-outpaint`'s seed, steps, cfg and denoise never reached ComfyUI.** They
  pointed at node 274, which is not in the graph. Every run used the baked
  seed 327, steps 20, cfg 1 on an `lcm` sampler while the page displayed CFG 7.
  After the fix the same page renders in 12s instead of 27s.
- **`num_predict` was 120**, so every prompt over ~90 words came back cut
  mid-sentence. Ollama reports `done_reason: "length"`. This had been clipping
  every prompt the agent wrote, on every page.
- **"Unfiltered" would have run the censored model.** Its module pointed at the
  standard page, whose workflow id is hardcoded.
- **`ModelSamplingAuraFlow`'s output went nowhere** in the dual-LoRA graph, so
  the `shift` control registered against it did nothing.

---

## 3. Things that will waste your time if you do not know them

- **ComfyUI is on port 8199, not 8188.** A check against 8188 will report it
  down while the app shows it online.
- **The backend has no auto-reload.** `backend/server.py` changes need a restart
  (`scripts/run.ps1` starts backend + ComfyUI together). Config JSON is
  different: `prompt_profiles.json` and `prompt_builder.json` re-read on mtime.
- **`tsc --noEmit` passing is not proof.** It has let broken JSX through. Run
  `npx vite build`.
- **Almost everything is CRLF.** Python string/regex edits need `newline=""`.
  When rewriting a JSON config keep `ensure_ascii=True`, or you get a whole-file
  diff from unescaped `\uXXXX`.
- **`object_info` has two combo shapes** — `["COMBO", {"options": [...]}]` and
  `[[...]]`. Read only one and you validate nothing. `combo_options()` in the
  audit script handles both; copy it rather than rewriting it.
- **joycaption ignores its prompt.** It is the selected vision model and answers
  in its own tag-list style whatever it is asked, so
  `_caption_prompt_for_context` has no effect while it is chosen. Two workarounds
  are already in the code and both matter: frame a caption by **cropping** what
  you show it, and have the text model rewrite the tag list into prose.
- **A run can report `success` having produced nothing.** If detection finds no
  match the detailer branch is skipped, only the base image is saved, and any
  "take the last image" fallback presents it as finished.
- **Vite dev on 5175 does not proxy `/comfy/ws`.** Live previews and the Recent
  Generations strip get nothing there; those console errors are expected.
- **UI buttons for workflow cards have empty `textContent`.** Names live in
  aria/alt. Text-based selectors will miss them; use the accessibility tree.

---

## 4. Open items

### Waiting on the user, do not decide for them

- **`ideogram-txt2img` steps/mu/std** are the last 3 audit findings. Do **not**
  repair them individually: the graph carries three presets with matched values
  (Quality 48/0.0/1.5, Default 20/0.0/1.75, Turbo 12/0.5/1.75) chosen by an
  `ImpactSwitch` on node 217. Three separate numbers invite combinations the
  presets exist to prevent. It cannot run anyway — three of its models are
  missing — so it stays a finding until they are downloaded, then becomes one
  dropdown.
- **CivitAI trigger-word fetch.** The WAN 2.2 collection (below) has no trigger
  words anywhere: its README has only links, and the safetensors metadata is
  stripped to `format`. 36 unique CivitAI model ids are in that README and a key
  is configured, so trigger words could be fetched and written as `<stem>.md`
  sidecars, which `lora_service.py` already reads. Offered, not yet approved:
  it is 36 external calls and 159 new files on the user's backup drive.
  Note most of these are motion LoRAs and probably need no trigger at all.
- **`frontend/public/cards/bunny-clean/`** — 7 textless portraits, untracked, not
  referenced by any code. Left out of git deliberately. Include or delete.
- **22 hidden modules.** The audit lists them with whether their graph would
  actually run, which separates "hidden because broken" from "hidden on purpose".
  Several declare no workflows at all (venice, grok, media-downloader,
  transform-reel, reel-machine, scail-studio, companion).
- **24 orphan graph files** that nothing references.

### Unverified work

- **`config/prompt_profiles.json` has not been tested against the models.** Six
  contexts that previously fell through to a generic fallback got real profiles
  (wan-story, flux2-klein, chroma, qwen, firered, minimax-h3), and the wording is
  reasoned but unmeasured. Particularly FLUX's "prose, not tags" claim.
- **`config/prompt_builder.json`** works end to end (verified in the app) but the
  option vocabulary is one person's guess at what each model responds to.

### Known, deliberately not fixed

- **`Fedda_hub_v2.0\repo`** (i.e. `H:\Fedda-Hub\Fedda_hub_v2.0\repo`) is the
  repository as it stood **before the clean-slate reset** — an unrelated history
  (2026-07-03 to 07-24) pointing at the same remote. This entry previously said
  "192 ahead and 189 behind" and that leaving it alone was the user's decision.
  Both were wrong: git prints those numbers for two trees with no common
  ancestor, and the user had never been told the folder existed. Its push URL was
  disabled on 2026-08-11 after he asked. Work in `H:\Fedda-Hub\290726\app`; never
  bulk-copy between them.

---

## 5. Things outside git you would not otherwise find

- **`H:\Fedda-Hub\brain\v20\`** — see section 1. The knowledge base. Not in git.
- **`H:\Fedda-Hub\card-recipes\`** — the scripts that generate the card art,
  with a README explaining the recipe. Deliberately outside both clones because
  this repo is public. Recovered from `%LOCALAPPDATA%\Temp\claude\...` where
  thirteen versions had accumulated across nine days because the previous one
  could never be found. **If you need to make a card, edit these, do not write a
  new script** — and read `brain/v20/CARD-ART-PROMPTS.md` first, which is the
  logged recipe those scripts descend from. Note the two disagree on output size
  (the doc says 1248x832, the shipped family cards are 1168x784); the shipped
  size is what the picker expects.
- **WAN 2.2 LoRA collection** at `G:\001.model-backup\Wan2.2_Full_Collection\`
  — 161 files, 58 GB, added to `ComfyUI/extra_model_paths.yaml` as a search path
  rather than copied (backup of the previous file is `.bak` beside it). 159 are
  now visible to ComfyUI. The two most valuable are
  `wan2.2_i2v_lightx2v_4steps_lora_v1_{high,low}_noise.safetensors` — the
  LightX2V 4-step distillation, which cuts WAN 2.2 from ~20 steps to 4 and makes
  testing the rest affordable on a 3090. Nine concepts in that folder have only
  one half of the high/low pair and will behave inconsistently.
- **feddakalkun.com** lives in `H:\Fedda-Hub\feddakalkunweb` (private repo). Its
  own `CLAUDE.md` holds the deploy recipe and server details; `deploy.bat` in its
  root does the whole thing. **Deploying is manual and Claude has no access to
  that machine** — never say a change is live after pushing.

---

## 6. How the user works

Stated and demonstrated, worth respecting from the first message:

- **Be concise.** Long explanations get called out. Say what changed and what it
  means, not how you got there.
- **Do not wander into adjacent work.** If you spot something, name it in a
  sentence and let them choose.
- **Verify, do not claim.** A deploy was once reported as landed when three
  assets were the SPA fallback. The user notices this kind of thing. Check
  content-type, run the thing, read the output.
- **Do not add what was not asked for.** The costliest mistake of the session was
  not technical. Told the card faces looked a bit too similar, an earlier pass
  produced faces varying in ethnicity and age — which was never the request, and
  landed badly. "Too similar" meant vary faces *within the established look*, not
  change who the character is. When feedback is one short phrase, ask what it
  covers before widening the scope yourself.
- **Do not over-read a screenshot.** They are often just a crop to point at one
  thing.
- **Credits are finite and they watch them.** Sessions have ended at the weekly
  limit twice. Prefer one decisive check over three exploratory ones; do not
  re-run a generation to confirm something a file already proves.
- Norwegian and English are mixed freely; either is fine in reply.

---

## 7. Required: log everything you change

The user is away for about three days and will hand this back to the previous
agent when they return. **Append to `CHANGELOG-INTERIM.md` after
every change you make** — that file is the only thing that will carry your work
across the handover. It has a template at the top.

Non-negotiable per entry: what you changed, *why*, how you verified it, and
anything you left broken or unfinished. If you decided against something, record
that too — knowing what was considered and rejected is worth as much as the diff.

Commit messages are not a substitute. They explain a change; this file explains
the sequence, including the dead ends and the things you could not test.

---

## 8. If you want a first task

Run `python scripts/audit_wiring.py`. It exits non-zero on the three ideogram
findings, which is correct and known — do not "fix" them to get a green run.

Then the highest-value untouched work is the **hidden-module sweep**: 22 modules
are off the home screen and the audit already says which of them would run. Two
of the five defects found today were exactly this (`sdxl-outpaint`, both FLUX
txt2img). Check a graph would run *before* unhiding it — unhiding something
broken is worse than leaving it hidden, and unhiding something whose page is
wired to a different workflow is worse still.
