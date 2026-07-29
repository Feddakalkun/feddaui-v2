"""Fetch + extract the tested FEDDA custom_nodes bundle.

Instead of git-cloning ~130 node packs (fragile URLs, version drift), a fresh
install pulls ONE frozen, tested bundle from the FeddaKalkun HF mirror and
extracts it into ComfyUI/custom_nodes. Dependency installation for the packs a
workflow actually uses is handled separately by the normal node-dep step.

Usage:
  python scripts/fetch_node_bundle.py                 # download from mirror + extract
  python scripts/fetch_node_bundle.py --dry-run       # list packs in the bundle, no extract
  python scripts/fetch_node_bundle.py --source <path> # use a local .tar.gz instead of the mirror
  python scripts/fetch_node_bundle.py --dest <dir>    # override the custom_nodes target
"""
import argparse
import sys
import tarfile
import tempfile
import urllib.request
from pathlib import Path

MIRROR_URL = (
    "https://huggingface.co/datasets/FeddaKalkun/fedda-mirror/"
    "resolve/main/custom_nodes/fedda-custom-nodes.tar.gz"
)
ROOT = Path(__file__).resolve().parent.parent  # app root (…/app)
DEFAULT_DEST = ROOT / "ComfyUI" / "custom_nodes"


def _download(url: str, dest: Path) -> None:
    print(f"  downloading bundle from mirror ...\n    {url}")
    with urllib.request.urlopen(url, timeout=60) as resp:
        total = int(resp.headers.get("X-Linked-Size") or resp.headers.get("Content-Length") or 0)
        done = 0
        chunk = 1024 * 1024
        with open(dest, "wb") as f:
            while True:
                buf = resp.read(chunk)
                if not buf:
                    break
                f.write(buf)
                done += len(buf)
                if total:
                    pct = done * 100 // total
                    print(f"\r    {pct:3d}%  {done/1e9:.2f} / {total/1e9:.2f} GB", end="", flush=True)
        print()


def _pack_names(tar: tarfile.TarFile):
    packs = set()
    for name in tar.getnames():
        parts = name.split("/")
        if len(parts) >= 2 and parts[0] == "custom_nodes" and parts[1] and not parts[1].startswith("."):
            packs.add(parts[1])
    return sorted(packs)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", default=MIRROR_URL, help="mirror URL or local .tar.gz path")
    ap.add_argument("--dest", default=str(DEFAULT_DEST), help="custom_nodes dir to extract into")
    ap.add_argument("--dry-run", action="store_true", help="list packs, do not extract")
    args = ap.parse_args()

    dest = Path(args.dest)
    src = args.source
    is_url = src.startswith("http://") or src.startswith("https://")

    tmp = None
    try:
        if is_url:
            tmp = Path(tempfile.gettempdir()) / "fedda-custom-nodes.tar.gz"
            _download(src, tmp)
            archive = tmp
        else:
            archive = Path(src)
            if not archive.is_file():
                print(f"ERROR: source not found: {archive}")
                return 1

        with tarfile.open(archive, "r:gz") as tar:
            packs = _pack_names(tar)
            print(f"  bundle contains {len(packs)} node packs")
            if args.dry_run:
                for p in packs:
                    print("   ", p)
                return 0
            # Extract into the PARENT of custom_nodes (the archive root IS 'custom_nodes/')
            dest.parent.mkdir(parents=True, exist_ok=True)
            print(f"  extracting into {dest} ...")
            tar.extractall(dest.parent)
        print(f"  done — {len(packs)} packs in {dest}")
        return 0
    finally:
        if tmp and tmp.exists():
            try:
                tmp.unlink()
            except OSError:
                pass


if __name__ == "__main__":
    sys.exit(main())
