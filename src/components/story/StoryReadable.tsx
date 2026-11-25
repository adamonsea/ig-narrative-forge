import { useMemo, useState } from "react";
import { ExternalLink, Newspaper } from "lucide-react";
import { prepareStorySlides, buildReporterByline, normaliseDomain } from "@/lib/lastSlide";
import { stripGeneratedSourceAttribution } from "@/lib/stripSourceAttribution";

interface Props {
  title: string;
  author: string | null;
  publicationName: string | null;
  sourceUrl: string;
  slides: Array<{ slide_number: number; content: string }>;
}

/** The rewritten story as one scannable article, with a clear source link. */
export function StoryReadable({ title, author, publicationName, sourceUrl, slides }: Props) {
  const [logoFailed, setLogoFailed] = useState(false);
  const domain = normaliseDomain(sourceUrl);
  const publisher = publicationName || domain || "the source";

  const { headline, paragraphs } = useMemo(() => {
    const ordered = [...slides].sort((a, b) => a.slide_number - b.slide_number);
    const prepared = prepareStorySlides(ordered, stripGeneratedSourceAttribution, { sourceDomain: sourceUrl }).slides;
    const [first, ...rest] = prepared;
    return {
      headline: (first?.content || title).replace(/\s+/g, " ").trim(),
      paragraphs: rest
        .flatMap((s) => s.content.split(/\n{2,}|\n/))
        .map((p) => p.trim())
        .filter(Boolean),
    };
  }, [slides, sourceUrl, title]);

  const byline = buildReporterByline(author);

  return (
    <article className="feed-card mx-4 mt-6 rounded-xl p-6 md:p-8">
      {sourceUrl && (
        <a
          href={sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mb-4 inline-flex min-h-11 items-center gap-2 text-sm opacity-80 hover:opacity-100"
        >
          {domain && !logoFailed ? (
            <img
              src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`}
              alt=""
              width={20}
              height={20}
              className="h-5 w-5 rounded-sm"
              onError={() => setLogoFailed(true)}
            />
          ) : (
            <Newspaper className="h-5 w-5" aria-hidden="true" />
          )}
          <span>{publisher}</span>
        </a>
      )}
      <h1 className="text-2xl font-semibold leading-tight md:text-3xl">{headline}</h1>
      {byline && <p className="mt-2 text-sm opacity-70">{byline}</p>}
      <div className="mt-6 space-y-4 text-base leading-relaxed">
        {paragraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
      {sourceUrl && (
        <a
          href={sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-8 inline-flex min-h-11 items-center gap-2 rounded-full border border-current/20 px-4 text-sm font-medium hover:bg-current/5"
        >
          Read the full story at {publisher}
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
        </a>
      )}
    </article>
  );
}
