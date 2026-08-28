import {
  Schema,
  model,
  models,
  type HydratedDocument,
  type Model,
} from "mongoose";

import { PLAYER_ATTRIBUTES, type PlayerAttribute } from "@/models/User";

export const QUEST_TYPES = ["DAILY", "MAIN", "SIDE", "URGENT"] as const;

export const QUEST_TARGET_ATTRIBUTES = [...PLAYER_ATTRIBUTES, "NONE"] as const;

export const QUEST_SCALING_DIRECTIONS = ["UP", "DOWN", "CONSTANT"] as const;

export type QuestType = (typeof QUEST_TYPES)[number];

export type QuestTargetAttribute = (typeof QUEST_TARGET_ATTRIBUTES)[number];

export type QuestRewardAttribute = Exclude<QuestTargetAttribute, "NONE">;

export type QuestScalingDirection = (typeof QUEST_SCALING_DIRECTIONS)[number];

export interface Quest {
  title: string;
  description: string;

  type: QuestType;

  targetAttributes: QuestTargetAttribute[];

  xpReward: number;
  goldReward: number;

  /**
   * Only used for non-permanent quests.
   *
   * DAILY permanent quests should NOT use this field
   * to determine whether today's quest is complete.
   */
  completed: boolean;

  /**
   * Permanent daily quest definitions survive forever.
   */
  isPermanentDaily: boolean;

  /**
   * Stable identifier connecting this quest definition
   * to DailyQuestCompletion records.
   *
   * Example:
   * reading
   * gym
   * gate-prep
   */
  dailyQuestKey?: string;

  baseTargetMinutes?: number;

  targetLabel?: string;

  scalingDirection: QuestScalingDirection;

  createdAt: Date;
}

export type QuestDocument = HydratedDocument<Quest>;

const questSchema = new Schema<Quest>(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 120,
    },

    description: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 1_000,
    },

    type: {
      type: String,
      required: true,
      enum: QUEST_TYPES,
      default: "DAILY",
    },

    targetAttributes: {
      type: [String],
      required: true,
      enum: QUEST_TARGET_ATTRIBUTES,
      default: ["NONE"],
    },

    xpReward: {
      type: Number,
      required: true,
      min: 0,
    },

    goldReward: {
      type: Number,
      required: true,
      min: 0,
    },

    completed: {
      type: Boolean,
      required: true,
      default: false,
    },

    isPermanentDaily: {
      type: Boolean,
      required: true,
      default: false,
    },

    dailyQuestKey: {
      type: String,
      trim: true,
      required: false,
      maxlength: 80,
    },

    baseTargetMinutes: {
      type: Number,
      required: false,
      min: 0,
    },

    targetLabel: {
      type: String,
      required: false,
      trim: true,
      maxlength: 120,
    },

    scalingDirection: {
      type: String,
      required: true,
      enum: QUEST_SCALING_DIRECTIONS,
      default: "CONSTANT",
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
 * General quest queries.
 */
questSchema.index({
  completed: 1,
  type: 1,
  createdAt: -1,
});

/**
 * Permanent daily quests must have unique keys.
 */
questSchema.index(
  { dailyQuestKey: 1 },
  {
    unique: true,
    sparse: true,
  },
);

/**
 * Helpful when loading all permanent daily definitions.
 */
questSchema.index({
  isPermanentDaily: 1,
  type: 1,
});

const QuestModel =
  (models.Quest as Model<Quest> | undefined) ??
  model<Quest>("Quest", questSchema);

export default QuestModel;
