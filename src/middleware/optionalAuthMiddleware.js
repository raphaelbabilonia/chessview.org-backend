const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { usingMemoryStore } = require("../config/db");
const { byId, publicUser, store } = require("../utils/memoryStore");

const optionalAuthMiddleware = async (req, res, next) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) return next();

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || "change-me-in-production");
    const user = usingMemoryStore()
      ? publicUser(byId(store.users, payload.id))
      : await User.findById(payload.id).select("-passwordHash");
    if (user) req.user = user;
  } catch (error) {
    req.user = null;
  }

  next();
};

module.exports = optionalAuthMiddleware;
