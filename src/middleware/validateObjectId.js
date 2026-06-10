const mongoose = require("mongoose");
const { usingMemoryStore } = require("../config/db");

const validateObjectId = (paramName) => (req, res, next) => {
  const value = req.params[paramName];
  if (usingMemoryStore() || mongoose.Types.ObjectId.isValid(value)) {
    return next();
  }
  return res.status(400).json({ success: false, message: `Invalid ${paramName}` });
};

module.exports = validateObjectId;
