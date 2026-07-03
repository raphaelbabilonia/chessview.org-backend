# Priority Sources for Chess News Aggregator

Objective: create an SEO-first chess news aggregator that shows only essential article metadata, short summaries, and always redirects users to the original article.

## General Rules

* Extract only basic metadata: title, publication date, author, source, category, language, country/region, original URL, image URL, and a short generated summary.
* Do **not** copy full articles.
* Do **not** republish paywalled content.
* Do **not** copy full interviews, full annotations, full PGN collections, or long excerpts.
* Respect robots.txt, terms of use, copyright rules, and rate limits.
* Prefer RSS feeds, APIs, sitemaps, or partnerships when available.
* Always store `sourceUrl`, `canonicalUrl`, and show clear attribution.
* Use news sources mainly for discovery, then redirect users to the original source.

---

## Priority 1 — Essential Global Chess News Sources for MVP

| Priority | Source | URL | Region | Access Type | Note |
| --------: | ------ | --- | ------ | ----------- | ---- |
| 1 | FIDE News | https://www.fide.com/news/ | Global | RSS / scraping / partnership | Official source for FIDE events, championships, federation news, ratings, and governance. |
| 2 | Chess.com News | https://www.chess.com/news | Global | RSS / scraping / partnership | One of the strongest global sources for breaking chess stories, elite events, online events, players, and platform news. |
| 3 | ChessBase News | https://en.chessbase.com | Global | RSS / scraping / partnership | Major long-running chess media source for tournament reports, interviews, product news, and game analysis. |
| 4 | The Week in Chess | https://theweekinchess.com | Global | RSS / scraping | Excellent for tournament coverage, weekly chess news, PGN links, and results discovery. |
| 5 | Lichess Blog | https://lichess.org/@/Lichess/blog | Global | API / RSS / scraping | Useful for Lichess platform updates, titled arenas, broadcasts, event coverage, and open-source chess ecosystem news. |
| 6 | Chessdom | https://www.chessdom.com | Global | RSS / scraping | High-volume chess news site covering live games, interviews, tournament reports, photos, and social reactions. |
| 7 | New In Chess | https://www.newinchess.com | Global | Scraping / partnership | More magazine/editorial than breaking news, but valuable for interviews, deep reports, podcasts, and premium-style chess journalism. |
| 8 | Take Take Take | https://taketaketake.com | Global | Partnership / scraping | Useful for modern event recaps, player-following, and mobile-first chess storytelling. |
| 9 | Chessable Blog | https://www.chessable.com/blog/ | Global | RSS / scraping | Useful for educational chess news, product updates, opening articles, and Chessable ecosystem content. |
| 10 | ChessTech News | https://www.chesstech.org | Global | RSS / scraping | Niche but useful for chess technology, tools, platforms, AI, broadcasting, and digital chess infrastructure. |

---

## Priority 2 — Important National / Regional Chess News Sources

| Priority | Source | URL | Region | Access Type | Note |
| --------: | ------ | --- | ------ | ----------- | ---- |
| 11 | US Chess News | https://new.uschess.org/news | USA | RSS / scraping | Official US Chess news source. Useful for American chess events, scholastic chess, federation updates, and national tournaments. |
| 12 | European Chess Union | https://www.europechess.org | Europe | RSS / scraping | Official ECU source for European championships, federation announcements, youth events, and continental chess news. |
| 13 | English Chess Federation | https://www.englishchess.org.uk/category/ecf-news/ | England / UK | RSS / scraping | Official English federation news, including team selections, ChessFest, youth events, arbiter updates, and national announcements. |
| 14 | Federscacchi | https://www.federscacchi.com/fsi/ | Italy | Scraping | Official Italian federation source for Italian chess news, national teams, youth events, championships, and federation communications. |
| 15 | Scacchierando | https://www.scacchierando.it | Italy | RSS / scraping | Strong Italian chess blog covering national and international chess news. Useful for Italy-first discovery and commentary. |
| 16 | FEDA | https://feda.org/feda2k16/category/noticias/ | Spain | Scraping | Official Spanish federation news. Useful for Spanish championships, youth events, circulars, and federation announcements. |
| 17 | Europe Échecs | https://www.europe-echecs.com/actualites.html | France | Scraping / partnership | Major French-language chess news source covering elite events, French chess, FIDE events, and editorial content. |
| 18 | Deutscher Schachbund | https://www.schachbund.de | Germany | Scraping | Official German chess federation. Useful for German federation news, national teams, championships, and announcements. |
| 19 | ChessBase India | https://www.chessbase.in | India | RSS / scraping / partnership | Very strong Indian chess media source. Useful for Indian players, tournaments, interviews, training stories, and youth chess. |
| 20 | All India Chess Federation | https://aicf.in | India | Scraping | Official Indian federation source for tournament news, announcements, arbiters, ratings-related posts, and national events. |
| 21 | Chess Federation of Canada | https://www.chess.ca/en/ | Canada | Scraping | Official Canadian chess federation. Useful for Canadian chess news, players, national federation notices, and newsletters. |

---

## Priority 3 — Mainstream Media / Discovery Sources, Not Primary Sources

These sources are useful for finding major chess stories that reach a broader audience. They should not be your main source if the original source is available.

| Source | URL | Recommended Use |
| ------ | --- | --------------- |
| Reuters Chess | https://www.reuters.com | High-authority source for major chess business, controversy, governance, and elite-event stories. |
| Associated Press | https://apnews.com | Useful for major international chess stories, obituaries, mainstream player profiles, and federation controversies. |
| The Guardian Chess | https://www.theguardian.com/sport/chess | Good for UK chess coverage, columns, puzzles, and public chess events. |
| Financial Times Chess | https://www.ft.com | Occasional high-quality chess columns and cultural/business coverage. Often paywalled. |
| Google News Search | https://news.google.com/search?q=chess | Discovery only. Use to find stories, then crawl or reference the original publisher if allowed. |
| Reddit r/chess | https://www.reddit.com/r/chess/ | Community signal and early discovery only. Always verify with original sources before publishing. |
| X / Twitter official accounts | https://x.com | Discovery only. Use official accounts from FIDE, Chess.com, Lichess, federations, players, and organizers. Prefer APIs or embeds. |
| YouTube chess channels | https://www.youtube.com | Discovery for interviews, recaps, and player statements. Do not scrape transcripts without checking rights. |

---

## Sources to Avoid as Primary News Sources

| Source | URL | Reason |
| ------ | --- | ------ |
| chess24 | https://chess24.com | Not an active primary source anymore. Better to rely on Chess.com and archived chess24 content only when relevant. |
| Random repost blogs | Various | Often duplicate Chess.com, FIDE, ChessBase, or federation content without original reporting. |
| Forums without moderation | Various | Useful for discovery, but too noisy and unreliable for automated publication. |
| Social media screenshots | Various | High risk of misinformation. Always verify with official source or original post. |

---

## Recommended Implementation Order

### Phase 1 — Global Chess News MVP

1. FIDE News
2. Chess.com News
3. ChessBase News
4. The Week in Chess
5. Lichess Blog
6. Chessdom

### Phase 2 — Italy + Europe Focus

1. Federscacchi
2. Scacchierando
3. European Chess Union
4. Europe Échecs
5. English Chess Federation
6. Deutscher Schachbund
7. FEDA Spain

### Phase 3 — India + North America

1. ChessBase India
2. All India Chess Federation
3. US Chess
4. Chess Federation of Canada

### Phase 4 — Discovery and Enrichment

1. Reuters
2. Associated Press
3. The Guardian Chess
4. Google News
5. Reddit r/chess
6. Official X/Twitter accounts
7. YouTube channels and podcasts

---

## Minimum Fields to Extract

~~~ts
type ChessNewsItem = {
  title: string;
  slug: string;
  summary?: string;
  sourceName: string;
  sourceUrl: string;
  canonicalUrl: string;
  author?: string;
  publishedAt?: string;
  updatedAt?: string;
  language: 'en' | 'it' | 'es' | 'fr' | 'de' | 'hi' | 'other';
  region?:
    | 'global'
    | 'europe'
    | 'usa'
    | 'italy'
    | 'india'
    | 'uk'
    | 'france'
    | 'germany'
    | 'spain'
    | 'canada'
    | 'other';
  category?:
    | 'tournament'
    | 'player'
    | 'fide'
    | 'federation'
    | 'online'
    | 'education'
    | 'technology'
    | 'interview'
    | 'opinion'
    | 'other';
  imageUrl?: string;
  tags?: string[];
  relatedTournamentId?: string;
  relatedPlayerIds?: string[];
  originalId?: string;
  contentHash?: string;
  lastCheckedAt: string;
};
~~~

---

## Suggested Categories

| Category | Description |
| -------- | ----------- |
| `tournament` | Event previews, round reports, final results, pairings, standings. |
| `player` | Player profiles, interviews, achievements, transfers, ratings. |
| `fide` | FIDE decisions, ratings, commissions, championships, regulations. |
| `federation` | National federation announcements, teams, calendars, policies. |
| `online` | Chess.com, Lichess, online events, titled arenas, streaming events. |
| `education` | Training content, chess improvement, scholastic chess, courses. |
| `technology` | Chess engines, AI, broadcasts, platforms, chess software, anti-cheating tools. |
| `interview` | Interviews with players, organizers, authors, coaches. |
| `opinion` | Editorials, columns, commentary. |
| `other` | Anything that does not fit cleanly elsewhere. |

---

## Important Technical Note

The hardest part will not be collecting chess news. It will be deduplication and source quality control.

The same story can appear on:

* FIDE
* Chess.com
* ChessBase
* Chessdom
* The Week in Chess
* a national federation website
* a tournament website
* player social media
* Reddit
* mainstream media

For deduplication, use:

* normalized title
* canonical URL
* source URL
* publication date
* mentioned players
* mentioned tournament
* mentioned city/country
* text similarity
* image similarity
* content hash
* external IDs when available

---

## Deduplication Strategy

### 1. Normalize the title

~~~ts
function normalizeTitle(title: string) {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
~~~

### 2. Create a soft match key

~~~ts
function createNewsMatchKey(item: ChessNewsItem) {
  const normalizedTitle = normalizeTitle(item.title);
  const date = item.publishedAt?.slice(0, 10) || 'unknown-date';

  return `${normalizedTitle}:${date}`;
}
~~~

### 3. Compare articles by similarity

Use a similarity score based on:

* title similarity
* same players mentioned
* same tournament mentioned
* same publication window
* same original source
* same image URL
* same canonical URL

A practical rule:

~~~ts
type DuplicateDecision = 'same_story' | 'related_story' | 'unique';

function classifyDuplicate(score: number): DuplicateDecision {
  if (score >= 0.9) return 'same_story';
  if (score >= 0.65) return 'related_story';
  return 'unique';
}
~~~

---

## SEO Recommendation

For each news item, create a lightweight page like:

~~~txt
/news/magnus-carlsen-wins-norway-chess-2026
~~~

Each page should contain:

* title
* source name
* publication date
* 2–4 sentence generated summary
* key entities: players, tournament, country
* link to original article
* related tournaments
* related players
* related news from other sources

Do **not** reproduce the full article.

---

## Final Recommendation

Start with a focused MVP:

* FIDE News
* Chess.com News
* ChessBase News
* The Week in Chess
* Lichess Blog
* Chessdom
* Federscacchi
* Scacchierando

Then expand by region:

* Europe: ECU, ECF, Europe Échecs, Deutscher Schachbund, FEDA
* India: ChessBase India, AICF
* North America: US Chess, Chess Federation of Canada

For a chess news aggregator, the best long-term advantage will be clean deduplication, strong attribution, multilingual tagging, and linking news to tournaments and players already in your database.