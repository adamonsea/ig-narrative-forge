# Route rules
- Feed/story link previews come only from route `loader`+`head()` via `src/lib/shareMeta.ts`; crawlers read the server HTML, never client code.
