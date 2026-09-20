// Fetch the latest post from each blog feed and cache it to data/feeds.json.
// Zero-dependency: minimal RSS/Atom/JSON-Feed parsing. Runs in GitHub Actions
// (server-side, so no browser CORS limits).

import { writeFile, mkdir } from "node:fs/promises";

const SITES = {
  "chrishannah.me": [
    "https://chrishannah.me/feed.xml",
    "https://chrishannah.me/feed/",
    "https://chrishannah.me/feed.json",
    "https://chrishannah.me/index.xml",
    "https://chrishannah.me/atom.xml",
    "https://chrishannah.me/rss.xml"
  ],
  "journeysthroughglass.net": [
    "https://journeysthroughglass.net/feed.xml",
    "https://journeysthroughglass.net/feed/",
    "https://journeysthroughglass.net/feed.json",
    "https://journeysthroughglass.net/index.xml",
    "https://journeysthroughglass.net/atom.xml",
    "https://journeysthroughglass.net/rss.xml"
  ],
  "codeandculture.uk": [
    "https://codeandculture.uk/feed.xml",
    "https://codeandculture.uk/feed/",
    "https://codeandculture.uk/feed.json",
    "https://codeandculture.uk/index.xml",
    "https://codeandculture.uk/atom.xml",
    "https://codeandculture.uk/rss.xml"
  ]
};

const UA = "chrishannah.dev-feed-bot (+https://chrishannah.dev)";

function decode(s) {
  if (!s) return "";
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/\s+/g, " ")
    .trim();
}

function pick(re, s) {
  const m = re.exec(s);
  return m ? m[1] : "";
}

function parse(body, contentType) {
  const trimmed = body.trim();
  // JSON Feed
  if (contentType.includes("json") || trimmed.startsWith("{")) {
    try {
      const j = JSON.parse(trimmed);
      const item = (j.items || [])[0];
      if (item) {
        return {
          title: decode(item.title || "Untitled"),
          url: item.url || item.external_url || "",
          date: item.date_published || item.date_modified || ""
        };
      }
    } catch {}
  }
  // Atom
  if (/<feed[\s>]/i.test(trimmed) && /<entry[\s>]/i.test(trimmed)) {
    const entry = pick(/<entry[\s\S]*?<\/entry>/i, trimmed) || "";
    const link =
      pick(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i, entry) ||
      pick(/<link[^>]*href=["']([^"']+)["']/i, entry);
    return {
      title: decode(pick(/<title[^>]*>([\s\S]*?)<\/title>/i, entry)),
      url: link,
      date: pick(/<(?:updated|published)[^>]*>([\s\S]*?)<\/(?:updated|published)>/i, entry)
    };
  }
  // RSS
  if (/<rss[\s>]/i.test(trimmed) || /<item[\s>]/i.test(trimmed)) {
    const item = pick(/<item[\s\S]*?<\/item>/i, trimmed) || "";
    return {
      title: decode(pick(/<title[^>]*>([\s\S]*?)<\/title>/i, item)),
      url: decode(pick(/<link[^>]*>([\s\S]*?)<\/link>/i, item)),
      date: pick(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i, item)
    };
  }
  return null;
}

async function fetchSite(urls) {
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/rss+xml, application/atom+xml, application/json, text/xml, */*" },
        redirect: "follow"
      });
      if (!res.ok) continue;
      const ct = (res.headers.get("content-type") || "").toLowerCase();
      const body = await res.text();
      const parsed = parse(body, ct);
      if (parsed && parsed.title) {
        parsed.date = parsed.date ? new Date(parsed.date).toISOString() : "";
        return parsed;
      }
    } catch {}
  }
  return null;
}

const out = { updated: new Date().toISOString(), feeds: {} };
for (const [site, urls] of Object.entries(SITES)) {
  const latest = await fetchSite(urls);
  if (latest) {
    out.feeds[site] = latest;
    console.log(`ok   ${site} -> ${latest.title}`);
  } else {
    console.log(`miss ${site} (no feed found)`);
  }
}

// Recent deployments (Vercel) — needs a VERCEL_TOKEN repo secret. A token
// can't live in the page, so this runs server-side and caches the result.
if (process.env.VERCEL_TOKEN) {
  try {
    const team = process.env.VERCEL_TEAM_ID ? `&teamId=${process.env.VERCEL_TEAM_ID}` : "";
    const r = await fetch(`https://api.vercel.com/v6/deployments?limit=8${team}`, {
      headers: { Authorization: `Bearer ${process.env.VERCEL_TOKEN}` }
    });
    if (r.ok) {
      const j = await r.json();
      const deps = (j.deployments || []).map((d) => {
        const m = d.meta || {};
        const msg = m.githubCommitMessage || m.gitCommitMessage || "";
        return {
          project: d.name || "",
          state: d.readyState || d.state || "",
          url: d.url ? (d.url.startsWith("http") ? d.url : "https://" + d.url) : "",
          ts: d.created || d.createdAt || d.ready || null,
          ref: m.githubCommitRef || m.gitCommitRef || "",
          msg: msg ? String(msg).split("\n")[0].slice(0, 80) : ""
        };
      });
      if (deps.length) {
        out.deployments = deps;
        console.log(`ok   deployments -> ${deps.length}`);
      }
    } else {
      console.log(`miss deployments (${r.status})`);
    }
  } catch {
    console.log("miss deployments (error)");
  }
} else {
  console.log("skip deployments (no VERCEL_TOKEN)");
}

await mkdir("data", { recursive: true });
await writeFile("data/feeds.json", JSON.stringify(out, null, 2) + "\n");
console.log(
  `wrote data/feeds.json (${Object.keys(out.feeds).length} feeds` +
  `${out.deployments ? ", " + out.deployments.length + " deploys" : ""})`
);
