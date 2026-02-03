import express from "express";
import axios from "axios";
import cheerio from "cheerio";
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

const fetchHeadlines = async () => {
  const response = await axios.get("https://www.telegraaf.nl", {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    },
  });
  const $ = cheerio.load(response.data);
  const discovered = [];

  $("a").each((_, element) => {
    const href = $(element).attr("href");
    const text = $(element).text().trim();
    if (!href || !text) return;
    if (!href.includes("telegraaf.nl")) {
      if (!href.startsWith("/")) return;
    }

    const url = normalizeLink(href);
    if (!url || headlines.has(url)) return;

    const title = text.replace(/\s+/g, " ");
    if (title.length < 12) return;

    headlines.set(url, {
      title,
      url,
      discoveredAt: new Date().toISOString(),
    });
    discovered.push(url);
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
