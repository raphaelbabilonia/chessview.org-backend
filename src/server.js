require("dotenv").config();
const app = require("./app");
const { connectDB } = require("./config/db");

const PORT = process.env.PORT || 5000;

connectDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Chess View API listening on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error("Failed to start server", error);
    process.exit(1);
  });
