const mongoose = require("mongoose");
const { seedMemoryStore } = require("../utils/memoryStore");

let memoryMode = process.env.MEMORY_STORE === "true";

const enableMemoryMode = async (reason) => {
  memoryMode = true;
  await seedMemoryStore();
  if (reason) {
    console.warn(`Using in-memory data store: ${reason}`);
  }
};

const connectDB = async () => {
  if (memoryMode) {
    await enableMemoryMode("MEMORY_STORE=true");
    return;
  }

  try {
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 3000
    });
    console.log("MongoDB connected");
  } catch (error) {
    if (process.env.NODE_ENV === "production") {
      throw error;
    }
    await enableMemoryMode("MongoDB is not reachable in this local environment");
  }
};

const usingMemoryStore = () => memoryMode;

module.exports = {
  connectDB,
  usingMemoryStore,
  enableMemoryMode
};
