const express = require("express");
const {
  createScrapeSource,
  ensureDefaultSources,
  getScrapeHealth,
  getScrapeJob,
  listScrapeJobs,
  listScrapeSources,
  runDueSources,
  runScrapeSourceNow,
  updateScrapeSource
} = require("../controllers/scrapeController");
const authMiddleware = require("../middleware/authMiddleware");
const requireRole = require("../middleware/roleMiddleware");

const router = express.Router();

router.use(authMiddleware, requireRole("admin"));

router.get("/scrape-health", getScrapeHealth);
router.get("/scrape-sources", listScrapeSources);
router.post("/scrape-sources/defaults", ensureDefaultSources);
router.post("/scrape-sources", createScrapeSource);
router.patch("/scrape-sources/:id", updateScrapeSource);
router.post("/scrape-sources/:id/run", runScrapeSourceNow);

router.post("/scrape-jobs/run-due", runDueSources);
router.get("/scrape-jobs", listScrapeJobs);
router.get("/scrape-jobs/:id", getScrapeJob);

module.exports = router;
