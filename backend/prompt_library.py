"""The prompt library, built from what was actually generated.

The file this replaces was scraped in February from three directories that no
longer exist, and it scraped the wrong thing: its `positive` fields hold the
docstrings of Python generator scripts - "GOLD STANDARD DUCOVERY ... 2loras.json
API structure with ALL required parameters" - rather than prompts. 917 of its
1339 entries were category "general". Nothing in the app ever read it, and it is
gitignored, so it shipped to nobody.

ComfyUI writes the whole API graph into every PNG it saves. That is the real
record: every prompt here produced an image someone chose to make, with its own
negative, its model and the workflow that ran it. Nothing has to be scraped or
guessed.

Each entry keeps the image it came from, because a prompt library you cannot look
at is a text file.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# Nodes that hold prompt text as a literal. A graph may carry the text on a
# primitive that feeds the encoder rather than on the encoder itself - registering
# the encoder is how the z-image-inpaint workflow ended up generating "sunset"
# on every run - so both shapes are read.
TEXT_KEYS = {
    "CLIPTextEncode": "text",
    "String Literal": "string",
    "PrimitiveStringMultiline": "value",
    "TextEncodeQwenImageEditPlus": "prompt",
    "CLIPTextEncodeSDXL": "text",
    "easy positive": "positive",
    "easy negative": "negative",
}

MODEL_KEYS = ("unet_name", "ckpt_name")

# Anything shorter is a tag fragment or a leftover placeholder, not a prompt.
MIN_PROMPT_CHARS = 25


def _looks_negative(node: Dict[str, Any]) -> bool:
    title = str((node.get("_meta") or {}).get("title") or "").lower()
    return "negativ" in title or node.get("class_type") == "easy negative"


def _sampler_sides(graph: Dict[str, Any]) -> Tuple[set, set]:
    """Which conditioning nodes reach a sampler's positive and negative inputs.

    Titles are the easy signal but not every graph sets them; the link into the
    sampler is what actually decides which side a piece of text is on.
    """
    pos, neg = set(), set()
    for node in graph.values():
        if not isinstance(node, dict):
            continue
        ins = node.get("inputs") or {}
        for side, bucket in (("positive", pos), ("negative", neg)):
            link = ins.get(side)
            if isinstance(link, list) and link:
                bucket.add(str(link[0]))
    return pos, neg


# Only these inputs can carry prompt text onward. Following every link instead
# made a negative encoder with empty text wander out through `clip` or `image`
# and come back with the positive prompt: 33 of 143 entries had a negative
# identical to their positive before this was narrowed.
TEXT_LINKS = ("text", "text_a", "text_b", "string", "value", "prompt",
              "conditioning", "positive", "negative", "text_input", "string_a", "string_b")


def _walk_back(graph: Dict[str, Any], node_id: str, depth: int = 0) -> Optional[str]:
    """Follow a conditioning node back to the literal text behind it."""
    if depth > 6:
        return None
    node = graph.get(node_id)
    if not isinstance(node, dict):
        return None
    cls = node.get("class_type") or ""
    key = TEXT_KEYS.get(cls)
    ins = node.get("inputs") or {}
    if key:
        val = ins.get(key)
        if isinstance(val, str) and len(val.strip()) >= MIN_PROMPT_CHARS:
            return val.strip()
    for name, val in ins.items():
        if name not in TEXT_LINKS:
            continue
        if isinstance(val, list) and val:
            found = _walk_back(graph, str(val[0]), depth + 1)
            if found:
                return found
    return None


def extract(graph: Dict[str, Any]) -> Dict[str, Any]:
    """Positive, negative, model and workflow hint from one saved graph."""
    pos_ids, neg_ids = _sampler_sides(graph)
    positive = negative = ""
    for nid in pos_ids:
        positive = positive or (_walk_back(graph, nid) or "")
    for nid in neg_ids:
        negative = negative or (_walk_back(graph, nid) or "")

    # No sampler links resolved: fall back to titles, then to the longest text.
    if not positive:
        loose = []
        for nid, node in graph.items():
            if not isinstance(node, dict):
                continue
            key = TEXT_KEYS.get(node.get("class_type") or "")
            if not key:
                continue
            val = (node.get("inputs") or {}).get(key)
            if isinstance(val, str) and len(val.strip()) >= MIN_PROMPT_CHARS:
                (loose if not _looks_negative(node) else []).append(val.strip())
                if _looks_negative(node) and not negative:
                    negative = val.strip()
        if loose:
            positive = max(loose, key=len)

    # A graph that ends up with the same text on both sides tells us nothing
    # about what to avoid, and it is always an extraction artefact rather than
    # something anyone typed twice.
    if negative and negative.strip() == positive.strip():
        negative = ""

    model = ""
    prefix = ""
    for node in graph.values():
        if not isinstance(node, dict):
            continue
        ins = node.get("inputs") or {}
        for k in MODEL_KEYS:
            if not model and isinstance(ins.get(k), str):
                model = os.path.basename(str(ins[k]).replace("\\", "/"))
        if not prefix and node.get("class_type") == "SaveImage":
            p = ins.get("filename_prefix")
            if isinstance(p, str) and p and p != "ComfyUI":
                prefix = p
    return {"positive": positive, "negative": negative, "model": model, "prefix": prefix}


def build(output_dir: Path, limit: int = 4000) -> Dict[str, Any]:
    """Scan generated images and return the library.

    Deduplicated on the prompt text: the same prompt run ten times is one entry
    with the newest image, not ten rows of the same sentence.
    """
    from PIL import Image  # local: a missing Pillow must not break server import

    files = [p for p in output_dir.rglob("*.png")]
    files.sort(key=lambda p: p.stat().st_mtime, reverse=True)

    seen: Dict[str, Dict[str, Any]] = {}
    scanned = 0
    for path in files[:limit]:
        try:
            info = Image.open(path).info
        except Exception:  # noqa: BLE001 - a corrupt output is not fatal
            continue
        raw = info.get("prompt")
        if not raw:
            continue
        scanned += 1
        try:
            graph = json.loads(raw)
        except (ValueError, TypeError):
            continue
        if not isinstance(graph, dict):
            continue
        found = extract(graph)
        text = found["positive"]
        if not text or len(text) < MIN_PROMPT_CHARS:
            continue
        key = " ".join(text.lower().split())[:400]
        if key in seen:
            seen[key]["count"] += 1
            continue
        rel = path.relative_to(output_dir).as_posix()
        seen[key] = {
            "id": f"p{len(seen) + 1}",
            "positive": text,
            "negative": found["negative"],
            "model": found["model"],
            "prefix": found["prefix"],
            "image": rel,
            "mtime": path.stat().st_mtime,
            "count": 1,
        }

    rows = sorted(seen.values(), key=lambda r: -r["mtime"])
    return {
        "generated_at": __import__("datetime").datetime.now().isoformat(timespec="seconds"),
        "source": "comfyui-output-metadata",
        "images_with_metadata": scanned,
        "images_seen": len(files),
        "total_prompts": len(rows),
        "prompts": rows,
    }
