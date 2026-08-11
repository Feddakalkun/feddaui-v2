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


# The edit models are NOT in /models?type=image - they live only in the enum on
# /image/edit, which is why a look at the catalogue suggests Venice has no
# FireRed or uncensored Qwen. It has both.
EDIT_MODELS = [
    "firered-image-edit",
    "qwen-edit-uncensored",
    "qwen-image-3-edit",
    "qwen-image-3-pro-edit",
    "qwen-image-2-edit",
    "qwen-image-2-pro-edit",
    "flux-2-max-edit",
    "wan-2-7-pro-edit",
    "seedream-v5-pro-edit",
    "nano-banana-pro-edit",
    "grok-imagine-quality-edit",
]
# FireRed is the general-purpose default: it follows an edit instruction and
# leaves the rest of the picture alone. qwen-edit-uncensored is kept in the
# list for the narrower case the user reserves it for - explicit anatomy that
# other models decline or soften - rather than as the everyday choice.
DEFAULT_EDIT_MODEL = "firered-image-edit"


def image_edit(key: str, image_b64: str, prompt: str, model: str = "",
               output_format: str = "png", safe_mode: bool = False) -> Tuple[bytes, str]:
    """Change a picture that already exists, rather than making a new one.

    The chat agent had only a generate tool, so "remove her top, keep the denim
    jacket" against an attached photo produced an unrelated new image - the
    request read as a description to draw rather than an instruction to follow.

    Unlike /image/generate, which answers JSON with base64 inside, this endpoint
    returns the image **bytes** with an image/* content type. Sending it through
    `call` gets "response is not JSON", which is what it said the first time.

    Returns (image bytes, model used).
    """
    if not (key or "").strip():
        raise VeniceError("no_key", "No Venice API key is set. Add one in the top bar.")
    if not (prompt or "").strip():
        raise VeniceError("failed", "An edit needs an instruction.")
    used = (model or "").strip() or DEFAULT_EDIT_MODEL
    payload = {
        "image": image_b64,
        "prompt": prompt,
        "model": used,
        "output_format": output_format,
        "safe_mode": safe_mode,
    }
    try:
        resp = requests.post(f"{BASE}/image/edit", headers=_headers(key),
                             json=payload, timeout=TIMEOUT_SLOW)
    except requests.exceptions.Timeout:
        raise VeniceError("timeout", f"Venice did not answer within {TIMEOUT_SLOW}s.")
    except requests.exceptions.RequestException as exc:
        raise VeniceError("unreachable", f"Could not reach Venice: {exc}")
    if not resp.ok:
        raise _classify(resp)
    # Venice flags a refusal in a header rather than an error status, so an edit
    # it declined would otherwise arrive as a blurred picture with no reason.
    if str(resp.headers.get("x-venice-is-content-violation", "")).lower() == "true":
        raise VeniceError("refused",
                          "Venice flagged this edit as a content violation and blurred it. "
                          "Safe mode is already off; the model itself declined.")
    if not resp.content:
        raise VeniceError("empty_answer", f"{used} returned no image.")
    return resp.content, (resp.headers.get("x-venice-model-id") or used)


def image_styles(key: str) -> Dict[str, Any]:
    return call(key, "GET", "/image/styles")


# Kokoro is the cheapest of the eleven TTS models and carries 54 voices, more
# than the rest combined - which matters for something a lot of people will run.
#
# bf_lily was picked by ear, not from the name: nine candidates read the same
# line and the user chose this one. It is a British female voice (kokoro's `bf_`
# prefix), so anything that assumes an American accent by default is now wrong.
TTS_DEFAULT_MODEL = "tts-kokoro"
TTS_DEFAULT_VOICE = "bf_lily"


def speech(key: str, text: str, voice: str = "", model: str = "",
           fmt: str = "wav", speed: float = 1.0, style: str = "") -> Tuple[bytes, str, str]:
    """Text to speech. Returns (audio bytes, model used, voice used).

    Answers audio rather than JSON, so it cannot go through `call`.

    wav by default: the lipsync and audio-to-video graphs feed this to ComfyUI's
    LoadAudio, and wav is the format least likely to need a decoder that install
    may or may not have.
    """
    if not (key or "").strip():
        raise VeniceError("no_key", "No Venice API key is set. Add one in the top bar.")
    if not (text or "").strip():
        raise VeniceError("failed", "Nothing to say - the text is empty.")
    used_model = (model or "").strip() or TTS_DEFAULT_MODEL
    used_voice = (voice or "").strip() or TTS_DEFAULT_VOICE
    payload: Dict[str, Any] = {
        "input": text,
        "model": used_model,
        "voice": used_voice,
        "response_format": fmt,
        "speed": speed,
    }
    if style.strip():
        payload["prompt"] = style.strip()
    try:
        resp = requests.post(f"{BASE}/audio/speech", headers=_headers(key),
                             json=payload, timeout=TIMEOUT_SLOW)
    except requests.exceptions.Timeout:
        raise VeniceError("timeout", f"Venice did not answer within {TIMEOUT_SLOW}s.")
    except requests.exceptions.RequestException as exc:
        raise VeniceError("unreachable", f"Could not reach Venice: {exc}")
    if not resp.ok:
        raise _classify(resp)
    if not resp.content:
        raise VeniceError("empty_answer", f"{used_model} returned no audio.")
    return resp.content, used_model, used_voice


# Cloning is only offered by these two, and the handle it returns is not
# permanent: Venice expires it after seven days. For tts-minimax-speech-02-hd
# every successful use resets that window, for tts-chatterbox-hd it does not.
# A stored voice therefore has a shelf life, and anything that presents it as
# saved-forever will one day fail with a voice the user believes exists.
VOICE_CLONE_MODELS = ["tts-chatterbox-hd", "tts-minimax-speech-02-hd"]
VOICE_HANDLE_TTL_DAYS = 7


def clone_voice(key: str, sample: bytes, filename: str, model: str = "") -> Dict[str, Any]:
    """Turn an audio sample into a voice handle usable by `speech`.

    Multipart rather than JSON, so the Content-Type header must be left to
    requests - setting it by hand loses the boundary and Venice rejects the body.

    Returns {'id': 'vv_...', 'model': ...}. The handle only works with the model
    it was created for.
    """
    if not (key or "").strip():
        raise VeniceError("no_key", "No Venice API key is set. Add one in the top bar.")
    if not sample:
        raise VeniceError("failed", "The voice sample is empty.")
    used = (model or "").strip() or VOICE_CLONE_MODELS[0]
    if used not in VOICE_CLONE_MODELS:
        raise VeniceError("failed",
                          f"{used} cannot clone voices. Use one of: "
                          + ", ".join(VOICE_CLONE_MODELS))
    try:
        resp = requests.post(
            f"{BASE}/audio/voices",
            headers={"Authorization": f"Bearer {key}"},
            files={"file": (filename or "sample.wav", sample)},
            data={"model": used},
            timeout=TIMEOUT_SLOW,
        )
    except requests.exceptions.Timeout:
        raise VeniceError("timeout", f"Venice did not answer within {TIMEOUT_SLOW}s.")
    except requests.exceptions.RequestException as exc:
        raise VeniceError("unreachable", f"Could not reach Venice: {exc}")
    if not resp.ok:
        raise _classify(resp)
    try:
        out = resp.json()
    except ValueError:
        raise VeniceError("failed", "Venice returned a response that is not JSON.")
    if not out.get("id"):
        raise VeniceError("empty_answer", "Venice returned no voice handle.")
    return out


def characters(key: str, search: str = "", limit: int = 60,
               adult: Optional[bool] = None) -> Dict[str, Any]:
    """The public character catalogue.

    Worth having because `/chat/completions` accepts
    `venice_parameters.character_slug`: picking one here makes the agent answer
    *as* that character, which is a different thing from pasting a persona into
    the system prompt - Venice keeps the character's own definition server-side.

    Marked a preview API in the spec, so the shape may move.
    """
    params: Dict[str, Any] = {"limit": limit}
    if search.strip():
        params["search"] = search.strip()
    if adult is not None:
        params["isAdult"] = "true" if adult else "false"
    return call(key, "GET", "/characters", params=params)


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
