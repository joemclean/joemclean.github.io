# Joe McLean's Personal Site

Static personal site hosted on GitHub Pages at https://joemclean.github.io.

## Structure

```
index.html          - Home page with bio and writing index
style.css           - Shared stylesheet (all pages reference this)
favicon.svg         - Transistor symbol favicon (SVG)
writing/            - Article pages
  the-prompt-of-babel.html
  modular-synthesizers-miro-flows.html
  when-implementation-is-free.html
  overfitting-use-cases.html
```

## Design

- **Font**: Source Serif 4 (Google Fonts) — literary serif, optical sizing
- **Palette**: Off-white background (#faf9f7), dark text (#1a1a1a), secondary (#555), borders (#e0ddd8)
- **Layout**: Single column, 640px max-width, generous vertical spacing
- **Tone**: Minimal, literary, text-forward. Artistic and thoughtful without overcooking it

## Conventions

- No build step, no JS framework — plain HTML + CSS
- All paths are relative (not absolute) so pages work when opened as local files
- Article pages link back to `../index.html` and use `../style.css`
- Multi-image layouts in articles use `.image-row` flexbox with JS setting flex-grow to each image's aspect ratio
- The Flows article has a `<script>` at the bottom for this
- Section breaks in fiction use `<hr>`
- `.small-caps` class for typographic openings (uses OpenType small caps from Source Serif 4)

## Deployment

- GitHub Pages, auto-deploys from `main` branch
- Repo: https://github.com/joemclean/joemclean.github.io
- Push to `main` to deploy

## Content sources

- Medium articles pulled from RSS feed (`https://medium.com/feed/@islandlife`), converted to clean HTML
- Images in Medium articles still reference Medium CDN URLs
- Original fiction written directly

## Joe McLean

- Product manager at Miro, leads AI Canvas
- Previously 7 years at Splice
- Composes electronic music (https://islandlife.bandcamp.com/music)
- Based in Berlin
- Twitter: https://x.com/jjjoemclean
