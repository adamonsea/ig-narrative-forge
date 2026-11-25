"""Curatr smoke test: run before saying any feed, Desk or pipeline change is done.
Usage: python3 scripts/smoke/feed_smoke.py [base_url]   (default https://curatr.pro)
Uses a zztest_ visitor so no reader figures move. Prints PASS/FAIL per check; exits 1 on any failure."""
import asyncio, sys, json, urllib.request
from playwright.async_api import async_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "https://curatr.pro"
FEEDS = ["eastbourne", "whats-on-lisbon"]
SUPA = "https://fpoywkjgdapgjtdeooak.supabase.co/functions/v1"
results = []

def check(name, ok, detail=""):
    results.append(ok); print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail else ""))

def get(url):
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "curatr-smoke"}), timeout=30) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, ""
    except Exception as e:
        return 0, str(e)

async def feed(p, slug):
    b = await p.chromium.launch(headless=True)
    ctx = await b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
    await ctx.add_init_script(f"if (location.hostname.endsWith('curatr.pro') || location.hostname==='localhost') localStorage.setItem('curatr_visitor_id','zztest_smoke_{slug}')")
    page = await ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    r = await page.goto(f"{BASE}/@{slug}", wait_until="domcontentloaded")
    check(f"{slug}: page loads", bool(r and r.status < 400), str(r.status if r else None))
    try:
        await page.wait_for_function("document.querySelectorAll('article,[data-story-id]').length + [...document.querySelectorAll('button,a')].filter(e=>/Add to calendar/.test(e.textContent||e.getAttribute('aria-label')||'')).length >= 3", timeout=20000)
        n = await page.evaluate("document.querySelectorAll('article,[data-story-id]').length + [...document.querySelectorAll('button,a')].filter(e=>/Add to calendar/.test(e.textContent||e.getAttribute('aria-label')||'')).length")
        check(f"{slug}: cards render", n >= 3, f"{n} cards")
    except Exception as e:
        check(f"{slug}: cards render", False, str(e)[:120])
    await page.wait_for_timeout(3000)
    imgs = await page.evaluate("[...document.images].filter(i=>i.complete&&i.naturalWidth>0).length")
    check(f"{slug}: pictures show", imgs >= 1, f"{imgs} loaded")
    body = await page.inner_text("body")
    check(f"{slug}: source credit visible", any(w in body for w in ["Read the full", "Source", "Photo", "via", "More at"]))
    await page.mouse.wheel(0, 3000); await page.wait_for_timeout(1500)
    check(f"{slug}: scroll works", await page.evaluate("scrollY") > 300)
    check(f"{slug}: no page errors", not errors, "; ".join(errors)[:200])
    await b.close()

async def main():
    async with async_playwright() as p:
        for s in FEEDS:
            await feed(p, s)
    for s in FEEDS:
        st, body = get(f"{SUPA}/widget-feed-data?feed={s}")
        check(f"{s}: widget data", st == 200 and body.strip().startswith("{"), str(st))
    st, body = get(f"{SUPA}/rss-feed/eastbourne")
    check("eastbourne: RSS valid", st == 200 and "<rss" in body and "<item>" in body, str(st))
    print("Desk: not checked automatically (needs owner sign-in)")
    print(f"\n{sum(results)}/{len(results)} passed")
    sys.exit(0 if all(results) else 1)

asyncio.run(main())
