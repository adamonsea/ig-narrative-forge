"""Measure the public feed on a mid-range phone profile (4x CPU slowdown, 4G). Usage: python3 scripts/smoke/feed_perf.py [slug] [base]"""
import asyncio, sys, json
from playwright.async_api import async_playwright
SLUG = sys.argv[1] if len(sys.argv) > 1 else "eastbourne"
BASE = sys.argv[2] if len(sys.argv) > 2 else "https://curatr.pro"
async def main():
  async with async_playwright() as p:
    b = await p.chromium.launch(headless=True)
    c = await b.new_context(viewport={"width":390,"height":844}, is_mobile=True, has_touch=True, device_scale_factor=2)
    await c.add_init_script("localStorage.setItem('curatr_visitor_id','zztest_perf');"
      "window.__lt=[];new PerformanceObserver(l=>l.getEntries().forEach(e=>__lt.push(e.duration))).observe({type:'longtask',buffered:true});"
      "window.__lcp=0;new PerformanceObserver(l=>{const e=l.getEntries();__lcp=e[e.length-1].startTime}).observe({type:'largest-contentful-paint',buffered:true});")
    pg = await c.new_page(); cdp = await c.new_cdp_session(pg)
    await cdp.send("Emulation.setCPUThrottlingRate", {"rate": 4})
    await cdp.send("Network.enable")
    await cdp.send("Network.emulateNetworkConditions", {"offline": False, "latency": 150, "downloadThroughput": 1.6e6/8*1.0*4, "uploadThroughput": 750e3/8})
    sizes = {}
    cdp.on("Network.loadingFinished", lambda e: sizes.__setitem__(e["requestId"], (sizes.get(e["requestId"], ("", 0))[0], e["encodedDataLength"])))
    cdp.on("Network.responseReceived", lambda e: sizes.__setitem__(e["requestId"], (e["type"], 0)))
    t0 = asyncio.get_event_loop().time()
    await pg.goto(f"{BASE}/@{SLUG}", wait_until="commit")
    await pg.wait_for_function("document.querySelectorAll('article,[data-story-id]').length + [...document.querySelectorAll('button')].filter(e=>/Add to calendar/.test(e.textContent||e.getAttribute('aria-label')||'')).length >= 1", timeout=60000)
    first = asyncio.get_event_loop().time() - t0
    await pg.wait_for_timeout(5000)
    lcp = await pg.evaluate("__lcp"); lt_load = await pg.evaluate("__lt.slice()")
    await pg.evaluate("__lt.length=0")
    # scroll 20 cards and swipe
    for _ in range(20):
      await pg.mouse.wheel(0, 600); await pg.wait_for_timeout(150)
    frames = await pg.evaluate("""() => new Promise(r=>{let n=0,last=performance.now(),worst=0;const s=last;function f(t){n++;worst=Math.max(worst,t-last);last=t;if(t-s<3000){window.scrollBy(0,40);requestAnimationFrame(f)}else r({fps:n/3,worst})}requestAnimationFrame(f)})""")
    lt_scroll = await pg.evaluate("__lt.slice()")
    by = {}
    for t, n in sizes.values(): by[t] = by.get(t, 0) + n
    print(json.dumps({"slug": SLUG, "first_card_s": round(first, 2), "lcp_ms": round(lcp), "long_tasks_load": len(lt_load), "longest_task_load_ms": round(max(lt_load or [0])),
      "scroll_fps": round(frames["fps"], 1), "worst_frame_ms": round(frames["worst"]), "long_tasks_scroll": len(lt_scroll),
      "kb_by_type": {k: round(v/1024) for k, v in by.items()}}, indent=1))
    await b.close()
asyncio.run(main())
