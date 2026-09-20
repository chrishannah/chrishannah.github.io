# chrishannah.dev

A base site and home for my development projects, experiments, and artifacts.
Served with [GitHub Pages](https://pages.github.com/) from this repository, and
(once DNS resolves) at [chrishannah.dev](https://chrishannah.dev).

## How it works

- Plain static HTML and CSS — no build step. What's committed is what's served.
- `.nojekyll` disables Jekyll processing, so self-contained artifacts (including
  files/folders whose names start with `_`) are served exactly as-is.
- `CNAME` points the site at the `chrishannah.dev` custom domain.

## Layout

| File / folder   | Purpose                                             |
| --------------- | --------------------------------------------------- |
| `index.html`    | Landing page — links to projects and artifacts.     |
| `style.css`     | Shared styles (light/dark aware, responsive).       |
| `404.html`      | Custom not-found page.                               |
| `CNAME`         | Custom domain configuration.                        |
| `.nojekyll`     | Serve files verbatim, no Jekyll build.              |

## Adding a project or artifact

1. Drop a self-contained project into its own folder, e.g. `my-thing/`, with an
   `index.html` inside. It will be available at `/my-thing/`.
2. Add a card linking to it in `index.html` by copying a `<li class="card">`
   block inside the project grid:

   ```html
   <li>
     <a class="card" href="/my-thing/">
       <h3 class="card-title">My Thing</h3>
       <p class="card-desc">A short description of what it does.</p>
     </a>
   </li>
   ```

## Local preview

Any static file server works, for example:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```
