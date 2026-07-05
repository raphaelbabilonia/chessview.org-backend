const { z } = require("zod");

const MAX_AGENT_ITEMS = Number(process.env.AGENT_COLLABORATION_MAX_ITEMS || 10);

const stringField = (max = 500) => z.string().trim().max(max);
const optionalString = (max = 500) => stringField(max).optional();
const optionalUrl = optionalString(2000);

const evidenceRefSchema = z
  .object({
    refId: optionalString(120),
    path: optionalString(500),
    sourceUrl: optionalUrl,
    canonicalUrl: optionalUrl,
    capturedAt: optionalString(80),
    excerpt: optionalString(600),
    notes: optionalString(600)
  })
  .strip();

const externalLinkSchema = z
  .object({
    label: optionalString(120),
    type: optionalString(80),
    url: stringField(2000),
    sourceName: optionalString(180)
  })
  .strip();

const agentSchema = z
  .object({
    name: stringField(120).optional(),
    version: optionalString(80),
    url: optionalUrl,
    contact: optionalString(200),
    repositoryUrl: optionalUrl
  })
  .strip()
  .optional();

const agentItemSchema = z
  .object({
    kind: z.enum(["event", "tournament", "news"]),
    title: stringField(220),
    description: optionalString(4000),
    summary: optionalString(900),
    slug: optionalString(140),
    startDate: optionalString(80),
    endDate: optionalString(80),
    country: optionalString(120),
    region: optionalString(120),
    city: optionalString(160),
    venue: optionalString(240),
    venueName: optionalString(240),
    address: optionalString(500),
    timeControl: optionalString(120),
    ratingType: z.enum(["", "FIDE", "national", "unrated"]).optional(),
    sourceName: optionalString(180),
    sourceUrl: optionalUrl,
    websiteUrl: optionalUrl,
    registrationUrl: optionalUrl,
    resultsUrl: optionalUrl,
    regulationsUrl: optionalUrl,
    canonicalUrl: optionalUrl,
    sourceHomeUrl: optionalUrl,
    author: optionalString(180),
    imageUrl: optionalUrl,
    publishedAt: optionalString(80),
    updatedAt: optionalString(80),
    language: optionalString(24),
    category: optionalString(80),
    tags: z.array(stringField(80)).max(20).optional(),
    relatedTournamentName: optionalString(220),
    relatedPlayerNames: z.array(stringField(160)).max(20).optional(),
    relatedCoverage: z.array(z.record(z.string(), z.any())).max(20).optional(),
    originalId: optionalString(240),
    contentHash: optionalString(160),
    dedupeKey: optionalString(300),
    confidence: z.number().finite().min(0).max(1).optional(),
    qualityFlags: z.array(stringField(120)).max(20).optional(),
    evidenceRefs: z.array(evidenceRefSchema).max(20).optional(),
    externalLinks: z.array(externalLinkSchema).max(20).optional(),
    metadata: z.record(z.string(), z.any()).optional(),
    articleBody: z.any().optional(),
    bodyHtml: z.any().optional(),
    content: z.any().optional(),
    fullText: z.any().optional()
  })
  .strip();

const publicSubmissionSchema = z
  .object({
    schemaVersion: z.literal(1),
    dryRun: z.boolean().optional(),
    runId: optionalString(180),
    agent: agentSchema,
    items: z.array(agentItemSchema).min(1).max(MAX_AGENT_ITEMS)
  })
  .strip();

module.exports = {
  MAX_AGENT_ITEMS,
  publicSubmissionSchema
};
