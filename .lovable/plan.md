

# UI Noise Audit — Recommendations

After reviewing Dashboard.tsx, TopicManager.tsx, TopicDashboard.tsx, AppLayout.tsx, and AppSidebar.tsx, here are the specific issues contributing to cognitive load, grouped by severity.

---

## 1. Dashboard page has redundant navigation layers

**Problem**: The dashboard has THREE competing navigation/action zones:
- AppLayout sticky header (sidebar trigger only — a lonely hamburger icon in a 56px bar)
- Dashboard's own header with "Your topics" title + a SECOND hamburger menu (DropdownMenu with Admin/Sign Out)
- The sidebar itself (which also has Dashboard, Admin, Sign Out)

The AppLayout header is an empty bar with just a sidebar trigger — wasted vertical space on the primary view.

**Fix**: Remove the Dashboard's inline DropdownMenu (lines 159-180). All those actions already exist in the sidebar. This eliminates a duplicate hamburger icon that creates confusion about which menu does what.

---

## 2. Collapsible stats panel serves no purpose

**Problem**: The Dashboard has a collapsible stats panel (Topics/Sources/Articles/Stories counts, lines 183-243) behind a tiny icon-only button. These same numbers are already visible inline on each topic card (sources count, arrivals, published). The collapsible adds a click barrier to data that's either redundant or not actionable.

**Fix**: Remove the entire collapsible stats section. The topic cards already surface the metrics that matter (visitors, approval, audience).

---

## 3. "Powered by Curatr.pro" appears in too many places

**Problem**: The branding tagline appears on:
- Dashboard header (line 154-156)
- TopicDashboard footer (lines 874-878)
- The sidebar already shows the Curatr brand/logo

This is self-referential noise for authenticated users who already know what product they're using.

**Fix**: Remove the "Powered by Curatr.pro" text from Dashboard header and TopicDashboard footer. The sidebar brand mark is sufficient.

---

## 4. AppLayout header bar is nearly empty

**Problem**: The sticky header (line 49) is 56px tall and contains only a sidebar trigger icon. It consumes prime screen real estate with almost no content. On the topic dashboard, breadcrumbs add a SECOND bar below it.

**Fix**: Merge the sidebar trigger into the breadcrumb bar when breadcrumbs are present. When no breadcrumbs (dashboard root), make the header thinner (h-10) or integrate the trigger directly into the page header.

---

## 5. TopicDashboard "Access Denied" is dead code

**Problem**: Lines 531-541 render an "Access Denied" page for `!user`, but the `useEffect` redirect (lines 150-155) already navigates to `/auth` before this renders. Same pattern as the old Dashboard bug we just fixed.

**Fix**: Replace with `if (!user) return null;` — the redirect handles it.

---

## 6. Topic card archive button is too prominent

**Problem**: Every topic card shows a destructive-styled Archive button (red hover) at the same visual weight as the Feed button. Archive is a rare, irreversible action sitting next to an everyday action. This creates anxiety.

**Fix**: Move Archive into a three-dot overflow menu on the card, or hide it behind a long-press/right-click. Only Feed button remains visible.

---

## Implementation Summary

| Change | File | Impact |
|---|---|---|
| Remove Dashboard inline menu | Dashboard.tsx | Eliminate duplicate navigation |
| Remove collapsible stats panel | Dashboard.tsx | Remove redundant data layer |
| Remove "Powered by" text x2 | Dashboard.tsx, TopicDashboard.tsx | Reduce branding noise |
| Slim down AppLayout header | AppLayout.tsx | Reclaim vertical space |
| Replace dead "Access Denied" | TopicDashboard.tsx | Clean dead code |
| Move Archive to overflow menu | TopicManager.tsx | Reduce destructive action prominence |

Six changes, all subtractive — removing elements rather than adding them. Net result: fewer competing UI layers, less vertical space consumed by chrome, and clearer information hierarchy.

