const http = require("http");
const https = require("https");

const DEFAULT_TIMEOUT_MS = 20000;
const DEFAULT_USER_AGENT = "ChessViewScraper/0.1 (+https://chessview.org)";

const hostNextRequestAt = new Map();
const robotsCache = new Map();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getTransport = (url) => (url.protocol === "http:" ? http : https);

const requestRaw = (url, { body = null, headers = {}, method = "GET", timeoutMs = DEFAULT_TIMEOUT_MS } = {}) => {
  return new Promise((resolve, reject) => {
    const requestBody = body == null ? null : String(body);
    const chunks = [];
    const request = getTransport(url).request(
      url,
      {
        method,
        headers: {
          ...headers,
          ...(requestBody ? { "Content-Length": Buffer.byteLength(requestBody) } : {})
        },
        timeout: timeoutMs
      },
      (response) => {
        response.on("data", (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        response.on("end", () => {
          resolve({
            body: Buffer.concat(chunks),
            headers: response.headers,
            statusCode: response.statusCode || 0
          });
        });
      }
    );

    request.on("timeout", () => {
      request.destroy(new Error(`Request timed out after ${timeoutMs}ms`));
    });
    request.on("error", reject);
    request.end(requestBody || undefined);
  });
};

const requestText = async (url, options = {}) => {
  const response = await requestRaw(url, options);
  return {
    ...response,
    body: response.body.toString("utf8")
  };
};

const waitForRateLimit = async (url, rateLimitMs = 0) => {
  const delay = Math.max(Number(rateLimitMs || 0), 0);
  if (!delay) return;

  const key = url.host;
  const now = Date.now();
  const nextAt = hostNextRequestAt.get(key) || now;
  if (nextAt > now) {
    await sleep(nextAt - now);
  }
  hostNextRequestAt.set(key, Math.max(nextAt, now) + delay);
};

const ruleMatches = (path, rulePath) => {
  if (!rulePath) return false;
  return path.startsWith(rulePath);
};

const parseRobots = (body, userAgent = DEFAULT_USER_AGENT) => {
  const groups = [];
  let current = null;

  for (const rawLine of String(body || "").split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, "").trim();
    if (!line) continue;

    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) continue;

    const field = line.slice(0, separatorIndex).trim().toLowerCase();
    const value = line.slice(separatorIndex + 1).trim();

    if (field === "user-agent") {
      current = { agents: [value.toLowerCase()], allow: [], disallow: [] };
      groups.push(current);
      continue;
    }

    if (!current) continue;

    if (field === "allow") current.allow.push(value);
    if (field === "disallow") current.disallow.push(value);
  }

  const agent = String(userAgent).toLowerCase();
  const matchingGroups = groups.filter((group) =>
    group.agents.some((candidate) => candidate === "*" || agent.includes(candidate))
  );

  return matchingGroups.length ? matchingGroups : groups.filter((group) => group.agents.includes("*"));
};

const canFetchByRobots = async (url, { userAgent = DEFAULT_USER_AGENT, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) => {
  const robotsUrl = new URL("/robots.txt", url.origin);
  const cacheKey = robotsUrl.toString();

  if (!robotsCache.has(cacheKey)) {
    try {
      const response = await requestText(robotsUrl, {
        headers: {
          Accept: "text/plain",
          "Accept-Encoding": "identity",
          "User-Agent": userAgent
        },
        timeoutMs
      });
      robotsCache.set(cacheKey, response.statusCode >= 200 && response.statusCode < 300 ? response.body : "");
    } catch {
      robotsCache.set(cacheKey, "");
    }
  }

  const robots = robotsCache.get(cacheKey);
  if (!robots) return true;

  const path = `${url.pathname}${url.search}`;
  const groups = parseRobots(robots, userAgent);
  let bestRule = { type: "allow", path: "" };

  for (const group of groups) {
    for (const allowPath of group.allow) {
      if (ruleMatches(path, allowPath) && allowPath.length >= bestRule.path.length) {
        bestRule = { type: "allow", path: allowPath };
      }
    }

    for (const disallowPath of group.disallow) {
      if (ruleMatches(path, disallowPath) && disallowPath.length > bestRule.path.length) {
        bestRule = { type: "disallow", path: disallowPath };
      }
    }
  }

  return bestRule.type !== "disallow";
};

const fetchText = async (
  target,
  {
    body = null,
    headers = {},
    method = "GET",
    maxRedirects = 5,
    rateLimitMs = 0,
    respectRobots = false,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    userAgent = DEFAULT_USER_AGENT
  } = {}
) => {
  let url = target instanceof URL ? target : new URL(target);
  let currentMethod = method;

  if (respectRobots) {
    const allowed = await canFetchByRobots(url, { userAgent, timeoutMs });
    if (!allowed) {
      const error = new Error(`Blocked by robots.txt: ${url.toString()}`);
      error.status = 451;
      throw error;
    }
  }

  await waitForRateLimit(url, rateLimitMs);

  let response;
  for (let redirect = 0; redirect <= maxRedirects; redirect += 1) {
    response = await requestText(url, {
      body: currentMethod === "GET" ? null : body,
      headers: {
        Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
        "Accept-Encoding": "identity",
        "User-Agent": userAgent,
        ...headers
      },
      method: currentMethod,
      timeoutMs
    });

    if (![301, 302, 303, 307, 308].includes(response.statusCode) || !response.headers.location) break;
    url = new URL(response.headers.location, url);
    if ([301, 302, 303].includes(response.statusCode)) currentMethod = "GET";
    await waitForRateLimit(url, rateLimitMs);
  }

  if (response.statusCode < 200 || response.statusCode >= 300) {
    const error = new Error(`HTTP ${response.statusCode} from ${url.toString()}: ${response.body.slice(0, 200)}`);
    error.status = response.statusCode;
    throw error;
  }

  return response.body;
};

const fetchBuffer = async (
  target,
  {
    body = null,
    headers = {},
    maxBytes = 15 * 1024 * 1024,
    maxRedirects = 5,
    method = "GET",
    rateLimitMs = 0,
    respectRobots = false,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    userAgent = DEFAULT_USER_AGENT
  } = {}
) => {
  let url = target instanceof URL ? target : new URL(target);
  let currentMethod = method;

  if (respectRobots) {
    const allowed = await canFetchByRobots(url, { userAgent, timeoutMs });
    if (!allowed) {
      const error = new Error(`Blocked by robots.txt: ${url.toString()}`);
      error.status = 451;
      throw error;
    }
  }

  await waitForRateLimit(url, rateLimitMs);

  let response;
  for (let redirect = 0; redirect <= maxRedirects; redirect += 1) {
    response = await requestRaw(url, {
      body: currentMethod === "GET" ? null : body,
      headers: {
        Accept: "*/*",
        "Accept-Encoding": "identity",
        "User-Agent": userAgent,
        ...headers
      },
      method: currentMethod,
      timeoutMs
    });

    if (![301, 302, 303, 307, 308].includes(response.statusCode) || !response.headers.location) break;
    url = new URL(response.headers.location, url);
    if ([301, 302, 303].includes(response.statusCode)) currentMethod = "GET";
    await waitForRateLimit(url, rateLimitMs);
  }

  if (response.statusCode < 200 || response.statusCode >= 300) {
    const error = new Error(`HTTP ${response.statusCode} from ${url.toString()}: ${response.body.toString("utf8", 0, 200)}`);
    error.status = response.statusCode;
    throw error;
  }

  if (response.body.length > maxBytes) {
    const error = new Error(`Downloaded file exceeds max size of ${maxBytes} bytes: ${url.toString()}`);
    error.status = 413;
    throw error;
  }

  return {
    body: response.body,
    headers: response.headers,
    statusCode: response.statusCode,
    url: url.toString()
  };
};

const fetchJson = async (target, options = {}) => {
  const body = await fetchText(target, {
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.headers || {})
    }
  });

  try {
    return JSON.parse(body);
  } catch (error) {
    throw new Error(`Unable to parse JSON from ${target}: ${error.message}`);
  }
};

const fetchFormJson = async (target, fields = {}, options = {}) => {
  const body = new URLSearchParams(
    Object.fromEntries(
      Object.entries(fields).filter(([, value]) => value !== undefined && value !== null)
    )
  ).toString();

  return fetchJson(target, {
    ...options,
    body,
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      ...(options.headers || {})
    }
  });
};

module.exports = {
  DEFAULT_USER_AGENT,
  canFetchByRobots,
  fetchBuffer,
  fetchFormJson,
  fetchJson,
  fetchText,
  parseRobots
};
