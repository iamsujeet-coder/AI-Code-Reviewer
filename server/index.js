const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const path = require("path");
const fs = require("fs");

const { reviewRouter } = require("./routes/review");

dotenv.config();

const app = express();
app.use(cors());
app.use(morgan("dev"));
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

app.get("/api/debug", (req, res) => {
  res.json({
    aiProvider: process.env.AI_PROVIDER,
    hasOpenAiKey: Boolean(process.env.OPENAI_API_KEY),
    hasHfKey: Boolean(process.env.HF_API_KEY),
    hfModel: process.env.HF_MODEL || null,
    hfBaseUrl: process.env.HF_BASE_URL || null,
  });
});

app.use("/api/review", reviewRouter);

// Serve the built React frontend for a "frontend+backend together" deploy.
const distPath = path.join(__dirname, "..", "client", "dist");
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  // Middleware to serve index.html for SPA routes
  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(distPath, "index.html"));
  });
} else {
  // eslint-disable-next-line no-console
  console.log("client/dist not found; skipping frontend static serving");
}

const port = process.env.PORT || 5000;
const mongoUri = process.env.MONGODB_URI;

async function start() {
  if (mongoUri) {
    await mongoose.connect(mongoUri);
    // eslint-disable-next-line no-console
    console.log("MongoDB connected");
  } else {
    // eslint-disable-next-line no-console
    console.log("MONGODB_URI not set; running without persistence");
  }

  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Server listening on port ${port}`);
  });
}

start().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});

