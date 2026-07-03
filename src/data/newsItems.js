const newsItems = [
  {
    id: "chessbase-simpsons-home-of-chess",
    title: "Simpson's in the Strand: The home of chess",
    sourceName: "ChessBase",
    sourceHomeUrl: "https://en.chessbase.com/",
    url: "https://en.chessbase.com/post/simpon-s-in-the-strand-the-home-of-chess",
    imageUrl: "https://en.chessbase.com/Portals/all/thumbs/131/131139.jpeg",
    publishedAt: "2026-07-03T00:00:00.000Z",
    category: "Culture",
    summary:
      "A historic London venue is leaning back into its chess identity, with new programming, a dedicated chess menu, and a rare blindfold exhibition by Luke McShane."
  },
  {
    id: "chesscom-3-0-thursday-july-2026",
    title: "Lazavik, Murzin, Taher Outright Winners Of 3 0 Thursday Tournaments",
    sourceName: "Chess.com",
    sourceHomeUrl: "https://www.chess.com/news",
    url: "https://www.chess.com/news/view/lazavik-murzin-taher-3-0-thursday-07-03-2026",
    imageUrl: "https://images.chesscomfiles.com/uploads/v1/news/2068699.d7fe4560.630x354o.fd188e8c1d9a.png",
    publishedAt: "2026-07-03T07:06:00.000Z",
    category: "Online",
    summary:
      "Three fast online events produced three clear winners, with Denis Lazavik, Volodar Murzin, and Yoseph Taher each taking their tournament without needing tiebreaks."
  },
  {
    id: "chessbase-zagreb-firouzja-three-points-clear",
    title: "Zagreb: In-form Firouzja now three points clear of the field",
    sourceName: "ChessBase",
    sourceHomeUrl: "https://en.chessbase.com/",
    url: "https://en.chessbase.com/post/super-croatia-2026-2",
    imageUrl: "https://en.chessbase.com/Portals/all/thumbs/131/131134.jpeg",
    publishedAt: "2026-07-03T00:00:00.000Z",
    category: "Tournament",
    summary:
      "Alireza Firouzja widened his lead in Zagreb after another strong rapid day, while Gukesh, Deac, Keymer, and Vachier-Lagrave kept the chase alive."
  },
  {
    id: "chesscom-wr-womens-tour-americas-2026",
    title: "Yip, Garifullina Qualify For WR Women's Chess Tour Grand Final",
    sourceName: "Chess.com",
    sourceHomeUrl: "https://www.chess.com/news",
    url: "https://www.chess.com/news/view/yip-garifullina-win-2026-wr-womens-chess-tour-americas",
    imageUrl: "https://images.chesscomfiles.com/uploads/v1/news/2068407.3dca48ac.300x169o.357b4ae5b569.jpg",
    publishedAt: "2026-07-03T02:40:00.000Z",
    category: "Women's chess",
    summary:
      "Carissa Yip and Leya Garifullina earned Grand Final places from the Americas leg of the WR Women's Chess Tour after separate rapid and blitz victories."
  },
  {
    id: "lichess-game-of-month-may-2026",
    title: "Lichess Game of the Month: May '26",
    sourceName: "Lichess",
    sourceHomeUrl: "https://lichess.org/blog",
    url: "https://lichess.org/@/Lichess/blog/lichess-game-of-the-month-may-26/H3C1d56C",
    imageUrl:
      "https://image.lichess1.org/display?fmt=webp&h=550&op=thumbnail&path=Anff6gqiZFUA.webp&w=880&sig=df0b095f059e6a05af1351ae6912bef4cc573182",
    publishedAt: "2026-07-02T12:29:51.381Z",
    category: "Game study",
    summary:
      "Lichess highlights a community game worth studying, turning one memorable battle into an accessible entry point for analysis and discussion."
  },
  {
    id: "chessbase-kcf-friendship-festival-2026",
    title: "KCF Friendship Festival Concludes",
    sourceName: "ChessBase",
    sourceHomeUrl: "https://en.chessbase.com/",
    url: "https://en.chessbase.com/post/kcf-friendship-festival-concludes",
    imageUrl: "https://en.chessbase.com/Portals/all/thumbs/131/131117.jpeg",
    publishedAt: "2026-07-02T00:00:00.000Z",
    category: "Open tournaments",
    summary:
      "The Kasparov Chess Foundation Friendship Festival wrapped up in Slovenia, with Xu Xiangyu winning a demanding open field after nine rounds."
  },
  {
    id: "chesscom-croatia-day-two-2026",
    title: "Firouzja Extends Lead As Gukesh Hits Back",
    sourceName: "Chess.com",
    sourceHomeUrl: "https://www.chess.com/news",
    url: "https://www.chess.com/news/view/2026-super-rapid-blitz-croatia-day-2",
    imageUrl: "https://images.chesscomfiles.com/uploads/v1/news/2068389.7734d9f6.300x169o.1b0d9f53cfae.png",
    publishedAt: "2026-07-03T06:36:00.000Z",
    category: "Tournament",
    summary:
      "Firouzja strengthened his tournament position in Croatia, while Gukesh recovered from an early setback to move back into the chasing group."
  },
  {
    id: "chessbase-international-chess-day-2026",
    title: "International Chess Day 2026: Celebrate, create and make a difference",
    sourceName: "ChessBase",
    sourceHomeUrl: "https://en.chessbase.com/",
    url: "https://en.chessbase.com/post/international-chess-day-2026-announcement",
    imageUrl: "https://en.chessbase.com/Portals/all/thumbs/131/131130.png",
    publishedAt: "2026-07-02T00:00:00.000Z",
    category: "Community",
    summary:
      "FIDE's International Chess Day programme is framed around participation, creative play, and chess projects with social impact around the world."
  },
  {
    id: "chesscom-croatia-day-one-2026",
    title: "Firouzja Grabs Sole Lead As Super Rapid & Blitz Croatia Begins",
    sourceName: "Chess.com",
    sourceHomeUrl: "https://www.chess.com/news",
    url: "https://www.chess.com/news/view/2026-super-rapid-blitz-croatia-day-1",
    imageUrl: "https://images.chesscomfiles.com/uploads/v1/news/2065537.518573b4.300x169o.27f183733910.png",
    publishedAt: "2026-07-01T00:00:00.000Z",
    category: "Tournament",
    summary:
      "The Zagreb rapid and blitz event opened with Firouzja in front, setting up an early Grand Chess Tour storyline around momentum and consistency."
  },
  {
    id: "chessbase-freestyle-2027-qualifiers",
    title: "Pranav Venkatesh and Anna Muzychuk qualify for 2027 FIDE Freestyle Chess World Championships",
    sourceName: "ChessBase",
    sourceHomeUrl: "https://en.chessbase.com/",
    url: "https://en.chessbase.com/post/freestyle-chess-wc-2027-pranav-muzychuk",
    imageUrl: "https://en.chessbase.com/Portals/all/thumbs/131/131129.jpeg",
    publishedAt: "2026-07-02T00:00:00.000Z",
    category: "Freestyle",
    summary:
      "Pranav Venkatesh and Anna Muzychuk secured places in the 2027 Freestyle Chess World Championship through a long online qualification path."
  },
  {
    id: "chesscom-july-2026-fide-ratings",
    title: "Carlsen Drops 18 Points, Remains Only 2800+ Player In World",
    sourceName: "Chess.com",
    sourceHomeUrl: "https://www.chess.com/news",
    url: "https://www.chess.com/news/view/july-2026-fide-ratings",
    imageUrl: "https://images.chesscomfiles.com/uploads/v1/news/2060765.3f75a040.300x169o.648015ed593f.png",
    publishedAt: "2026-07-01T00:00:00.000Z",
    category: "Ratings",
    summary:
      "The July rating list reshuffled several elite storylines, including a notable drop for Magnus Carlsen while he still remained above the 2800 mark."
  },
  {
    id: "lichess-world-team-blitz-2026",
    title: "FIDE World Team Blitz 2026: Dragon Chilling Clinches Double Title",
    sourceName: "Lichess",
    sourceHomeUrl: "https://lichess.org/blog",
    url: "https://lichess.org/@/Lichess/blog/fide-world-team-blitz-2026-dragon-chilling-clinches-double-title/NNCqdkrl",
    imageUrl:
      "https://image.lichess1.org/display?fmt=webp&h=550&op=thumbnail&path=aJanvGoit8JP.webp&w=880&sig=1c2abeb6e47a2f040a1e11cac13bed18c85b5aa9",
    publishedAt: "2026-06-21T12:35:42.692Z",
    category: "Team events",
    summary:
      "The World Team Blitz coverage follows Dragon Chilling's title run and gives readers an easy bridge into the event narrative and games."
  },
  {
    id: "chessbase-fide-ratings-july-2026",
    title: "FIDE ratings - July 2026",
    sourceName: "ChessBase",
    sourceHomeUrl: "https://en.chessbase.com/",
    url: "https://en.chessbase.com/post/fide-ratings-july-2026",
    imageUrl: "https://en.chessbase.com/Portals/all/thumbs/131/131118.jpeg",
    publishedAt: "2026-07-01T00:00:00.000Z",
    category: "Ratings",
    summary:
      "ChessBase looks at the July FIDE lists, including the senior elite, junior standings, and changes in the girls' rankings."
  },
  {
    id: "chesscom-dvorkovich-third-term-ticket",
    title: "Dvorkovich Confirms 3rd-Term Bid For FIDE President, Adds Turlov To Ticket",
    sourceName: "Chess.com",
    sourceHomeUrl: "https://www.chess.com/news",
    url: "https://www.chess.com/news/view/dvorkovich-confirms-bid-for-third-term-as-fide-president-adds-turlov-to-ticket",
    imageUrl: "https://images.chesscomfiles.com/uploads/v1/news/2059905.73851756.300x169o.cd9492168155.jpg",
    publishedAt: "2026-07-01T00:00:00.000Z",
    category: "Politics",
    summary:
      "FIDE election season is taking shape as Arkady Dvorkovich signals another presidential run and names a prominent running mate."
  },
  {
    id: "chessbase-leon-masters-2026",
    title: "Leon Masters: Le, Oro, Santos and Alekseenko face off in rapid knockout",
    sourceName: "ChessBase",
    sourceHomeUrl: "https://en.chessbase.com/",
    url: "https://en.chessbase.com/post/magistral-leon-2026-preview",
    imageUrl: "https://en.chessbase.com/Portals/all/thumbs/131/131109.png",
    publishedAt: "2026-07-01T00:00:00.000Z",
    category: "Tournament",
    summary:
      "The Leon Masters returns as a compact rapid knockout, mixing an established defending champion, local representation, and Faustino Oro's rising profile."
  },
  {
    id: "chesscom-martinez-titled-tuesday-june-2026",
    title: "Martinez Magic Makes For Another Titled Tuesday Victory",
    sourceName: "Chess.com",
    sourceHomeUrl: "https://www.chess.com/news",
    url: "https://www.chess.com/news/view/martinez-wins-titled-tuesday-june-30-2026",
    imageUrl: "https://images.chesscomfiles.com/uploads/v1/news/2060829.5467a8cc.300x169o.188b3d04d588.png",
    publishedAt: "2026-06-30T00:00:00.000Z",
    category: "Online",
    summary:
      "Jose Martinez added another Titled Tuesday win with a dominant unbeaten score, continuing his strong run in Chess.com's weekly elite arena."
  },
  {
    id: "chessbase-kazchess-masters-almaty-2026",
    title: "KazChess Masters in Almaty: Shankland, Kovalenko start with wins",
    sourceName: "ChessBase",
    sourceHomeUrl: "https://en.chessbase.com/",
    url: "https://en.chessbase.com/post/kazchess-masters-almaty-2026-r1",
    imageUrl: "https://en.chessbase.com/Portals/all/thumbs/131/131107.jpeg",
    publishedAt: "2026-07-01T00:00:00.000Z",
    category: "Tournament",
    summary:
      "The KazChess Masters opened in Almaty with a mix of experienced grandmasters and local talents, and the first round already produced decisive games."
  },
  {
    id: "chesscom-carlsen-15-years-number-one",
    title: "Magnus Carlsen Reaches 15 Years Unbroken As World No. 1",
    sourceName: "Chess.com",
    sourceHomeUrl: "https://www.chess.com/news",
    url: "https://www.chess.com/news/view/magnus-carlsen-15-years-unbroken-world-number-one",
    imageUrl: "https://images.chesscomfiles.com/uploads/v1/news/2059939.08b2886e.300x169o.9ab5094e04ea.jpg",
    publishedAt: "2026-06-30T00:00:00.000Z",
    category: "Players",
    summary:
      "Carlsen's long reign as the top-rated player reaches another milestone, even as the competitive pressure around the rating list keeps growing."
  },
  {
    id: "chessbase-super-croatia-preview-2026",
    title: "Elite field gathers in Zagreb for Super Rapid & Blitz Croatia",
    sourceName: "ChessBase",
    sourceHomeUrl: "https://en.chessbase.com/",
    url: "https://en.chessbase.com/post/super-croatia-2026-preview",
    imageUrl: "https://en.chessbase.com/Portals/all/thumbs/131/131089.jpeg",
    publishedAt: "2026-06-30T00:00:00.000Z",
    category: "Tournament",
    summary:
      "A Grand Chess Tour stop in Zagreb brings together several top-20 players for rapid and blitz, with major standings implications across five days."
  },
  {
    id: "chessbase-monthly-dragon-ganguly-a5",
    title: "Ganguly's stunning a5 Attack - The Monthly Dragon",
    sourceName: "ChessBase",
    sourceHomeUrl: "https://en.chessbase.com/",
    url: "https://en.chessbase.com/post/ganguly-s-stunning-a5-attack-the-monthly-dragon",
    imageUrl: "https://en.chessbase.com/Portals/all/thumbs/131/131086%20(2).jpeg",
    publishedAt: "2026-06-30T00:00:00.000Z",
    category: "Training",
    summary:
      "A Dragon Sicilian model game becomes the anchor for a strategic lesson about queenside activity, timing, and turning pressure into tactics."
  }
];

const MAX_NEWS_LIMIT = 100;

const parsePositiveInt = (value, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(Math.trunc(parsed), 1);
};

const getNewsItems = ({ limit } = {}) => {
  const normalizedLimit =
    limit === undefined ? newsItems.length : Math.min(parsePositiveInt(limit, newsItems.length), MAX_NEWS_LIMIT);
  return newsItems.slice(0, normalizedLimit);
};

const getFeaturedNews = (limit = 6) => getNewsItems({ limit });

const getNewsSources = (items = newsItems) =>
  Object.values(
    items.reduce((sources, item) => {
      const key = item.sourceName;
      sources[key] ||= {
        name: item.sourceName,
        url: item.sourceHomeUrl,
        count: 0
      };
      sources[key].count += 1;
      return sources;
    }, {})
  );

module.exports = {
  getFeaturedNews,
  getNewsItems,
  getNewsSources,
  newsItems
};
