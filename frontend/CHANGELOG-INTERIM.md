
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
