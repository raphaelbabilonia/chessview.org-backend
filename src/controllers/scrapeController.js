const ScrapeJob = require("../models/ScrapeJob");
const ScrapeSource = require("../models/ScrapeSource");
const {
  compactJob,
  ensureDefaultScrapeSources,
  runDueScrapeSources,
  runScrapeSource
} = require("../services/scrapeRunner");

const cleanSourcePayload = (body = {}) => ({
  name: body.name,
  key: body.key,
  type: body.type,
  enabled: body.enabled,
  config: body.config,
  intervalMinutes: body.intervalMinutes,
  nextRunAt: body.nextRunAt
});

const stripUndefined = (value) =>
  Object.fromEntries(Object.entries(value).filter(([, fieldValue]) => fieldValue !== undefined));

const listScrapeSources = async (req, res) => {
  const sources = await ScrapeSource.find({}).sort({ createdAt: -1 }).lean();
  res.json({ success: true, data: sources });
};

const getScrapeHealth = async (req, res) => {
  const now = new Date();
  const [sourceCount, enabledCount, dueCount, failedJobs, runningJobs, recentJobs, sourcesWithErrors] =
    await Promise.all([
      ScrapeSource.countDocuments({}),
      ScrapeSource.countDocuments({ enabled: true }),
      ScrapeSource.countDocuments({
        enabled: true,
        $or: [{ nextRunAt: null }, { nextRunAt: { $lte: now } }]
      }),
      ScrapeJob.countDocuments({ status: "failed" }),
      ScrapeJob.countDocuments({ status: "running" }),
      ScrapeJob.find({}).sort({ createdAt: -1 }).limit(10).lean(),
      ScrapeSource.find({ lastError: { $ne: "" } })
        .sort({ lastErrorAt: -1 })
        .limit(10)
        .select("name key type lastErrorAt lastError")
        .lean()
    ]);

  res.json({
    success: true,
    data: {
      ok: runningJobs < 10,
      now,
      sources: {
        total: sourceCount,
        enabled: enabledCount,
        due: dueCount,
        withErrors: sourcesWithErrors.length
      },
      jobs: {
        failed: failedJobs,
        running: runningJobs,
        recent: recentJobs.map(compactJob)
      },
      sourceErrors: sourcesWithErrors
    }
  });
};

const ensureDefaultSources = async (req, res) => {
  const sources = await ensureDefaultScrapeSources();
  res.status(201).json({ success: true, data: sources });
};

const createScrapeSource = async (req, res) => {
  const payload = stripUndefined(cleanSourcePayload(req.body));
  const source = await ScrapeSource.create(payload);
  res.status(201).json({ success: true, data: source });
};

const updateScrapeSource = async (req, res) => {
  const payload = stripUndefined(cleanSourcePayload(req.body));
  delete payload.key;
  delete payload.type;

  const source = await ScrapeSource.findByIdAndUpdate(req.params.id, payload, {
    new: true,
    runValidators: true
  });

  if (!source) return res.status(404).json({ success: false, message: "Scrape source not found" });
  res.json({ success: true, data: source });
};

const runScrapeSourceNow = async (req, res) => {
  const source = await ScrapeSource.findById(req.params.id);
  if (!source) return res.status(404).json({ success: false, message: "Scrape source not found" });

  const job = await runScrapeSource(source, {
    mode: req.body.mode,
    requestedBy: req.user?._id,
    config: req.body.config || {}
  });

  res.status(202).json({ success: true, data: job });
};

const runDueSources = async (req, res) => {
  const jobs = await runDueScrapeSources({
    mode: req.body.mode,
    limit: req.body.limit
  });

  res.status(202).json({ success: true, data: jobs });
};

const listScrapeJobs = async (req, res) => {
  const filter = req.query.source ? { source: req.query.source } : {};
  const limit = Math.min(Number(req.query.limit || 50), 100);
  const jobs = await ScrapeJob.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
  res.json({ success: true, data: jobs });
};

const getScrapeJob = async (req, res) => {
  const job = await ScrapeJob.findById(req.params.id);
  if (!job) return res.status(404).json({ success: false, message: "Scrape job not found" });
  res.json({ success: true, data: compactJob(job) });
};

module.exports = {
  createScrapeSource,
  ensureDefaultSources,
  getScrapeHealth,
  getScrapeJob,
  listScrapeJobs,
  listScrapeSources,
  runDueSources,
  runScrapeSourceNow,
  updateScrapeSource
};
