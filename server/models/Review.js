const mongoose = require("mongoose");

const ReviewSchema = new mongoose.Schema(
  {
    input: { type: String, required: true },
    inputType: { type: String, enum: ["code", "diff"], default: "code" },
    language: { type: String, default: "" },
    context: { type: String, default: "" },
    review: {
      type: Object,
      required: true,
    },
  },
  { timestamps: true }
);

const Review = mongoose.model("Review", ReviewSchema);

// Lightweight hook to let routes decide if persistence is possible.
// (If no MONGODB_URI is set, the server runs without connecting.)
const canPersist = Boolean(process.env.MONGODB_URI);

module.exports = {
  Review,
  canPersist,
  // Attach to model for convenience.
  get canPersist() {
    return canPersist;
  },
};

