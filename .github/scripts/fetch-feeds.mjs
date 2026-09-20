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
const GH_USER = "chrishannah";

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

// Current focus (Minifocus). The endpoint appears to allowlist by origin, so
// we present as chrishannah.me (which is allowlisted). Try the plain-text
// endpoint first, then fall back to extracting it from the JS embed.
async function fetchFocus() {
  const headers = {
    "User-Agent": UA,
    Referer: "https://chrishannah.me/",
    Origin: "https://chrishannah.me"
  };
  const clean = (s) => (s || "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
  // A focus is a short human sentence — reject code, CSS, font files, markup.
  const isFocusText = (s) =>
    !!s && s.length <= 240 &&
    !/[{}]|@font-face|font-family|url\(|<\/|=>|function|:root|\.ttf|\.woff|https?:\/\/fonts|;\s*}/i.test(s) &&
    /[a-z]/i.test(s);

  async function tryUrl(url) {
    try {
      const r = await fetch(url, { headers });
      console.log(`focus ${url} -> ${r.status}`);
      if (!r.ok) return "";
      const ct = (r.headers.get("content-type") || "").toLowerCase();
      const body = await r.text();
      if (ct.includes("json") || body.trim().startsWith("{")) {
        try {
          const j = JSON.parse(body);
          const t = clean(j.focus || j.text || j.status || j.message || j.content || "");
          return isFocusText(t) ? t : "";
        } catch { return ""; }
      }
      const t = clean(body);
      return isFocusText(t) ? t : "";
    } catch {
      console.log(`focus ${url} -> error`);
      return "";
    }
  }

  // Direct endpoints first.
  for (const u of [
    "https://minifocus.app/embed/chris.txt",
    "https://minifocus.app/embed/chris.json"
  ]) {
    const t = await tryUrl(u);
    if (t) return t;
  }

  // Otherwise discover the data URL the JS embed calls at runtime.
  try {
    const r = await fetch("https://minifocus.app/embed/chris.js", { headers });
    console.log(`focus chris.js -> ${r.status}`);
    if (r.ok) {
      const js = await r.text();
      const urls = new Set();
      (js.match(/https?:\/\/[^"'`\s)]+/g) || []).forEach((u) => urls.add(u));
      (js.match(/["'`](\/[^"'`\s)]+)["'`]/g) || []).forEach((u) => urls.add(u.slice(1, -1)));
      for (let u of urls) {
        if (!/chris|focus|embed|api/i.test(u)) continue;
        if (/\.js(\?|$)/.test(u)) continue;
        if (u.startsWith("//")) u = "https:" + u;
        else if (u.startsWith("/")) u = "https://minifocus.app" + u;
        const t = await tryUrl(u);
        if (t) return t;
      }
    }
  } catch {
    console.log("focus chris.js -> error");
  }
  return "";
}

const focus = await fetchFocus();
if (focus) {
  out.focus = focus;
  console.log(`ok   focus -> ${focus.slice(0, 60)}`);
} else {
  console.log("miss focus");
}

// GitHub activity — fetched server-side (authenticated, so no per-visitor
// rate limits) and cached for the client to render.
async function fetchGitHub() {
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  const h = { "User-Agent": UA, Accept: "application/vnd.github+json" };
  if (token) h.Authorization = `Bearer ${token}`;
  const gh = { stats: {} };

  try {
    const r = await fetch(`https://api.github.com/users/${GH_USER}`, { headers: h });
    console.log(`github user -> ${r.status}`);
    if (r.ok) {
      const u = await r.json();
      gh.stats.repos = u.public_repos;
      gh.stats.followers = u.followers;
    }
  } catch { console.log("github user -> error"); }

  try {
    const r = await fetch(
      `https://api.github.com/users/${GH_USER}/repos?per_page=100&type=owner&sort=pushed`,
      { headers: h }
    );
    console.log(`github repos -> ${r.status}`);
    if (r.ok) {
      const repos = (await r.json()).filter((x) => !x.fork);
      gh.stats.stars = repos.reduce((a, x) => a + (x.stargazers_count || 0), 0);
      const counts = {};
      let total = 0;
      repos.forEach((x) => { if (x.language) { counts[x.language] = (counts[x.language] || 0) + 1; total++; } });
      if (total) {
        gh.languages = Object.keys(counts)
          .map((k) => ({ name: k, pct: Math.round((counts[k] / total) * 100) }))
          .sort((a, b) => b.pct - a.pct)
          .slice(0, 6);
      }
    }
  } catch { console.log("github repos -> error"); }

  try {
    const r = await fetch(
      `https://api.github.com/users/${GH_USER}/events/public?per_page=40`,
      { headers: h }
    );
    console.log(`github events -> ${r.status}`);
    if (r.ok) {
      const events = await r.json();
      const rows = [];
      for (const ev of events) {
        if (rows.length >= 9) break;
        const repo = ev.repo && ev.repo.name ? ev.repo.name.split("/").pop() : "";
        let msg = null;
        if (ev.type === "PushEvent" && ev.payload.commits && ev.payload.commits.length) {
          msg = ev.payload.commits[ev.payload.commits.length - 1].message.split("\n")[0];
        } else if (ev.type === "CreateEvent" && ev.payload.ref_type === "repository") {
          msg = "created repository";
        } else if (ev.type === "CreateEvent" && ev.payload.ref_type === "tag") {
          msg = "tagged " + ev.payload.ref;
        } else if (ev.type === "ReleaseEvent") {
          msg = "released " + (ev.payload.release ? ev.payload.release.tag_name : "");
        } else if (ev.type === "PullRequestEvent") {
          const pr = ev.payload.pull_request || {};
          let a = ev.payload.action;
          if (a === "closed" && pr.merged) a = "merged";
          msg = a + " PR" + (pr.number ? " #" + pr.number : "") + (pr.title ? ": " + pr.title : "");
        } else if (ev.type === "IssuesEvent") {
          const is = ev.payload.issue || {};
          msg = ev.payload.action + " issue" + (is.number ? " #" + is.number : "") + (is.title ? ": " + is.title : "");
        }
        if (msg) rows.push({ repo, msg, time: ev.created_at });
      }
      gh.commits = rows;
    }
  } catch { console.log("github events -> error"); }

  // Contribution calendar via GraphQL (needs a token).
  if (token) {
    try {
      const query = "query($login:String!){user(login:$login){contributionsCollection{contributionCalendar{totalContributions weeks{contributionDays{date contributionCount contributionLevel}}}}}}";
      const r = await fetch("https://api.github.com/graphql", {
        method: "POST",
        headers: { ...h, "Content-Type": "application/json" },
        body: JSON.stringify({ query, variables: { login: GH_USER } })
      });
      console.log(`github graphql -> ${r.status}`);
      if (r.ok) {
        const j = await r.json();
        const cal = j.data && j.data.user && j.data.user.contributionsCollection.contributionCalendar;
        if (cal) {
          const lvl = { NONE: 0, FIRST_QUARTILE: 1, SECOND_QUARTILE: 2, THIRD_QUARTILE: 3, FOURTH_QUARTILE: 4 };
          const days = [];
          cal.weeks.forEach((w) => w.contributionDays.forEach((d) =>
            days.push({ d: d.date, c: d.contributionCount, l: lvl[d.contributionLevel] || 0 })));
          gh.total = cal.totalContributions;
          gh.days = days;
          let streak = 0;
          const today = new Date().toISOString().slice(0, 10);
          for (let i = days.length - 1; i >= 0; i--) {
            if (days[i].c > 0) streak++;
            else if (days[i].d === today) continue;
            else break;
          }
          gh.stats.streak = streak;
        }
      }
    } catch { console.log("github graphql -> error"); }
  } else {
    console.log("github graphql -> skipped (no token)");
  }

  return gh;
}

const github = await fetchGitHub();
if (github && (github.days || github.commits || (github.stats && github.stats.repos != null))) {
  out.github = github;
  console.log(`ok   github (${github.days ? github.days.length + " days" : "no cal"}, ${github.commits ? github.commits.length + " commits" : "0 commits"})`);
} else {
  console.log("miss github");
}

// Recent production deployments (Vercel) — needs a VERCEL_TOKEN repo secret. A token
// can't live in the page, so this runs server-side and caches the result.
if (process.env.VERCEL_TOKEN) {
  try {
    const team = process.env.VERCEL_TEAM_ID ? `&teamId=${process.env.VERCEL_TEAM_ID}` : "";
    const r = await fetch(`https://api.vercel.com/v6/deployments?limit=10&target=production${team}`, {
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
  `${out.focus ? ", focus" : ""}${out.github ? ", github" : ""}` +
  `${out.deployments ? ", " + out.deployments.length + " deploys" : ""})`
);
