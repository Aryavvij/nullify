"""Pieces shared by the async and sync APIs: the engine bundle, errors and the in-page calls."""

from __future__ import annotations

import json
import time
from dataclasses import dataclass, field
from functools import lru_cache
from importlib.resources import files
from typing import Any, Callable, Optional

#: Name of the in-page API; must match AGENT_API in @nullify/core.
AGENT_API = "__nullifyAgent"

CALL_JS = """([api, method, args]) => {
  const fn = globalThis[api]?.[method];
  if (typeof fn !== "function") throw new Error("Nullify engine is not loaded in this page; guard() must run before navigation");
  return fn(...args);
}"""
ASSESS_ELEMENT_JS = "(el, api) => globalThis[api].assessElement(el)"
#: One round trip before an element click: scroll into view, check, and tell the in-page shield which element is meant.
PREPARE_ELEMENT_JS = "(el, [api, token]) => globalThis[api].prepareElement(token, el)"


@lru_cache(maxsize=1)
def core_bundle() -> str:
    try:
        return files("nullify_guard").joinpath("core.iife.js").read_text("utf-8")
    except FileNotFoundError as e:  # pragma: no cover - packaging error
        raise RuntimeError("core.iife.js is missing: run `npm run build` at the repo root") from e


def init_script(token: str, policy: Optional[dict] = None, debug: bool = False) -> str:
    options: dict[str, Any] = {"agentToken": token, "policy": {"clickShield": True, **(policy or {})}}
    if debug:
        options["debug"] = True
    # A function scope, so the bundle doesn't leave a `Nullify` global the page could call.
    return f'(() => {{\n{core_bundle()}\nNullify.init("agent-guard", {json.dumps(options)});\n}})();'


def explain(v: dict) -> str:
    """One sentence an agent can act on, built only from visible, non-instruction text."""
    meant = v.get("meant") or "the visible target"
    hit = v.get("hit")
    reason = v.get("reason")
    if reason == "invisible-frame":
        return f"an invisible embedded frame ({hit}) sits on top of {meant}."
    if reason == "invisible-control":
        shown = f" ({v['meant']})" if v.get("meant") else ""
        return f"the click would land on an invisible control ({hit}) instead of what is shown{shown}."
    if reason == "invisible-layer-over-control":
        return f"an invisible layer ({hit}) covers {meant}."
    if reason == "target-covered":
        return f"{meant} is covered by {hit or 'another element'}."
    if reason == "target-not-visible":
        return f"{meant} is not visible on screen."
    return "the click would not land on what is shown."


class NullifyBlockedError(Exception):
    """A click was refused because it would not land on what is visible."""

    def __init__(self, verdict: dict):
        super().__init__(f"Nullify refused this click: {explain(verdict)}")
        self.verdict = verdict


@dataclass
class Intervention:
    kind: str  # "click-refused" | "rogue-tab-closed"
    reason: str
    url: str
    time: float = field(default_factory=time.time)
    verdict: Optional[dict] = None


OnIntervention = Optional[Callable[[Intervention], None]]


def last_block_time(last: Optional[dict]) -> float:
    return float(last["time"]) if last else 0.0
