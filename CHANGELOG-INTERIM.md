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
