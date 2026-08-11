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
