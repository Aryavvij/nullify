"""Nullify Agent Guard for Playwright-Python (async API).

    g = await guard(context)       # before navigating
    await page.mouse.click(x, y)   # checked; raises NullifyBlockedError with a reason

For sync Playwright, use ``nullify_guard.sync_api``.
"""

from __future__ import annotations

import uuid
from typing import Any, Awaitable, Callable, Optional, Union

from playwright.async_api import BrowserContext, Frame, Locator, Page

from ._shared import (
    AGENT_API, ASSESS_ELEMENT_JS, CALL_JS, PREPARE_ELEMENT_JS, Intervention, NullifyBlockedError, OnIntervention,
    explain, init_script, last_block_time,
)

__all__ = ["guard", "NullifyGuard", "NullifyBlockedError", "Intervention", "explain"]


async def _call(target: Union[Page, Frame], method: str, *args: Any) -> Any:
    return await target.evaluate(CALL_JS, [AGENT_API, method, list(args)])


class NullifyGuard:
    def __init__(self, token: str, on_intervention: OnIntervention = None):
        self._token = token
        self._on_intervention = on_intervention
        self._raw_mouse: dict[int, dict[str, Callable[..., Awaitable[None]]]] = {}
        self._watched: set[int] = set()
        #: Clicks refused and tabs closed on the Python side, oldest first.
        self.interventions: list[Intervention] = []

    # ---- reading the page ------------------------------------------------

    async def assess(self, page: Page, x: float, y: float) -> dict:
        """What a click at (x, y) would really hit, without clicking."""
        return await _call(page, "assess", x, y)

    async def assess_element(self, locator: Locator) -> dict:
        return await locator.evaluate(ASSESS_ELEMENT_JS, AGENT_API)

    async def visible_text(self, page: Union[Page, Frame]) -> str:
        """Page text a person can see. Feed this to the model instead of inner_text()."""
        return await _call(page, "visibleText")

    async def hidden_text(self, page: Union[Page, Frame]) -> list[dict]:
        return await _call(page, "hiddenText")

    async def page_risk(self, page: Union[Page, Frame]) -> dict:
        return await _call(page, "pageRisk")

    async def events(self, page: Union[Page, Frame]) -> list[dict]:
        return await _call(page, "events")

    # ---- clicking ----------------------------------------------------------

    async def click(self, page: Page, x: float, y: float, **options: Any) -> None:
        raw = self._raw_mouse.get(id(page), {}).get("click", page.mouse.click)
        await self._press(page, x, y, lambda: raw(x, y, **options))

    async def click_element(self, locator: Locator, **options: Any) -> None:
        """Click an element; fails fast with a reason if something else would receive the click."""
        page = locator.page
        prepared = await locator.evaluate(PREPARE_ELEMENT_JS, [AGENT_API, self._token])
        if not prepared["verdict"]["ok"]:
            self._refuse(page, prepared["verdict"])
        await locator.click(**options)
        await self._after_press(page, prepared["since"])

    def protect(self, page: Page) -> None:
        """Route every page.mouse click, double-click and press through the check."""
        if id(page) in self._raw_mouse:
            return
        mouse = page.mouse
        raw = {"click": mouse.click, "dblclick": mouse.dblclick, "down": mouse.down, "move": mouse.move}
        self._raw_mouse[id(page)] = raw
        at = [0.0, 0.0]

        async def move(x: float, y: float, **kw: Any) -> None:
            at[:] = [x, y]
            await raw["move"](x, y, **kw)

        async def click(x: float, y: float, **kw: Any) -> None:
            at[:] = [x, y]
            await self._press(page, x, y, lambda: raw["click"](x, y, **kw))

        async def dblclick(x: float, y: float, **kw: Any) -> None:
            at[:] = [x, y]
            await self._press(page, x, y, lambda: raw["dblclick"](x, y, **kw))

        async def down(**kw: Any) -> None:
            await self._press(page, at[0], at[1], lambda: raw["down"](**kw))

        mouse.move, mouse.click, mouse.dblclick, mouse.down = move, click, dblclick, down  # type: ignore[method-assign]

    def watch_popups(self, page: Page) -> None:
        """Close popups from this page that the engine didn't approve."""
        if id(page) in self._watched:
            return
        self._watched.add(id(page))

        async def on_popup(popup: Page) -> None:
            await self._judge_popup(page, popup)

        page.on("popup", on_popup)

    # ---- internals ---------------------------------------------------------

    async def _press(self, page: Page, x: float, y: float, press: Callable[[], Awaitable[None]]) -> None:
        prepared = await _call(page, "prepare", x, y)
        if not prepared["verdict"]["ok"]:
            self._refuse(page, prepared["verdict"])
        await press()
        await self._after_press(page, prepared["since"])

    async def _after_press(self, page: Page, before: float) -> None:
        """The page changed between the check and the click, and the in-page shield cancelled it."""
        try:
            last = await _call(page, "lastBlock")
        except Exception:  # the click navigated away
            return
        if last and last_block_time(last) > before:
            self._refuse(page, last)

    def _refuse(self, page: Page, verdict: dict) -> None:
        self._record(Intervention("click-refused", verdict.get("reason") or "unknown", page.url, verdict=verdict))
        raise NullifyBlockedError(verdict)

    async def _judge_popup(self, opener: Page, popup: Page) -> None:
        for frame in opener.frames:
            try:
                if await _call(frame, "popupAllowedWithin", 3000):
                    return
            except Exception:
                continue
        self._record(Intervention("rogue-tab-closed", "opened without an approved click", popup.url))
        try:
            await popup.close()
        except Exception:
            pass

    def _record(self, e: Intervention) -> None:
        self.interventions.append(e)
        if self._on_intervention:
            self._on_intervention(e)


async def guard(
    target: Union[Page, BrowserContext],
    *,
    protect_mouse: bool = True,
    close_rogue_tabs: bool = True,
    policy: Optional[dict] = None,
    debug: bool = False,
    on_intervention: OnIntervention = None,
) -> NullifyGuard:
    """Protect a page or (better) a context. Call before navigating."""
    token = str(uuid.uuid4())
    await target.add_init_script(script=init_script(token, policy, debug))
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
