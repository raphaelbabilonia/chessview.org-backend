require("dotenv").config({ quiet: true });
const app = require("./app");
const { connectDB } = require("./config/db");
const { validateEnv } = require("./config/env");

const PORT = process.env.PORT || 5000;

try {
  validateEnv();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

connectDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Chess View API listening on port ${PORT}
Environment ***${process.env.NODE_ENV}***`);
    });
  })
  .catch((error) => {
    console.error("Failed to start server", error);
    process.exit(1);
  });
