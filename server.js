import express from "express";
import axios from "axios";
import * as cheerio from "cheerio";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const port = process.env.PORT;
const refreshIntervalMs = 5 * 60 * 1000;
const headlines = new Map();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const normalizeLink = (href) => {
  if (!href) return null;
  if (href.startsWith("http")) return href;
  if (href.startsWith("/")) return `https://www.telegraaf.nl${href}`;
  return `https://www.telegraaf.nl/${href}`;
};

const fetchHomepageHtml = async () => {
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "nl-NL,nl;q=0.9,en;q=0.8",
  };

  try {
    const response = await axios.get("https://www.telegraaf.nl", { headers });
    return response.data;
  } catch (error) {
    const status = error.response?.status;
    if (status && status !== 403) {
      throw error;
    }
  }

  const fallbackResponse = await axios.get(
    "https://r.jina.ai/http://www.telegraaf.nl",
    { headers }
  );
  return fallbackResponse.data;
};

const fetchHeadlines = async () => {
  const html = await fetchHomepageHtml();
  const $ = cheerio.load(html);
  const discovered = [];

  const addHeadline = (title, url) => {
    if (!title || !url) return;
    const normalizedUrl = normalizeLink(url);
    if (!normalizedUrl) return;
    if (/\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(normalizedUrl)) return;
    if (headlines.has(normalizedUrl)) return;
    headlines.set(normalizedUrl, {
      title,
      url: normalizedUrl,
      discoveredAt: new Date().toISOString(),
    });
    discovered.push(normalizedUrl);
  };

  $('script[type="application/ld+json"]').each((_, element) => {
    const raw = $(element).contents().text();
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      const entries = Array.isArray(data) ? data : [data];
      entries.forEach((entry) => {
        if (!entry || entry["@type"] !== "NewsArticle") return;
        const title = entry.headline?.trim();
        const url = entry.mainEntityOfPage?.["@id"] || entry.url;
        if (!title || !url) return;
        addHeadline(title, url);
      });
    } catch (error) {
      console.warn("Skipping invalid ld+json block", error.message);
    }
  });

  const nextDataRaw = $("#__NEXT_DATA__").contents().text();
  if (nextDataRaw) {
    try {
      const nextData = JSON.parse(nextDataRaw);
      const visited = new Set();
      const walk = (value) => {
        if (!value || visited.has(value)) return;
        if (typeof value === "string") return;
        if (typeof value !== "object") return;
        visited.add(value);

        if (typeof value.url === "string") {
          const titleCandidate =
            value.title || value.headline || value.name || value.label;
          if (typeof titleCandidate === "string" && titleCandidate.length >= 12) {
            if (value.url.includes("telegraaf.nl")) {
              addHeadline(titleCandidate.trim(), value.url);
            }
          }
        }

        Object.values(value).forEach(walk);
      };
      walk(nextData);
    } catch (error) {
      console.warn("Skipping invalid __NEXT_DATA__ block", error.message);
    }
  }

  $("a").each((_, element) => {
    const href = $(element).attr("href");
    const text = $(element).text().trim();
    if (!href || !text) return;
    if (!href.includes("telegraaf.nl")) {
      if (!href.startsWith("/")) return;
    }

    const url = normalizeLink(href);
    if (!url) return;

    const title = text.replace(/\s+/g, " ");
    if (title.length < 12) return;

    addHeadline(title, url);
  });

  return discovered.length;
};

const refreshHeadlines = async () => {
  try {
    const added = await fetchHeadlines();
    if (added > 0) {
      console.log(`Added ${added} new headlines.`);
    }
  } catch (error) {
    console.error("Failed to refresh headlines", error.message);
  }
};

app.use(express.static(path.join(__dirname, "public")));

app.get("/api/headlines", (_req, res) => {
  const items = Array.from(headlines.values()).sort((a, b) =>
    b.discoveredAt.localeCompare(a.discoveredAt)
  );
  res.json({ items, lastUpdated: new Date().toISOString() });
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

refreshHeadlines();
setInterval(refreshHeadlines, refreshIntervalMs);
