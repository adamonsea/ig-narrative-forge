// One place for the widget script version and the default embed snippet.
export const WIDGET_JS_VERSION = '1.5.2';

/** The simplest working embed: the feed's latest headlines with default styling. */
export function defaultWidgetCode(slug: string, origin: string): string {
  return `<div id="curatr-widget" data-feed="${slug}"></div>\n<script src="${origin}/widget.js?v=${WIDGET_JS_VERSION}" async></script>`;
}
