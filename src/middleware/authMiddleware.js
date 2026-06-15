const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { usingMemoryStore } = require("../config/db");
const { byId, publicUser, store } = require("../utils/memoryStore");

const authMiddleware = async (req, res, next) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ success: false, message: "Authentication required" });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = usingMemoryStore()
      ? publicUser(byId(store.users, payload.id))
      : await User.findById(payload.id).select("-passwordHash");

    if (!user) {
      return res.status(401).json({ success: false, message: "User not found" });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: "Invalid or expired token" });
  }
};

module.exports = authMiddleware;
