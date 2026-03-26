const express = require("express");
const { z } = require("zod");

const { reviewCode } = require("../services/reviewer");
const { Review, canPersist } = require("../models/Review");

const reviewRequestSchema = z.object({
  input: z.string().min(1),
  inputType: z.enum(["code", "diff"]).default("code"),
  language: z.string().min(1).optional(),
  context: z.string().min(1).optional(),
});

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const payload = reviewRequestSchema.parse(req.body);

    const review = await reviewCode(payload);

    // Optional persistence: only save if Mongo is available.
    // (We detect by presence of connection state.)
    if (canPersist) {
      try {
        const doc = await Review.create({
          ...payload,
          review,
        });
        void doc;
      } catch {
        // If persistence fails, still return the review.
      }
    }

    res.json({ ok: true, review });
  } catch (err) {
    if (err?.name === "ZodError") {
      return res.status(400).json({ ok: false, error: "Invalid input" });
    }
    res.status(500).json({ ok: false, error: "Server error" });
  }
});

module.exports = { reviewRouter: router };

