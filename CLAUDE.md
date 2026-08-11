# FEDDA Hub v2.0 — working notes

A local ComfyUI front end: FastAPI backend, React frontend, ~57 registered
workflows. This file is the things that are costly to rediscover, not a tour of
the code. `python scripts/audit_wiring.py` checks the claims that can be checked.

## Where things run

| | |
|---|---|
| Backend | `python_embeded\python.exe backend/server.py`, port **8000**, no auto-reload |
| ComfyUI | port **8199**, not 8188 — `--disable-cuda-malloc --preview-method auto` |
| Frontend | Vite; the app is normally served by the backend |
| Both | started together by `scripts/run.ps1` |

**The backend does not reload.** Any change to `backend/server.py` needs a
restart before it exists. Config JSON is different: `prompt_profiles.json` and
`prompt_builder.json` are re-read on mtime, so retuning them is live.

**`--disable-cuda-malloc` is load-bearing.** Recurring 3090 OOMs traced to
cudaMallocAsync; reserved >> allocated is the tell. `expandable_segments` was
tried and caused spurious OOMs — see the note in `run.ps1`.

**Vite dev on 5175 does not proxy `/comfy/ws`.** Live previews and the Recent
Generations strip get nothing there; `ERR_CONNECTION_REFUSED` in that console is
expected, not a bug. Anything depending on the websocket has to be checked
against the backend-served build.

## Two clones exist

`H:\Fedda-Hub\290726\app` is what runs and what is synced with GitHub.

`H:\Fedda-Hub\Fedda_hub_v2.0\repo` is the repository as it was **before the
clean-slate reset**. It points at the same GitHub remote, but the two histories
share **no common ancestor** — `git merge-base` returns nothing. Its history runs
2026-07-03 to 2026-07-24; the current one begins 2026-07-29. Git reports "192
ahead, 189 behind", which reads like a diverged branch and is not: they are two
unrelated trees sharing a remote URL.

Nothing in the app references that folder. It is inert unless someone runs git in
it, and the only dangerous command is `push --force`, which would replace
`origin/main` with the July tree — and `update.bat` does `git reset --hard
origin/main` on every install, so that is a downgrade of every user at once. Its
push URL was therefore disabled on 2026-08-11 (`remote set-url --push origin
DISABLED-old-clone-do-not-push`); fetch still works. Never bulk-copy between the
two: they differ on base and on line endings.

## The recurring defect

Five separate cases in one day, all the same shape: **the feature is finished and
switched off, or its control is not connected.**

- `sdxl-outpaint` was complete — page, card, registered — and could not run: its
  five `INPAINT_*` nodes come from `comfyui-inpaint-nodes`, and `modules.json`
  declared `ComfyUI-Inpaint-CropAndStitch`, a different pack.
- Both FLUX txt2img workflows were `hidden: true` while the standard one was
  generating this project's card art.
- Outpaint's edge controls, FLUX's width/height, dual-lora's `shift`, and
  outpaint's seed/steps/cfg were all registered against nodes that could not
  receive them, or not registered at all.

So: before unhiding anything, check it would actually run. Before trusting a
slider, check the input it points at is not fed by a link. `audit_wiring.py`
does both.

## Wiring rules

`config/workflow_api.json` maps a UI parameter to `node_id` + `input_key` in a
graph under `backend/workflows/`. Three ways it silently fails:

1. the node id is not in the graph (the value vanishes)
2. the key is not an input of that node
3. **the input is fed by another node** — a link wins over a submitted value, so
   the control looks live and does nothing

`/api/generate` refuses with **403 "Module manifest is incomplete"** when a
module lists a custom node that has no entry in `config/nodes.json`. Adding a
pack means editing both `modules.json` and `nodes.json`.

## ComfyUI details that bite

- **`object_info` has two shapes.** Newer nodes answer
  `["COMBO", {"options": [...]}]`; older ones `[[...]]`. Read only one and you
  validate nothing.
- **Path separators are per-node, not per-platform.** A graph may say
  `Antigravity\z-image\x.safetensors` where ComfyUI offers forward slashes;
  `server.py` normalises at submit time. Compare normalised.
- **A run can report `success` having produced nothing useful.** If detection
  finds no match, the detailer branch is skipped, only the base image is saved,
  and any "pick the last image" fallback will present it as the finished result.
- Model downloads: use the backend's download button (~105 MB/s), not the
  ComfyUI node (~7.4 MB/s).

## Local models

`_get_ollama_text_model()` / `_get_ollama_vision_model()` pick from installed
tags, with the user's Settings choice winning. Every call sets
`keep_alive: 0` — a 12B model otherwise sits on ~12 GB of the 24 GB ComfyUI is
about to need.

**joycaption ignores its prompt.** It is the preferred vision model because it
describes explicit imagery, but it answers with its own tag list whatever it is
asked, so `_caption_prompt_for_context` has no effect when it is selected. Two
consequences, both already relied on: frame a caption by **cropping** what you
show it rather than by asking, and have the text model rewrite the tag list into
prose.

## Editing files here

Almost everything is **CRLF**. Regex and string replacement in Python must open
with `newline=""` and expect `\r\n`. When rewriting a JSON config, keep
`ensure_ascii=True` — the files contain `\uXXXX` escapes, some of them already
mojibake, and unescaping them produces a diff across the whole file.

`tsc --noEmit` passing is not proof: it has let broken JSX structure through.
Run `npx vite build`.

## Prompt configuration

- `config/prompt_profiles.json` — the image→prompt instruction per workflow
  context: one `base`, a small delta per profile. Contexts come from
  `PromptContext` in `frontend/src/components/ui/PromptAssistant.tsx`.
- `config/prompt_builder.json` — the txt2img option picker. `label` is what the
  dropdown shows, `words` is what goes to the model; that split is the point.
- `config/prompt_actions.json` — video motion beat sheets.

`num_predict` on the text model is a ceiling of 320. At 120 it cut prompts off
mid-sentence, which Ollama reports as `done_reason: "length"` — worth checking
if output ever looks truncated again.

## Handover

`HANDOFF.md` is what was in flight when the
previous session ended: recent changes, open decisions, and the traps that
cost time. `CHANGELOG-INTERIM.md` is a running log to append to
while the project changes hands - it is what carries work across a handover,
because commit messages explain a change but not the sequence.
