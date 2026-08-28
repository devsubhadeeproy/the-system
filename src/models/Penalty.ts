import {
  Schema,
  model,
  models,
  type HydratedDocument,
  type Model,
  type Types,
} from "mongoose";

import { PLAYER_ATTRIBUTES, type PlayerAttribute } from "@/models/User";

export const PENALTY_TYPES = [
  "ATTRIBUTE_LOSS",
  "XP_LOSS",
  "GOLD_LOSS",
] as const;

export type PenaltyType = (typeof PENALTY_TYPES)[number];

export interface Penalty {
  userId: Types.ObjectId;

  /**
   * Daily quest that caused this penalty.
   */
  questKey: string;

  /**
   * Calendar day that was missed.
   */
  dateKey: string;

  type: PenaltyType;

  /**
   * Amount lost.
   *
   * Example:
   * 1 attribute point
   * 25 XP
   * 50 gold
   */
  amount: number;

  /**
   * Required for ATTRIBUTE_LOSS.
   */
  attribute?: PlayerAttribute;

  reason: string;

  /**
   * Whether the actual User mutation has been applied.
   *
   * This is useful for idempotent recovery.
   */
  applied: boolean;

  appliedAt?: Date;

  createdAt: Date;
}

export type PenaltyDocument = HydratedDocument<Penalty>;

const penaltySchema = new Schema<Penalty>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    questKey: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },

    dateKey: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
    },

    type: {
      type: String,
      required: true,
      enum: PENALTY_TYPES,
    },

    amount: {
      type: Number,
      required: true,
      min: 0,
    },

    attribute: {
      type: String,
      enum: PLAYER_ATTRIBUTES,
      required: false,
    },

    reason: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },

    applied: {
      type: Boolean,
      required: true,
      default: false,
    },

    appliedAt: {
      type: Date,
      required: false,
    },

    createdAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
  },
  {
    versionKey: false,
  },
);

/**
 * Prevent the same penalty from being created twice
 * for the same quest/day.
 *
 * This is extremely important for rollover.
 */
penaltySchema.index(
  {
    userId: 1,
    questKey: 1,
    dateKey: 1,
  },
  {
    unique: true,
  },
);

penaltySchema.index({
  userId: 1,
  dateKey: -1,
});

penaltySchema.index({
  userId: 1,
  applied: 1,
});

const PenaltyModel =
  (models.Penalty as Model<Penalty> | undefined) ??
  model<Penalty>("Penalty", penaltySchema);

export default PenaltyModel;
