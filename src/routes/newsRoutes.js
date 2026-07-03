const express = require("express");
const { listNews, listNewsSources } = require("../controllers/newsController");

const router = express.Router();

router.get("/", listNews);
router.get("/sources", listNewsSources);

module.exports = router;
