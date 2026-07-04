const { trackingBatchSchema } = require("../validation/trackingSchemas");
const {
  dashboardCode,
  getTrackingDashboard,
  ingestTrackingEvents,
  isTrackingEnabled,
  originAllowed,
  rollupTrackingAnalytics
} = require("../services/trackingService");

const ingestEvents = async (req, res, next) => {
  try {
    if (!originAllowed(req.get("Origin"))) {
      return res.status(403).json({ success: false, message: "Tracking origin is not allowed" });
    }

    const parsed = trackingBatchSchema.safeParse(req.body);
    if (!parsed.success) {
      const flat = parsed.error.flatten();
      return res.status(422).json({
        success: false,
        message: flat.formErrors[0] || "Invalid tracking payload",
        errors: flat.fieldErrors
      });
    }

    const result = await ingestTrackingEvents({ events: parsed.data.events, req });
    return res.status(result.disabled ? 202 : 201).json({
      success: true,
      data: result
    });
  } catch (error) {
    return next(error);
  }
};

const getDashboard = async (req, res, next) => {
  try {
    if (req.params.code !== dashboardCode()) {
      return res.status(404).json({ success: false, message: "Tracking dashboard not found" });
    }

    if (req.query.rollup === "true" && isTrackingEnabled()) {
      await rollupTrackingAnalytics({ days: Number(req.query.days) || 30 });
    }

    const data = await getTrackingDashboard({ days: Number(req.query.days) || 30 });
    return res.json({ success: true, data });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getDashboard,
  ingestEvents
};
