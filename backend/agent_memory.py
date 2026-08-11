"""What the app knows about the person using it.

The old memory was one list of strings on the image-edit agent, and its
instruction said "Almost every turn is null" - so after months it held exactly
one line. The model was never the limit; it did what it was told.

This reads a whole conversation instead of a single turn, may return several
items at once, and sorts them into kinds, because "prefers cooler lighting" and
"his character is called Saira, leader of The Strategyc" are not the same sort of
thing and are not recalled the same way:

    preference  how they like things done            - steers generation
    fact        something true about them or theirs  - names, projects, gear
    entity      a thing they keep coming back to     - a LoRA, a look, a model
    episode     something that happened, with a when - "we spent a session on X"

Extraction runs over a finished conversation rather than per turn. A 12B model
occupies ~7 GB, the app already sets keep_alive 0 because ComfyUI wants the card,
and paying that load on every message to learn nothing most of the time is the
worst possible trade. Once per conversation it is cheap.

The store is a flat JSON file. It holds what this install has learned about
whoever uses it, so it is nobody else's business and must never travel with the
app - the same reason `chat_edit_agent.json` is not shipped.
"""
from __future__ import annotations

import json
import re
import time
import uuid
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

KINDS = ("preference", "fact", "entity", "episode")

# Long enough to be a claim, short enough to stay a single idea.
MIN_LEN = 12
MAX_LEN = 220

EXTRACT_MODEL = "mistral-nemo:12b"


def _norm(text: str) -> str:
    """For comparison only - punctuation and case are not differences."""
    return re.sub(r"[^a-z0-9 ]+", "", (text or "").lower()).strip()


# Words that carry no meaning for "is this the same memory". Without stripping
# them, "prefers visible pores and natural skin texture in images" and "prefers
# images with visible pores and natural skin texture" look different enough to
# store twice - which is exactly what happened on the first run.
_STOP = {"the", "user", "a", "an", "of", "in", "on", "with", "and", "or", "to",
         "for", "their", "them", "they", "it", "is", "are", "was", "were", "be",
         "prefers", "likes", "wants", "asked", "requested", "image", "images"}


def _tokens(text: str) -> set:
    return {w for w in _norm(text).split() if w not in _STOP and len(w) > 2}


# Local, 274 MB, and free forever. Venice has an embeddings endpoint too, but a
# memory that stops working when an API balance runs out is not a memory - the
# same principle the vision provider was built on.
EMBED_MODEL = "nomic-embed-text"
EMBED_THRESHOLD = 0.86


def cosine(a: List[float], b: List[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = sum(x * x for x in a) ** 0.5
    nb = sum(y * y for y in b) ** 0.5
    return dot / (na * nb) if na and nb else 0.0


def embed(texts: List[str], ollama_url: str, timeout: int = 120) -> List[List[float]]:
    """Vectors for a batch. Returns [] on any failure - never blocks a write.

    Storing a memory must not depend on an embedding service being up. Without
    vectors the word-overlap check still runs; it is simply less good.
    """
    import requests as _rq

    out: List[List[float]] = []
    for text in texts:
        try:
            r = _rq.post(f"{ollama_url}/api/embeddings",
                         json={"model": EMBED_MODEL, "prompt": text, "keep_alive": 300},
                         timeout=timeout)
            r.raise_for_status()
            vec = r.json().get("embedding") or []
        except Exception:  # noqa: BLE001
            return []
        out.append(vec)
    return out


def similar(a: str, b: str, threshold: float = 0.7) -> bool:
    """Same memory said differently.

    Jaccard over content words. Not as good as an embedding, but it costs
    nothing and catches the rewordings a single model produces across two
    conversations, which is where the duplicates actually come from.
    """
    ta, tb = _tokens(a), _tokens(b)
    if not ta or not tb:
        return False
    overlap = len(ta & tb) / len(ta | tb)
    return overlap >= threshold


def load(path: Path) -> Dict[str, Any]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        data = {}
    data.setdefault("memories", [])
    return data


def save(path: Path, data: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")


# Sources whose rows carry their own identity and must never be merged by
# resemblance. The library-derived memories all share the template "The user
# has generated this N times: ...", and that template dominates the vector:
# two different prompts about a rabbit-eared woman scored 0.868 while a true
# duplicate scored 0.871. No threshold separates those, so the answer is not to
# pick one - it is to not ask the question for rows that already know what they
# are.
EXACT_ONLY_SOURCES = {"prompt-library"}


def add_many(path: Path, items: Iterable[Dict[str, Any]], source: str = "",
             session_id: str = "", ollama_url: str = "") -> Dict[str, int]:
    """Merge new items, skipping ones already known.

    Deduped on normalised text: the same preference learned twice in two
    conversations should raise its weight, not fill the list with near-copies.
    """
    # Materialised: the batch is walked twice, once to embed and once to
    # merge, and a generator would be empty the second time.
    items = list(items)
    data = load(path)
    existing = {_norm(m.get("text", "")): m for m in data["memories"]}
    added = repeated = 0

    # Vectors for the incoming batch, if an embedder is reachable. Word overlap
    # missed "asked to modify an image by removing X" against "asked the AI to
    # remove X" - 0.6 against a 0.7 threshold - and tuning that number against
    # fifteen examples would be fitting the noise.
    wanted = [str(i.get("text") or "").strip() for i in items
              if MIN_LEN <= len(str(i.get("text") or "").strip()) <= MAX_LEN]
    vectors = embed(wanted, ollama_url) if (ollama_url and wanted) else []
    vec_of = dict(zip(wanted, vectors)) if vectors else {}

    for item in items:
        text = str(item.get("text") or "").strip()
        if not (MIN_LEN <= len(text) <= MAX_LEN):
            continue
        kind = str(item.get("kind") or "fact").lower()
        if kind not in KINDS:
            kind = "fact"
        key = _norm(text)
        hit = existing.get(key)
        mine = vec_of.get(text)
        fuzzy_ok = source not in EXACT_ONLY_SOURCES
        if hit is None and mine and fuzzy_ok:
            hit = next((m for m in data["memories"]
                        if m.get("vec") and cosine(m["vec"], mine) >= EMBED_THRESHOLD), None)
        if hit is None and fuzzy_ok:
            # No embedder, or nothing close enough: fall back to word overlap.
            hit = next((m for m in data["memories"] if similar(m.get("text", ""), text)), None)
        if hit is not None:
            hit["seen"] = int(hit.get("seen", 1)) + 1
            hit["updated"] = time.time()
            # Keep the fuller wording: it is usually the more specific one.
            if len(text) > len(hit.get("text", "")):
                hit["text"] = text
            repeated += 1
            continue
        row = {
            "id": uuid.uuid4().hex[:10],
            "vec": mine or [],
            "kind": kind,
            "text": text,
            "source": source,
            "session_id": session_id,
            "seen": 1,
            "created": time.time(),
            "updated": time.time(),
        }
        data["memories"].append(row)
        existing[key] = row
        added += 1
    save(path, data)
    return {"added": added, "repeated": repeated, "total": len(data["memories"])}


# Words that only appear in a negative prompt. A handful of these with no
# sentence around them is a list of things to avoid, not something the user
# wanted - and one such entry sits in the library because the extractor picked
# the wrong side of a graph whose sampler links did not resolve.
_NEGATIVE_MARKERS = {
    "blurry", "worst", "lowres", "artifacts", "deformed", "watermark", "jpeg",
    "airbrushed", "plastic", "oily", "mutated", "extra", "disfigured", "ugly",
    "低", "bad", "poorly", "cropped", "duplicate", "grainy",
}


def looks_negative(text: str) -> bool:
    words = set(_norm(text).split())
    hits = len(words & _NEGATIVE_MARKERS)
    # Comma-separated with no verb reads as a tag list rather than a request.
    dense = text.count(",") >= 4 and " the " not in f" {text.lower()} "
    return hits >= 3 and dense


def derive_from_library(lib: Dict[str, Any], min_runs: int = 4) -> List[Dict[str, str]]:
    """Turn the prompt library into memories, without asking a model anything.

    "You wanna generate that again?" does not need a model to have remembered
    it. The library already records that a prompt ran 43 times, which model it
    used and when - facts, not recollections. Deriving them costs nothing and
    they cannot be hallucinated.
    """
    from collections import Counter

    rows = [r for r in (lib.get("prompts") or []) if r.get("positive")]
    if not rows:
        return []
    out: List[Dict[str, str]] = []

    for r in sorted(rows, key=lambda r: -int(r.get("count", 1))):
        runs = int(r.get("count", 1))
        if runs < min_runs:
            break
        text = " ".join(str(r["positive"]).split())
        if looks_negative(text):
            continue
        gist = text[:110] + ("…" if len(text) > 110 else "")
        out.append({"kind": "entity",
                    "text": f'The user has generated this {runs} times: "{gist}"'})

    models = Counter(r["model"] for r in rows if r.get("model"))
    if models:
        top = models.most_common(3)
        named = ", ".join(f"{m.replace('.safetensors', '')} ({n})" for m, n in top)
        out.append({"kind": "preference",
                    "text": f"The user generates most often with {named}, "
                            f"counted across {len(rows)} distinct prompts."})

    out.append({"kind": "fact",
                "text": f"The user's prompt library holds {len(rows)} distinct prompts "
                        f"taken from {lib.get('images_with_metadata', 0)} generated images."})
    return out


def recall(path: Path, query: str = "", limit: int = 12,
           ollama_url: str = "") -> List[Dict[str, Any]]:
    """The memories worth putting in front of the model for this message.

    Two kinds of relevance, and they are not the same thing:

      * standing preferences apply whatever is being asked, so the ones seen
        more than once are always included - they are instructions, not trivia;
      * everything else is ranked against what the user just said, which is what
        the vectors are for. Without them, fall back to how often each was seen.

    All 25 would fit in a prompt today. They will not at 200, and a memory system
    that only works while it is small is not one - so selection happens now,
    while it can be checked against a list small enough to read.
    """
    data = load(path)
    rows = data["memories"]
    if not rows:
        return []

    standing = [m for m in rows if m.get("kind") == "preference" and int(m.get("seen", 1)) > 1]
    rest = [m for m in rows if m not in standing]

    qvec = embed([query], ollama_url)[:1] if (query.strip() and ollama_url) else []
    if qvec and qvec[0]:
        scored = [(cosine(m.get("vec") or [], qvec[0]), m) for m in rest]
        scored.sort(key=lambda p: -p[0])
        # Below this the match is noise, and filling the prompt with unrelated
        # facts is how a memory system starts making an agent worse.
        picked = [m for score, m in scored if score >= 0.45]
    else:
        picked = sorted(rest, key=lambda m: (-int(m.get("seen", 1)), -float(m.get("created", 0))))

    out = standing + picked
    return out[:limit]


def as_prompt_block(memories: List[Dict[str, Any]]) -> str:
    """Render for a system prompt, grouped so the kinds read differently."""
    if not memories:
        return ""
    order = {"preference": 0, "fact": 1, "entity": 2, "episode": 3}
    rows = sorted(memories, key=lambda m: order.get(m.get("kind", "fact"), 9))
    lines = []
    for m in rows:
        mark = {"preference": "prefers", "fact": "fact", "entity": "returns to",
                "episode": "earlier"}.get(m.get("kind", "fact"), "fact")
        lines.append(f"- ({mark}) {m['text']}")
    return ("What you know about this user, from earlier sessions. Use it when it "
            "helps and never recite it back:\n" + "\n".join(lines) + "\n\n")


def transcript(messages: List[Dict[str, Any]], limit_chars: int = 12000) -> str:
    """Flatten a stored conversation into something a model can read.

    Sessions come from two stores with different field names - `content` in the
    Venice chat, `text` in the chat-edit sessions - so both are accepted rather
    than one of them silently producing an empty transcript.
    """
    lines: List[str] = []
    for m in messages:
        if not isinstance(m, dict):
            continue
        role = str(m.get("role") or "user")
        body = m.get("content")
        if isinstance(body, list):        # multimodal turns
            body = " ".join(str(p.get("text") or "") for p in body if isinstance(p, dict))
        if not body:
            body = m.get("text") or ""
        body = str(body).strip()
        if not body:
            continue
        lines.append(f"{'USER' if role == 'user' else 'AGENT'}: {body}")
    out = "\n".join(lines)
    # Keep the end: the later turns are where conclusions and preferences land.
    return out[-limit_chars:]


def build_prompt(convo: str, known: List[str]) -> str:
    """The instruction. Deliberately the opposite of the old one.

    The previous prompt said "Almost every turn is null", which is why one fact
    was learned in months. This one asks for everything worth keeping and lets
    the dedupe deal with repeats - a duplicate costs nothing, a missed fact is
    gone once the conversation is closed.
    """
    known_block = ""
    if known:
        known_block = ("Already known - do not repeat these, but a NEW detail about "
                       "the same subject is worth having:\n"
                       + "\n".join(f"- {k}" for k in known[:60]) + "\n\n")
    return (
        "You are reading a conversation between a user and an AI assistant inside "
        "an image and video generation app. Pull out everything durable it reveals "
        "about the USER.\n\n"
        + known_block +
        "Return a JSON array. Each element:\n"
        '  {"kind": "preference|fact|entity|episode", "text": "one sentence"}\n\n'
        "kind:\n"
        "  preference - how they like things done, in general, not once\n"
        "  fact       - something true about them, their work, their setup or their characters\n"
        "  entity     - a specific thing they keep using or returning to: a model, a LoRA, a look, a name\n"
        "  episode    - something that happened in this conversation worth recalling later\n\n"
        "Rules:\n"
        "- Write each as a standalone sentence in the third person, starting with "
        '"The user" or a name they gave. It must make sense on its own months later.\n'
        "- Be specific. \"Likes good lighting\" is worthless; \"prefers cool blue "
        "rim light on portraits\" is worth keeping.\n"
        "- Names, projects, characters, tools and numbers are exactly what to keep.\n"
        "- Skip pleasantries, skip what the assistant did, skip anything you are guessing.\n"
        "- Ten good items beat thirty vague ones, but do not hold back a real one.\n"
        "- If the conversation reveals nothing durable, return [].\n\n"
        "Return ONLY the JSON array, no prose, no code fence.\n\n"
        "CONVERSATION:\n" + convo
    )


def parse(raw: str) -> List[Dict[str, str]]:
    """Take the array out of whatever the model wrapped it in."""
    text = (raw or "").strip()
    if text.startswith("```"):
        text = re.sub(r"^```[a-z]*\s*|\s*```$", "", text, flags=re.S).strip()
    start, end = text.find("["), text.rfind("]")
    if start < 0 or end < start:
        return []
    try:
        rows = json.loads(text[start:end + 1])
    except ValueError:
        return []
    out: List[Dict[str, str]] = []
    for r in rows if isinstance(rows, list) else []:
        if isinstance(r, str):
            out.append({"kind": "fact", "text": r})
        elif isinstance(r, dict) and r.get("text"):
            out.append({"kind": str(r.get("kind") or "fact"), "text": str(r["text"])})
    return out
