import { Schema } from "mongoose";
import type { HistoryEntry } from "@/lib/admin/types";
import { defineModel } from "./_shared";
import { HISTORY_COLLECTION } from "./names";

/* ─────────────────────────────────────────────────────────────
   Studio History in MongoDB (collection: `studio_history`), used
   with CONTENT_SOURCE=mongo instead of .data/studio-history.ndjson.
   One document per change, append-only (see lib/admin/history.ts).
   `before` / `after` are whole content documents, kept exactly as
   they were (Mixed, never minimized).
   ───────────────────────────────────────────────────────────── */

const historyEntrySchema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    at: { type: String, required: true },
    user: {
      name: { type: String, default: "" },
      email: { type: String, default: "", index: true },
      role: { type: String, required: true },
    },
    action: { type: String, required: true },
    target: { type: Schema.Types.Mixed, required: true },
    title: { type: String, default: "" },
    file: { type: String, default: "" },
    summary: { type: String, default: "" },
    changes: { type: [String], default: [] },
    revokes: { type: String },
    before: { type: Schema.Types.Mixed, default: null },
    after: { type: Schema.Types.Mixed, default: null },
  },
  { collection: HISTORY_COLLECTION, versionKey: false, minimize: false },
);

export const HistoryEntryModel = defineModel<HistoryEntry>("StudioHistoryEntry", historyEntrySchema, HISTORY_COLLECTION);
