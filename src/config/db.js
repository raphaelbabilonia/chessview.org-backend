const mongoose = require("mongoose");
const logger = require("../services/logger");

const connectDB = async () => {
  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 3000
  });
  logger.info("database.connected", { database: mongoose.connection.name });
};

module.exports = {
  connectDB
};
