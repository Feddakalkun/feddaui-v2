"""Fetch a workflow's models in parallel, resumably, and verify them.

Why this exists: FEDDA has three download paths and they differ by ~80x.

    ComfyUI HuggingFaceDownloader node   1-7 MB/s   one file, one stream, no retry
    backend /api/workflow/download-models  ~105 MB/s   concurrent
    this script                            ~99 MB/s   concurrent

The node is what you hit whenever a graph is run directly in ComfyUI rather than
through the app, and there is no way to make it concurrent from outside. HF also
throttles per connection - two 6.9 GB files pulled at the same moment finished
minutes apart - so parallelism, not raw bandwidth, is what makes this fast.

It also verifies, which the node does not. A half-written .safetensors is the
right shape but fails at load with:

    SafetensorError: Error while deserializing header: incomplete metadata,
    file not fully covered

That error reads like corruption and sends you looking for a bad download, when
the file is simply still arriving. Comparing against the remote size says so
plainly.

Usage:
    fetch_models.py ltx-flf                  # manifest for one workflow
    fetch_models.py --all                    # ALL-MODELS.txt
    fetch_models.py path/to/manifest.txt     # explicit path
    fetch_models.py --verify ltx-flf         # check only, download nothing
    fetch_models.py -j 6 ltx-flf             # concurrency (default 4)

Manifest line format, matching config/model_manifests/:  URL folder [filename]
"""
from __future__ import annotations

import argparse
import json
import os
import struct
import sys
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODELS = os.path.join(ROOT, "ComfyUI", "models")
MANIFESTS = os.path.join(ROOT, "config", "model_manifests")
SETTINGS = os.path.join(ROOT, "config", "runtime_settings.json")
CHUNK = 1 << 20

_print_lock = threading.Lock()


def say(msg: str) -> None:
    with _print_lock:
        print(msg, flush=True)


def hf_token() -> str:
    try:
        with open(SETTINGS, encoding="utf-8") as fh:
            return (json.load(fh) or {}).get("hf_token") or ""
    except Exception:
        return ""


def parse_manifest(path: str):
    """-> [(url, folder, filename)]. Ignores comments and blank lines."""
    out = []
    with open(path, encoding="utf-8") as fh:
        for raw in fh:
            line = raw.strip()
            if not line or line.startswith("#"):
                continue
            parts = line.split()
            if len(parts) < 2 or not parts[0].startswith("http"):
                continue
            url, folder = parts[0], parts[1]
            name = parts[2] if len(parts) >= 3 else os.path.basename(url.split("?")[0])
            out.append((url, folder, name))
    return out


def remote_size(url: str, headers: dict) -> int:
    """HF serves the real size as x-linked-size; content-length is the redirect."""
    try:
        r = requests.head(url, headers=headers, allow_redirects=True, timeout=30)
        for key in ("x-linked-size", "content-length"):
            if key in r.headers:
                return int(r.headers[key])
    except Exception:
        pass
    return 0


def header_ok(path: str) -> bool:
    """A .safetensors whose header parses is almost certainly whole."""
    try:
        with open(path, "rb") as fh:
            n = struct.unpack("<Q", fh.read(8))[0]
            if n <= 0 or n > 200_000_000:
                return False
            json.loads(fh.read(n))
        return True
    except Exception:
        return False


def fetch_one(url, folder, name, token, verify_only):
    dest_dir = os.path.join(MODELS, *folder.split("/"))
    dest = os.path.join(dest_dir, name)
    headers = {"Authorization": f"Bearer {token}"} if (token and "huggingface.co" in url) else {}

    total = remote_size(url, headers)
    have = os.path.getsize(dest) if os.path.exists(dest) else 0

    if total and have == total:
        if name.endswith(".safetensors") and not header_ok(dest):
            return ("BAD", name, "size matches but header will not parse - delete and refetch")
        return ("SKIP", name, "already complete")

    if verify_only:
        if have == 0:
            return ("MISSING", name, "not downloaded")
        pct = (have / total * 100) if total else 0
        return ("PARTIAL", name, "%d of %d bytes (%.1f%%)" % (have, total, pct))

    os.makedirs(dest_dir, exist_ok=True)
    if have and total:
        headers["Range"] = f"bytes={have}-"
        say("  resume   %-46s from %.2f GB" % (name, have / 1024**3))
    else:
        say("  start    %-46s %.2f GB" % (name, (total or 0) / 1024**3))

    try:
        with requests.get(url, headers=headers, stream=True, timeout=60) as r:
            r.raise_for_status()
            # 200 to a Range request means the server ignored it - restart cleanly
            mode = "ab" if (have and r.status_code == 206) else "wb"
            with open(dest, mode) as fh:
                for chunk in r.iter_content(CHUNK):
                    if chunk:
                        fh.write(chunk)
    except Exception as exc:
        return ("FAIL", name, str(exc)[:70])

    got = os.path.getsize(dest)
    if total and got != total:
        return ("FAIL", name, "got %d of %d bytes" % (got, total))
    if name.endswith(".safetensors") and not header_ok(dest):
        return ("BAD", name, "downloaded but header will not parse")
    return ("OK", name, "%.2f GB verified" % (got / 1024**3))


def resolve(target: str) -> str:
    if target == "--all":
        return os.path.join(MANIFESTS, "ALL-MODELS.txt")
    if os.path.exists(target):
        return target
    guess = os.path.join(MANIFESTS, target if target.endswith(".txt") else target + ".txt")
    if os.path.exists(guess):
        return guess
    sys.exit("no manifest for %r (looked in %s)" % (target, MANIFESTS))


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("target", help="workflow id, manifest path, or --all")
    ap.add_argument("-j", "--jobs", type=int, default=4, help="concurrent downloads (default 4)")
    ap.add_argument("--verify", action="store_true", help="report status only, download nothing")
    args = ap.parse_args()

    path = resolve(args.target)
    items = parse_manifest(path)
    token = hf_token()
    print("%s: %d model(s) | token %s | %s\n"
          % (os.path.basename(path), len(items), "yes" if token else "NO (rate limited)",
             "verify only" if args.verify else "%d parallel" % args.jobs))

    results = []
    with ThreadPoolExecutor(max_workers=1 if args.verify else args.jobs) as pool:
        futures = [pool.submit(fetch_one, u, f, n, token, args.verify) for u, f, n in items]
        for fut in as_completed(futures):
            status, name, detail = fut.result()
            say("  %-9s %-46s %s" % (status, name, detail))
            results.append(status)

    bad = [s for s in results if s in ("FAIL", "BAD", "MISSING", "PARTIAL")]
    print("\n%d ok/skipped, %d need attention" % (len(results) - len(bad), len(bad)))
    if any(s in ("BAD",) for s in results):
        print("BAD = right size but unreadable header. Delete the file and re-run.")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
