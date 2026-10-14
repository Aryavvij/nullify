"""Nullify Agent Guard for sync Playwright-Python. Same behaviour as the async API."""

from __future__ import annotations

import uuid
from typing import Any, Callable, Optional, Union

from playwright.sync_api import BrowserContext, Frame, Locator, Page

from ._shared import (
    AGENT_API, ASSESS_ELEMENT_JS, CALL_JS, PREPARE_ELEMENT_JS, Intervention, NullifyBlockedError, OnIntervention,
    explain, init_script, last_block_time,
)

__all__ = ["guard", "NullifyGuard", "NullifyBlockedError", "Intervention", "explain"]


def _call(target: Union[Page, Frame], method: str, *args: Any) -> Any:
    return target.evaluate(CALL_JS, [AGENT_API, method, list(args)])


class NullifyGuard:
    def __init__(self, token: str, on_intervention: OnIntervention = None):
        self._token = token
        self._on_intervention = on_intervention
        self._raw_mouse: dict[int, dict[str, Callable[..., None]]] = {}
        self._watched: set[int] = set()
        self.interventions: list[Intervention] = []

    def assess(self, page: Page, x: float, y: float) -> dict:
        return _call(page, "assess", x, y)

    def assess_element(self, locator: Locator) -> dict:
        return locator.evaluate(ASSESS_ELEMENT_JS, AGENT_API)

    def visible_text(self, page: Union[Page, Frame]) -> str:
        return _call(page, "visibleText")

    def hidden_text(self, page: Union[Page, Frame]) -> list[dict]:
        return _call(page, "hiddenText")

    def page_risk(self, page: Union[Page, Frame]) -> dict:
        return _call(page, "pageRisk")

    def events(self, page: Union[Page, Frame]) -> list[dict]:
        return _call(page, "events")

    def click(self, page: Page, x: float, y: float, **options: Any) -> None:
        raw = self._raw_mouse.get(id(page), {}).get("click", page.mouse.click)
        self._press(page, x, y, lambda: raw(x, y, **options))

    def click_element(self, locator: Locator, **options: Any) -> None:
        page = locator.page
        prepared = locator.evaluate(PREPARE_ELEMENT_JS, [AGENT_API, self._token])
        if not prepared["verdict"]["ok"]:
            self._refuse(page, prepared["verdict"])
        locator.click(**options)
        self._after_press(page, prepared["since"])

    def protect(self, page: Page) -> None:
        if id(page) in self._raw_mouse:
            return
        mouse = page.mouse
        raw = {"click": mouse.click, "dblclick": mouse.dblclick, "down": mouse.down, "move": mouse.move}
        self._raw_mouse[id(page)] = raw
        at = [0.0, 0.0]

        def move(x: float, y: float, **kw: Any) -> None:
            at[:] = [x, y]
            raw["move"](x, y, **kw)

        def click(x: float, y: float, **kw: Any) -> None:
            at[:] = [x, y]
            self._press(page, x, y, lambda: raw["click"](x, y, **kw))

        def dblclick(x: float, y: float, **kw: Any) -> None:
            at[:] = [x, y]
            self._press(page, x, y, lambda: raw["dblclick"](x, y, **kw))

        def down(**kw: Any) -> None:
            self._press(page, at[0], at[1], lambda: raw["down"](**kw))

        mouse.move, mouse.click, mouse.dblclick, mouse.down = move, click, dblclick, down  # type: ignore[method-assign]

    def watch_popups(self, page: Page) -> None:
        if id(page) in self._watched:
            return
        self._watched.add(id(page))
        page.on("popup", lambda popup: self._judge_popup(page, popup))

    def _press(self, page: Page, x: float, y: float, press: Callable[[], None]) -> None:
        prepared = _call(page, "prepare", x, y)
        if not prepared["verdict"]["ok"]:
            self._refuse(page, prepared["verdict"])
        press()
        self._after_press(page, prepared["since"])

    def _after_press(self, page: Page, before: float) -> None:
        try:
            last = _call(page, "lastBlock")
        except Exception:
            return
        if last and last_block_time(last) > before:
            self._refuse(page, last)

    def _refuse(self, page: Page, verdict: dict) -> None:
        self._record(Intervention("click-refused", verdict.get("reason") or "unknown", page.url, verdict=verdict))
        raise NullifyBlockedError(verdict)

    def _judge_popup(self, opener: Page, popup: Page) -> None:
        for frame in opener.frames:
            try:
                if _call(frame, "popupAllowedWithin", 3000):
                    return
            except Exception:
                continue
        self._record(Intervention("rogue-tab-closed", "opened without an approved click", popup.url))
        try:
            popup.close()
        except Exception:
            pass

    def _record(self, e: Intervention) -> None:
        self.interventions.append(e)
        if self._on_intervention:
            self._on_intervention(e)


def guard(
    target: Union[Page, BrowserContext],
    *,
    protect_mouse: bool = True,
    close_rogue_tabs: bool = True,
    policy: Optional[dict] = None,
    debug: bool = False,
    on_intervention: OnIntervention = None,
) -> NullifyGuard:
    token = str(uuid.uuid4())
    target.add_init_script(script=init_script(token, policy, debug))
    g = NullifyGuard(token, on_intervention)

    def adopt(page: Page) -> None:
        if protect_mouse:
            g.protect(page)
        if close_rogue_tabs:
            g.watch_popups(page)

    if isinstance(target, BrowserContext):
        for page in target.pages:
            adopt(page)
        target.on("page", adopt)
    else:
        adopt(target)
    return g
