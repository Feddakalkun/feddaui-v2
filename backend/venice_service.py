"""Venice.ai, behind the backend instead of in front of it.

Both Venice pages called api.venice.ai straight from the browser with the key in
localStorage. That works, and it costs three things:

  1. the key is readable by anything running on the page,
  2. the backend cannot use Venice at all - so a vision model that actually
     reads its prompt is out of reach of `_caption_prompt_for_context`, which is
     the one thing that would fix joycaption ignoring its instructions,
  3. every failure arrives as an opaque fetch error. A rejected key, an empty
     balance and a rate limit are the same red box.

The key now lives in `config/runtime_settings.json` beside `hf_token` and
`civitai_api_key` - gitignored, never committed. Calls go through here, and the
failure modes are told apart and named.

Only the endpoints the app uses are wrapped. A blind pass-through proxy would let
the frontend reach anything at api.venice.ai, including the account and billing
mutations, which is not a capability a page should have.
"""
from __future__ import annotations

from typing import Any, Dict, Optional, Tuple

import requests

BASE = "https://api.venice.ai/api/v1"

# Image generation is the slow one; Venice queues rather than streams, so this is
# wall-clock for a whole render rather than time-to-first-byte.
TIMEOUT_FAST = 30
TIMEOUT_SLOW = 300


class VeniceError(Exception):
    """A Venice call that failed in a way worth telling the user apart.

    `kind` is what the UI switches on; `detail` is what it shows.
    """

    def __init__(self, kind: str, detail: str, status: int = 0):
        super().__init__(detail)
        self.kind = kind
        self.detail = detail
        self.status = status

    def as_dict(self) -> Dict[str, Any]:
        return {"success": False, "error": self.kind, "detail": self.detail,
                "status": self.status}


def _headers(key: str) -> Dict[str, str]:
    return {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}


def _classify(resp: requests.Response) -> VeniceError:
    """Turn an HTTP failure into something the UI can act on.

    The messages say what to do, not what went wrong: "the key was rejected" is
    useless without "check it in the top bar".
    """
    try:
        body = resp.json()
        said = str(body.get("error") or body.get("detail") or body.get("message") or "")
    except Exception:  # noqa: BLE001 - an error page is not always JSON
        said = (resp.text or "")[:200]

    if resp.status_code in (401, 403):
        return VeniceError("bad_key",
                           "Venice rejected the API key. Check it in the top bar."
                           + (f" ({said})" if said else ""), resp.status_code)
    if resp.status_code == 402:
        return VeniceError("no_credit",
                           "Venice reports no remaining balance for this key."
                           + (f" ({said})" if said else ""), resp.status_code)
    if resp.status_code == 429:
        retry = resp.headers.get("retry-after") or ""
        return VeniceError("rate_limited",
                           "Venice rate limit reached"
                           + (f"; retry after {retry}s" if retry else "")
                           + (f". {said}" if said else "."), resp.status_code)
    if resp.status_code >= 500:
        return VeniceError("upstream",
                           f"Venice returned {resp.status_code}. This is their side, not yours.",
                           resp.status_code)
    return VeniceError("failed", said or f"Venice returned {resp.status_code}.",
                       resp.status_code)


def call(key: str, method: str, path: str, payload: Optional[Dict[str, Any]] = None,
         params: Optional[Dict[str, Any]] = None, timeout: int = TIMEOUT_FAST) -> Dict[str, Any]:
    """One Venice request. Raises VeniceError; never returns a failure quietly."""
    if not (key or "").strip():
        raise VeniceError("no_key", "No Venice API key is set. Add one in the top bar.")
    url = f"{BASE}{path}"
    try:
        resp = requests.request(method, url, headers=_headers(key), json=payload,
                                params=params, timeout=timeout)
    except requests.exceptions.Timeout:
        raise VeniceError("timeout", f"Venice did not answer within {timeout}s.")
    except requests.exceptions.RequestException as exc:
        raise VeniceError("unreachable", f"Could not reach Venice: {exc}")
    if not resp.ok:
        raise _classify(resp)
    try:
        return resp.json()
    except ValueError:
        raise VeniceError("failed", "Venice returned a response that is not JSON.")


# ── the endpoints the app uses ──────────────────────────────────────────────

def models(key: str, kind: str = "") -> Dict[str, Any]:
    """`kind` is Venice's `type` filter: image, text, embedding, tts, video."""
    return call(key, "GET", "/models", params={"type": kind} if kind else None)


def chat(key: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    return call(key, "POST", "/chat/completions", payload, timeout=TIMEOUT_SLOW)


def chat_stream(key: str, payload: Dict[str, Any]):
    """Server-sent events, forwarded byte for byte.

    The Venice chat page reads tokens as they arrive and parses tool calls out of
    the SSE frames mid-flight. Buffering the whole answer here to re-serialise it
    would turn a live reply into a silent wait, so nothing is decoded on the way
    through. The first chunk is pulled by the caller inside its try block, which
    is what lets an auth or rate-limit failure surface as an error instead of as
    an empty stream.
    """
    if not (key or "").strip():
        raise VeniceError("no_key", "No Venice API key is set. Add one in the top bar.")
    try:
        resp = requests.post(f"{BASE}/chat/completions", headers=_headers(key),
                             json=payload, stream=True, timeout=TIMEOUT_SLOW)
    except requests.exceptions.RequestException as exc:
        raise VeniceError("unreachable", f"Could not reach Venice: {exc}")
    if not resp.ok:
        raise _classify(resp)
    for chunk in resp.iter_content(chunk_size=None):
        if chunk:
            yield chunk


# Uncensored is the point: joycaption was picked locally because it describes
# explicit imagery, and a captioner that refuses is useless here. This one also
# does not reason, so `content` is actually populated rather than left null with
# the text in `reasoning_content`. Cheapest of the uncensored vision models at
# $0.20/M input.
DEFAULT_VISION_MODEL = "venice-uncensored-1-2"


def caption(key: str, image_b64: str, instruction: str,
            model: str = "", mime: str = "image/png") -> Tuple[str, str]:
    """Describe an image, following the instruction it is given.

    This is the reason the key had to leave the browser. joycaption ignores its
    prompt - `CLAUDE.md` says so, and the workarounds are in this file - which
    means `_caption_prompt_for_context` and every profile in
    prompt_profiles.json have no effect while it is the selected captioner. A
    model that reads its instruction makes those profiles real.

    Returns (text, model_used) so the caller can say which one answered.
    """
    used = (model or "").strip() or DEFAULT_VISION_MODEL
    payload = {
        "model": used,
        "messages": [{
            "role": "user",
            "content": [
                {"type": "text", "text": instruction},
                {"type": "image_url",
                 "image_url": {"url": f"data:{mime};base64,{image_b64}"}},
            ],
        }],
        "max_tokens": 400,
        "temperature": 0.2,
    }
    data = call(key, "POST", "/chat/completions", payload, timeout=TIMEOUT_SLOW)
    choice = ((data.get("choices") or [{}])[0].get("message") or {})
    text = (choice.get("content") or "").strip()
    if not text:
        # A reasoning model can spend the whole budget thinking and return null
        # content. Saying so beats handing back an empty caption that looks like
        # the picture had nothing in it.
        if (choice.get("reasoning_content") or "").strip():
            raise VeniceError(
                "empty_answer",
                f"{used} reasoned but never wrote a caption. Pick a non-reasoning "
                f"vision model, such as {DEFAULT_VISION_MODEL}.")
        raise VeniceError("empty_answer", f"{used} returned an empty caption.")
    return text, used


def image_generate(key: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    return call(key, "POST", "/image/generate", payload, timeout=TIMEOUT_SLOW)


def image_styles(key: str) -> Dict[str, Any]:
    return call(key, "GET", "/image/styles")


def balance(key: str) -> Dict[str, Any]:
    return call(key, "GET", "/billing/balance")


def rate_limits(key: str) -> Dict[str, Any]:
    return call(key, "GET", "/api_keys/rate_limits")


def check(key: str) -> Dict[str, Any]:
    """Is this key usable, and what is left on it?

    Used by the key-status endpoint, so the top bar can say "set and working"
    rather than "set", which is what localStorage could ever tell anyone.
    """
    out: Dict[str, Any] = {"configured": bool((key or "").strip())}
    if not out["configured"]:
        return out
    try:
        out["balance"] = balance(key)
        out["valid"] = True
    except VeniceError as exc:
        out["valid"] = exc.kind not in ("bad_key",)
        out["error"] = exc.kind
        out["detail"] = exc.detail
    return out
