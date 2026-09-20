# chrishannah.dev

A "global situation dashboard" — a single command-center homepage for my apps,
web services, open source, and writing. Served with
[GitHub Pages](https://pages.github.com/) and (once DNS resolves) at
[chrishannah.dev](https://chrishannah.dev).

## How it works

- Plain static HTML and CSS — no build step. What's committed is what's served.
- The centerpiece shows **live GitHub activity**, fetched client-side:
  - contribution heatmap via the CORS-friendly
    [github-contributions-api](https://github-contributions-api.jogruber.de/);
  - recent commits via the public GitHub events API.
  Both degrade gracefully if a request fails.
- Top bar shows live London (auto GMT/BST) and UTC clocks.
- Fonts are IBM Plex Mono / Sans from Google Fonts.
- `.nojekyll` disables Jekyll so self-contained artifacts (including files whose
  names start with `_`) are served exactly as-is.
- `CNAME` points the site at the `chrishannah.dev` custom domain.
- Tinylytics analytics is embedded at the bottom of `index.html` (remove that
  one `<script>` line to disable).

## Layout

| File / folder | Purpose                                          |
| ------------- | ------------------------------------------------ |
| `index.html`  | The dashboard — panels, globe, ticker.           |
| `style.css`   | HUD styling (dark, responsive).                  |
| `404.html`    | Themed not-found page.                            |
| `CNAME`       | Custom domain configuration.                     |
| `.nojekyll`   | Serve files verbatim, no Jekyll build.           |

The dashboard panels are:

- **01 Operator / 02 Comms / 03 Feeds** — bio, social links, and blogs.
- **00 GitHub Activity** — live contribution heatmap and recent commits.
- **04 Flagship** — Text Case and its platforms.
- **05 Web Services** — the live `.app` tools.
- **06 Repositories** — open-source projects on GitHub.

## Adding a project

Add a row to the relevant panel in `index.html`.

A web service or repository row (panels 05 / 06):

```html
<a class="sys" href="https://example.com" data-system>
  <span class="sys-name">Name</span>
  <span class="sys-desc">Short one-line description.</span>
  <span class="sys-tag live">Live</span> <!-- or: soon | store | (omit class)=Repo -->
</a>
```

`data-system` includes the row in the "systems online" count on the globe.

A writing feed (panel 03):

```html
<a class="feed" href="https://example.com">
  <span class="feed-name">example.com</span>
  <div class="feed-desc">What it is.</div>
</a>
```

To host a self-contained artifact, drop it in its own folder (e.g.
`my-thing/index.html`) — it will be served at `/my-thing/` — and link to it
from a panel.

## Local preview

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```
