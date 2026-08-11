"""Check every workflow's wiring against reality, in one pass.

Written after finding the same class of defect four times in one day, each time
because the user happened to open the page: a workflow finished and switched off
(sdxl-outpaint, both FLUX txt2img), and controls registered against nodes that
could not receive them (outpaint's edges, FLUX's size, dual-lora's shift).

Prose documentation would not have caught any of them. These are checks:

  1. dangling      - a registered input points at a node that is not in the graph
  2. not-an-input  - the node exists but has no such input key
  3. linked        - the input is fed by another node, so a value sent from the
                     UI is silently ignored (this is the "inert control" bug)
  4. orphan-graph  - a graph file no module or workflow entry references
  5. hidden        - a module is off the home screen; says whether its graph
                     would actually run, so "hidden because broken" can be told
                     apart from "hidden on purpose"
  6. missing-nodes - class_type absent from a live ComfyUI's /object_info
  7. missing-model - a named checkpoint/LoRA/VAE that ComfyUI cannot offer

ComfyUI is optional: without it, checks 6 and 7 are skipped and the rest still
run. Exits non-zero if anything in 1-3 is found, since those are always bugs.

    python scripts/audit_wiring.py            # summary
    python scripts/audit_wiring.py --verbose  # every finding
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

ROOT = Path(__file__).resolve().parent.parent
WORKFLOW_API = ROOT / "config" / "workflow_api.json"
MODULES = ROOT / "config" / "modules.json"
WORKFLOW_DIR = ROOT / "backend" / "workflows"
REGISTRY_TS = ROOT / "frontend" / "src" / "modules" / "registry.ts"
COMFY = "http://127.0.0.1:8199"

# Only widgets that actually name a file on disk. Checking every string input
# reported prompts and placeholder uploads as missing models.
MODEL_KEY = re.compile(
    r"^(ckpt|lora|vae|unet|clip|clip_vision|control_net|controlnet|style_model|"
    r"gligen|model|upscale_model|sam|bbox|segm|detector|ipadapter|instantid)?_?name$"
    r"|^(ckpt_name|lora_name|vae_name|unet_name|clip_name|model_name)$")
UPLOAD_NODES = {"LoadImageMask", "VHS_LoadVideo", "LoadAudio", "ImageFromBatch"}
# Mirrors _SKIP_TYPES in backend/server.py - keep in step with it.
SKIP_TYPES = {"loras", "object", "nsfw_toggle"}


def sep_key(value: str) -> str:
    """Compare model paths without arguing about slashes.

    A graph saved on Windows says `Antigravity\\z-image\\x.safetensors` where
    ComfyUI on Linux offers forward slashes; server.py already normalises this at
    submit time, so flagging it here would be reporting a difference the app
    handles.
    """
    return value.replace("\\", "/").lower()


def safe_print(text: str) -> None:
    """Console here is cp1252; a model name with an arrow in it crashed the run."""
    try:
        print(text)
    except UnicodeEncodeError:
        enc = sys.stdout.encoding or "ascii"
        print(text.encode(enc, "replace").decode(enc, "replace"))


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8-sig"))


def comfy_object_info() -> Optional[Dict[str, Any]]:
    try:
        import urllib.request
        with urllib.request.urlopen(f"{COMFY}/object_info", timeout=25) as r:
            return json.load(r)
    except Exception:
        return None


def combo_options(oi: Dict[str, Any], cls: str, key: str) -> Optional[List[str]]:
    """Pull the allowed values for a widget, across both object_info shapes.

    The V3 schema answers ["COMBO", {"options": [...]}] where the older one
    answered [[...]], and reading only one of them silently checks nothing.
    """
    spec = ((oi.get(cls) or {}).get("input") or {}).get("required", {}).get(key)
    if not spec:
        spec = ((oi.get(cls) or {}).get("input") or {}).get("optional", {}).get(key)
    if not spec:
        return None
    for part in spec:
        if isinstance(part, list):
            return [str(x) for x in part]
        if isinstance(part, dict):
            for k in ("options", "choices", "values"):
                if k in part and isinstance(part[k], list):
                    return [str(x) for x in part[k]]
    return None


def hidden_modules() -> List[Tuple[str, List[str], Optional[str]]]:
    """(id, workflows, sourceModuleId) for frontend entries carrying hidden:true.

    The frontend entry declares its own `workflows`, and its `sourceModuleId`
    points at the install pack in modules.json - which is keyed by the pack id,
    not by the entry id. Looking it up by entry id reports every hidden module as
    declaring nothing.
    """
    if not REGISTRY_TS.exists():
        return []
    src = REGISTRY_TS.read_text(encoding="utf-8", errors="replace")
    out: List[Tuple[str, List[str], Optional[str]]] = []
    for m in re.finditer(r"id:\s*'([^']+)'", src):
        start = m.end()
        nxt = src.find("id: '", start)
        chunk = src[start: nxt if nxt > 0 else len(src)]
        if not re.search(r"\bhidden:\s*true", chunk):
            continue
        wfs = re.search(r"workflows:\s*\[([^\]]*)\]", chunk)
        listed = re.findall(r"'([^']+)'", wfs.group(1)) if wfs else []
        src_id = re.search(r"sourceModuleId:\s*'([^']+)'", chunk)
        out.append((m.group(1), listed, src_id.group(1) if src_id else None))
    return out


def module_workflows() -> Dict[str, List[str]]:
    try:
        mods = load_json(MODULES).get("modules") or []
    except Exception:
        return {}
    return {m.get("id"): (m.get("workflows") or []) for m in mods}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()

    cfg = load_json(WORKFLOW_API)
    oi = comfy_object_info()
    print(f"workflows registered : {len(cfg)}")
    print(f"ComfyUI              : {'up, node/model checks on' if oi else 'down, node/model checks skipped'}\n")

    dangling: List[str] = []
    not_input: List[str] = []
    linked: List[str] = []
    missing_nodes: List[str] = []
    missing_model: List[str] = []
    unreadable: List[str] = []
    referenced: set[str] = set()

    for wid, entry in cfg.items():
        rel = entry.get("filename")
        if not rel:
            unreadable.append(f"{wid}: no filename")
            continue
        path = WORKFLOW_DIR / rel
        referenced.add(path.resolve().as_posix().lower())
        try:
            graph = load_json(path)
        except Exception as exc:
            unreadable.append(f"{wid}: {type(exc).__name__} reading {rel}")
            continue

        for name, spec in (entry.get("inputs") or {}).items():
            # server.py's _SKIP_TYPES: these never go through node_id/input_key
            # at all - LoRA stacks and slot objects are injected by dedicated
            # code, and nsfw toggles by their own path. Checking them against
            # the generic mechanism reported 25 bugs that were not bugs.
            if spec.get("type") in SKIP_TYPES:
                continue
            # Both spellings exist in the config.
            keys = spec.get("input_keys") or [spec.get("input_key")]
            ids = spec.get("node_ids") or [spec.get("node_id")]
            for nid in ids:
                node = graph.get(str(nid))
                if node is None:
                    dangling.append(f"{wid}.{name} -> node {nid} missing")
                    continue
                inputs = node.get("inputs") or {}
                for key in keys:
                    if key not in inputs:
                        not_input.append(
                            f"{wid}.{name} -> {nid}({node.get('class_type')}) has no input '{key}'")
                    elif isinstance(inputs[key], list):
                        linked.append(
                            f"{wid}.{name} -> {nid}({node.get('class_type')}).{key} is fed by "
                            f"node {inputs[key][0]}, so a UI value cannot reach it")

        if oi:
            for nid, node in graph.items():
                if not isinstance(node, dict):
                    continue
                cls = node.get("class_type")
                if not cls:
                    continue
                if cls not in oi:
                    missing_nodes.append(f"{wid}: {cls} (node {nid}) not installed")
                    continue
                for k, v in (node.get("inputs") or {}).items():
                    if not isinstance(v, str) or not MODEL_KEY.match(k):
                        continue
                    # LoadImage.image names a placeholder the user replaces at
                    # run time; absent is normal, not a missing model.
                    if cls.startswith("LoadImage") or cls in UPLOAD_NODES:
                        continue
                    opts = combo_options(oi, cls, k)
                    if opts is None:
                        continue
                    if v in opts or sep_key(v) in {sep_key(o) for o in opts}:
                        continue
                    missing_model.append(f"{wid}: {cls}.{k} = {v!r} not available")

    # graph files nothing points at
    orphans = []
    for path in sorted(WORKFLOW_DIR.rglob("*.json")):
        if path.resolve().as_posix().lower() not in referenced:
            orphans.append(path.relative_to(WORKFLOW_DIR).as_posix())

    # hidden modules, and whether they would run
    mw = module_workflows()
    hidden_report: List[Tuple[str, str]] = []
    broken_ids = {f.split(":")[0].split(".")[0] for f in missing_nodes + missing_model}
    for mid, own_wfs, src_id in hidden_modules():
        wfs = own_wfs or mw.get(src_id or mid) or mw.get(mid) or []
        if not wfs:
            hidden_report.append((mid, "declares no workflows anywhere"))
            continue
        unregistered = [w for w in wfs if w not in cfg]
        bad = [w for w in wfs if w in broken_ids]
        if unregistered:
            hidden_report.append((mid, f"not in workflow_api.json: {', '.join(unregistered)}"))
        elif bad:
            hidden_report.append((mid, f"would fail: {', '.join(bad)}"))
        else:
            hidden_report.append((mid, f"graph is fine ({', '.join(wfs)}) - hidden on purpose?"))

    def report(title: str, items: List[str], always_show: bool = False) -> None:
        if not items and not always_show:
            print(f"  OK    {title}")
            return
        print(f"  {len(items):<4}  {title}")
        if args.verbose or len(items) <= 6:
            for i in items:
                safe_print(f"          {i}")

    print("BUGS (a control that cannot work)")
    report("registered input points at a missing node", dangling)
    report("registered input is not an input of that node", not_input)
    report("registered input is fed by a link - UI value ignored", linked)

    print("\nINSTALL")
    report("node classes not installed", missing_nodes)
    report("models named but not available", missing_model)
    report("workflow files that could not be read", unreadable)

    print("\nREACHABILITY")
    report("graph files nothing references", orphans)
    if hidden_report:
        print(f"  {len(hidden_report):<4}  modules hidden from the home screen")
        for mid, note in hidden_report:
            safe_print(f"          {mid}: {note}")
    else:
        print("  OK    no hidden modules")

    hard = len(dangling) + len(not_input) + len(linked)
    print(f"\n{'FAIL' if hard else 'PASS'}: {hard} wiring bug(s)")
    return 1 if hard else 0


if __name__ == "__main__":
    sys.exit(main())
