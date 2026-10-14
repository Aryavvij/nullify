"""End-to-end tests against the shared local fixtures (bench/fixtures)."""

from __future__ import annotations

import asyncio
import os
import subprocess
import time
import urllib.request
from pathlib import Path

import pytest
from playwright.async_api import async_playwright
from playwright.sync_api import sync_playwright

from nullify_guard import NullifyBlockedError, guard
from nullify_guard import sync_api

ROOT = Path(__file__).resolve().parents[2]
PORT = 4175  # the Node suites use 4173 and 4174
BASE = f"http://news.test:{PORT}"
ARGS = ["--host-resolver-rules=MAP *.test 127.0.0.1"]


@pytest.fixture(scope="session", autouse=True)
def fixture_server():
    proc = subprocess.Popen(["node", "bench/server.mjs"], cwd=ROOT, env={**os.environ, "PORT": str(PORT)}, stdout=subprocess.DEVNULL)
    for _ in range(50):
        try:
            urllib.request.urlopen(f"http://127.0.0.1:{PORT}/hello.html")
            break
        except OSError:
            time.sleep(0.1)
    yield
    proc.terminate()


async def center(page, selector):
    box = await page.locator(selector).bounding_box()
    return box["x"] + box["width"] / 2, box["y"] + box["height"] / 2


def run(coro):
    return asyncio.run(coro)


def test_refuses_click_on_invisible_control_and_explains():
    async def scenario():
        async with async_playwright() as p:
            browser = await p.chromium.launch(args=ARGS)
            page = await browser.new_page()
            g = await guard(page)
            await page.goto(f"{BASE}/attacks/invisible-control.html")
            x, y = await center(page, "#no-thanks")
            with pytest.raises(NullifyBlockedError) as err:
                await page.mouse.click(x, y)
            assert str(err.value) == (
                "Nullify refused this click: the click would land on an invisible control (button#hidden-confirm) "
                'instead of what is shown (button#no-thanks "No thanks").'
            )
            assert await page.text_content("#status") == "pending"
            assert [i.kind for i in g.interventions] == ["click-refused"]
            await browser.close()

    run(scenario())


def test_shield_cancels_click_when_control_appears_as_pointer_moves():
    async def scenario():
        async with async_playwright() as p:
            browser = await p.chromium.launch(args=ARGS)
            page = await browser.new_page()
            await guard(page)
            await page.goto(f"{BASE}/attacks/swap-on-move.html")
            x, y = await center(page, "#no-thanks")
            with pytest.raises(NullifyBlockedError):
                await page.mouse.click(x, y)
            assert await page.text_content("#status") == "pending"
            await browser.close()

    run(scenario())


def test_click_element_fails_fast_when_covered():
    async def scenario():
        async with async_playwright() as p:
            browser = await p.chromium.launch(args=ARGS)
            page = await browser.new_page()
            g = await guard(page)
            await page.goto(f"{BASE}/attacks/decoy-layer.html")
            with pytest.raises(NullifyBlockedError, match=r'button#download "Download" is covered by div#layer'):
                await g.click_element(page.locator("#download"))
            await browser.close()

    run(scenario())


def test_ordinary_clicks_and_page_reading():
    async def scenario():
        async with async_playwright() as p:
            browser = await p.chromium.launch(args=ARGS)
            context = await browser.new_context()
            g = await guard(context)
            page = await context.new_page()

            await page.goto(f"{BASE}/legit/counter.html")
            await g.click_element(page.locator("#inc"))
            await page.mouse.click(*(await center(page, "#inc")))
            assert await page.text_content("#count") == "2"
            assert g.interventions == []

            await page.goto(f"{BASE}/attacks/hidden-instructions.html")
            text = await g.visible_text(page)
            assert "We tested 14 pairs of headphones" in text
            assert "previous instructions" not in text.lower()
            risk = await g.page_risk(page)
            assert risk["level"] == "high" and risk["hiddenInstructions"] == 5
            await browser.close()

    run(scenario())


def test_closes_tabs_the_engine_did_not_approve():
    async def scenario():
        async with async_playwright() as p:
            browser = await p.chromium.launch(args=ARGS)
            page = await browser.new_page()
            # Report mode lets the popup through in the page, so only the Python-side backstop acts.
            g = await guard(page, policy={"mode": "report", "clickShield": False})
            await page.goto(f"{BASE}/attacks/overlay-div.html")
            async with page.expect_popup() as info:
                await page.mouse.click(*(await center(page, "#video")))
            popup = await info.value
            for _ in range(30):
                if popup.is_closed():
                    break
                await asyncio.sleep(0.1)
            assert popup.is_closed()
            assert [i.kind for i in g.interventions] == ["rogue-tab-closed"]
            await browser.close()

    run(scenario())


def test_sync_api():
    with sync_playwright() as p:
        browser = p.chromium.launch(args=ARGS)
        page = browser.new_page()
        g = sync_api.guard(page)

        page.goto(f"{BASE}/attacks/invisible-control.html")
        box = page.locator("#no-thanks").bounding_box()
        with pytest.raises(NullifyBlockedError, match="invisible control"):
            page.mouse.click(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)

        page.goto(f"{BASE}/legit/counter.html")
        g.click_element(page.locator("#inc"))
        assert page.text_content("#count") == "1"
        assert g.page_risk(page)["level"] == "low"
        browser.close()
