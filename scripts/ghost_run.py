"""Build every workflow's graph without running it, and report what would fail.

A real run costs minutes of GPU and only tells you about one workflow. Most of
what actually breaks is visible before any sampling starts:

  - the graph will not build at all (registration or file error)
  - it calls a node this install does not have
  - a link points at a node that is not in the graph
  - a required input on a node was never filled
  - it names a model file that is not on disk

Those are checked here against ComfyUI's own /object_info, which is the same
schema it validates a real prompt against.

Not checked, and worth being honest about: whether it runs out of memory,
whether the result looks good, and whether a node errors on values it accepts.
This finds the workflows that cannot start, not the ones that disappoint.
"""
import io
import json
import os
import sys
import urllib.request

APP = os.environ.get("FEDDA_APP") or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# run.ps1 starts ComfyUI on 8199, not the stock 8188.
COMFY = os.environ.get("COMFY_URL", "http://127.0.0.1:8199")
sys.path.insert(0, APP)
sys.path.insert(0, os.path.join(APP, "backend"))
os.chdir(APP)

try:
    from backend.workflow_service import WorkflowService as WS
except Exception:
    from workflow_service import WorkflowService as WS

# The schema is the whole basis of the check, so say plainly when it is
# not reachable instead of failing with a connection traceback.
try:
    with urllib.request.urlopen(f"{COMFY}/object_info", timeout=180) as r:
        SCHEMA = json.loads(r.read())
except Exception as exc:
    print(f"  Could not reach ComfyUI at {COMFY}")
    print(f"  {type(exc).__name__}: {str(exc)[:80]}")
    print("  Start FEDDA first - this checks graphs against ComfyUI's own schema.")
    sys.exit(2)

MODEL_DIRS = [os.path.join(APP, "ComfyUI/models")]
# extra_model_paths adds a second tree; read it so linked models count as present
yml = os.path.join(APP, "ComfyUI/extra_model_paths.yaml")
if os.path.exists(yml):
    for line in io.open(yml, encoding="utf-8"):
        if "base_path:" in line:
            MODEL_DIRS.append(line.split("base_path:", 1)[1].strip())

_index = None
def model_exists(name: str) -> bool:
    """Any file of that name anywhere under the model trees."""
    global _index
    if _index is None:
        _index = set()
        for root in MODEL_DIRS:
            for dp, _, fs in os.walk(root):
                for f in fs:
                    _index.add(f.lower())
    return os.path.basename(name.replace("\\", "/")).lower() in _index


MODEL_EXT = (".safetensors", ".ckpt", ".pt", ".pth", ".bin", ".gguf", ".onnx")

# Plausible values so the graph builds; the point is structure, not output.
BASE = {
    "prompt": "a test", "negative": "", "seed": 1, "steps": 8, "cfg": 1.0,
    "denoise": 1.0, "width": 768, "height": 768, "length": 25, "frames": 25,
    "frame_rate": 24, "fps": 24, "loras": [], "strength": 1.0,
    "image": "test.png", "image2": "", "video": "test.mp4", "audio": "test.mp3",
}

svc = WS("backend/workflows")
cfg = json.load(io.open("config/workflow_api.json", encoding="utf-8"))
wfs = cfg.get("workflows", cfg)

rows = []
for wid in sorted(wfs):
    params = dict(BASE)
    for k, spec in (wfs[wid].get("inputs") or {}).items():
        if k in params:
            continue
        t = (spec or {}).get("type")
        params[k] = 1 if t == "number" else ([] if t == "loras" else "test.png")

    problems = []
    try:
        g = svc.prepare_payload(wid, params)
        if isinstance(g, tuple):
            g = g[0]
        if "prompt" in g and isinstance(g.get("prompt"), dict):
            g = g["prompt"]
    except Exception as exc:
        rows.append((wid, ["BUILD: %s: %s" % (type(exc).__name__, str(exc)[:70])]))
        continue

    for nid, node in g.items():
        if not isinstance(node, dict):
            continue
        ct = node.get("class_type")
        if ct not in SCHEMA:
            problems.append(f"missing node: {ct} (node {nid})")
            continue
        spec = SCHEMA[ct]["input"]
        required = spec.get("required", {})
        given = node.get("inputs") or {}
        for field in required:
            if field not in given:
                problems.append(f"{ct}.{field} not set (node {nid})")
        for field, val in given.items():
            if isinstance(val, list) and len(val) == 2:
                if str(val[0]) not in g:
                    problems.append(f"{ct}.{field} links to missing node {val[0]}")
            elif (isinstance(val, str) and val.lower().endswith(MODEL_EXT)
                  # HuggingFaceDownloader nodes hold a whole download spec -
                  # URLs and target folders - not a filename to look up.
                  and "http" not in val and len(val.splitlines()) == 1):
                if not model_exists(val):
                    problems.append(f"model not found: {val}")
    rows.append((wid, problems))

clean = [w for w, p in rows if not p]
broken = [(w, p) for w, p in rows if p]

print(f"{len(rows)} workflows built without running\n")
print(f"  clean: {len(clean)}")
print(f"  with problems: {len(broken)}\n")
def kind(p):
    if p.startswith("missing node"): return "1 MISSING NODE"
    if p.startswith("model not found"): return "2 MISSING MODEL"
    if p.startswith("BUILD"): return "0 WILL NOT BUILD"
    return "3 UNSET REQUIRED INPUT"

buckets = {}
for wid, probs in broken:
    for p in sorted(set(probs)):
        buckets.setdefault(kind(p), []).append((wid, p))

for k in sorted(buckets):
    print("")
    print(k[2:])
    for wid, p in buckets[k]:
        print(f"   {wid:28} {p[:90]}")

# Non-zero when something would fail, so this can gate an update script
# rather than only being read by a human.
sys.exit(1 if broken else 0)
