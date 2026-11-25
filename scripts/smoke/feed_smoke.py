"""Curatr smoke test: run before saying any feed, Desk or pipeline change is done.
Usage: python3 scripts/smoke/feed_smoke.py [base_url]   (default https://curatr.pro)
Uses a zztest_ visitor so no reader figures move. Prints PASS/FAIL per check; exits 1 on any failure."""
import asyncio, sys, json, os, subprocess, urllib.request
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
    # Pictures can arrive a few seconds after the cards (events-led feeds load them in the background): wait up to 15s.
    try:
        await page.wait_for_function("[...document.images].filter(i=>i.complete&&i.naturalWidth>0).length >= 1", timeout=15000)
    except Exception:
        pass
    imgs = await page.evaluate("[...document.images].filter(i=>i.complete&&i.naturalWidth>0).length")
    check(f"{slug}: pictures show", imgs >= 1, f"{imgs} loaded")
    body = await page.inner_text("body")
    check(f"{slug}: source credit visible", any(w in body for w in ["Read the full", "Source", "Photo", "via", "More at"]))
    await page.mouse.wheel(0, 3000); await page.wait_for_timeout(1500)
    check(f"{slug}: scroll works", await page.evaluate("scrollY") > 300)
    check(f"{slug}: no page errors", not errors, "; ".join(errors)[:200])
    await b.close()

def new_feeds_keep_sources():
    """New feed saves its news sources: every feed made in the last 14 days has at least one news source."""
    if not os.environ.get("PGHOST"):
        print("SKIP new feed saves its news sources — no database access here"); return
    sql = ("select coalesce(string_agg(t.name, ', '), '') from topics t where t.created_at > now() - interval '14 days' "
           "and not exists (select 1 from content_sources c where c.topic_id = t.id) "
           "and not exists (select 1 from topic_sources s where s.topic_id = t.id)")
    try:
        out = subprocess.run(["psql", "-At", "-c", sql], capture_output=True, text=True, timeout=30)
        missing = out.stdout.strip()
        check("new feed saves its news sources", out.returncode == 0 and not missing,
              missing and f"no news sources: {missing}" or out.stderr.strip()[:120])
    except Exception as e:
        check("new feed saves its news sources", False, str(e)[:120])

OWNER_SQL = """do $$ declare tid uuid; u uuid; ta uuid; st uuid; r text:='';
begin
select t.id, t.created_by into tid, u from topics t
 where not exists (select 1 from user_roles ur where ur.user_id=t.created_by and ur.role in ('admin','superadmin'))
   and exists (select 1 from topic_articles x where x.topic_id=t.id and x.processing_status in ('new','pending'))
   and exists (select 1 from stories s join topic_articles x on x.id=s.topic_article_id where x.topic_id=t.id)
 order by t.created_at desc limit 1;
if tid is null then raise exception 'RESULT none'; end if;
select id into ta from topic_articles where topic_id=tid and processing_status in ('new','pending') limit 1;
select s.id into st from stories s join topic_articles x on x.id=s.topic_article_id where x.topic_id=tid limit 1;
perform set_config('request.jwt.claims', json_build_object('sub',u,'role','authenticated')::text, true);
set local role authenticated;
begin perform approve_topic_article(ta,'tabloid','conversational','journalistic','{}'); r:=r||'approve=ok '; exception when others then r:=r||'approve='||sqlerrm||' '; end;
begin update stories set status='ready', is_published=true where id=st; if found then r:=r||'publish=ok'; else r:=r||'publish=0 rows'; end if; exception when others then r:=r||'publish='||sqlerrm; end;
raise exception 'RESULT %', r; end $$;"""

def owner_can_approve_publish():
    """A normal (non-admin) owner can approve and publish a story on their own feed; simulated, always rolled back."""
    if not os.environ.get("PGHOST"):
        print("SKIP normal owner can approve and publish — no database access here"); return
    out = subprocess.run(["psql", "-At", "-c", OWNER_SQL], capture_output=True, text=True, timeout=30)
    msg = (out.stderr.split("RESULT", 1)[-1].strip().splitlines() or [""])[0]
    if msg == "none":
        print("SKIP normal owner can approve and publish — no non-admin feed with waiting stories"); return
    check("normal owner can approve and publish a story", "approve=ok" in msg and "publish=ok" in msg, msg[:160])

async def main():
    async with async_playwright() as p:
        for s in FEEDS:
            await feed(p, s)
    for s in FEEDS:
        st, body = get(f"{SUPA}/widget-feed-data?feed={s}")
        check(f"{s}: widget data", st == 200 and body.strip().startswith("{"), str(st))
    st, body = get(f"{SUPA}/rss-feed/eastbourne")
    check("eastbourne: RSS valid", st == 200 and "<rss" in body and "<item>" in body, str(st))
    new_feeds_keep_sources()
    owner_can_approve_publish()
    print("Desk: not checked automatically (needs owner sign-in)")
    print(f"\n{sum(results)}/{len(results)} passed")
    sys.exit(0 if all(results) else 1)

asyncio.run(main())
