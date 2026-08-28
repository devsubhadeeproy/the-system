import {
  Schema,
  model,
  models,
  type HydratedDocument,
  type Model,
  type Types,
} from "mongoose";

import { PLAYER_ATTRIBUTES, type PlayerAttribute } from "@/models/User";

export const DAILY_QUEST_COMPLETION_STATUSES = [
  "PENDING",
  "COMPLETED",
  "MISSED",
  "AVAILABLE",
] as const;

export type DailyQuestCompletionStatus =
  (typeof DAILY_QUEST_COMPLETION_STATUSES)[number];

export interface DailyQuestCompletion {
  userId: Types.ObjectId;

  dailyQuestKey: string;
  date: Date;

  status: DailyQuestCompletionStatus;

  completedAt?: Date;

  allottedAttribute?: PlayerAttribute;

  details?: {
    exercises?: string;
    bookTitle?: string;
    pagesRead?: number;
    topicsStudied?: string;
    notes?: string;
  };

  penaltyApplied: boolean;

  createdAt: Date;
  updatedAt: Date;
}

export type DailyQuestCompletionDocument =
  HydratedDocument<DailyQuestCompletion>;

const detailsSchema = new Schema(
  {
    exercises: {
      type: String,
      trim: true,
      maxlength: 2_000,
    },

    bookTitle: {
      type: String,
      trim: true,
      maxlength: 180,
    },

    pagesRead: {
      type: Number,
      min: 0,
    },

    topicsStudied: {
      type: String,
      trim: true,
      maxlength: 2_000,
    },

    notes: {
      type: String,
      trim: true,
      maxlength: 4_000,
    },
  },
  {
    _id: false,
  },
);

const dailyQuestCompletionSchema = new Schema<DailyQuestCompletion>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    dailyQuestKey: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },

    date: {
      type: Date,
      required: true,
    },

    status: {
      type: String,
      required: true,
      enum: DAILY_QUEST_COMPLETION_STATUSES,
      default: "AVAILABLE",
    },

    completedAt: {
      type: Date,
      required: false,
    },

    allottedAttribute: {
      type: String,
      enum: PLAYER_ATTRIBUTES,
      required: false,
    },

    details: {
      type: detailsSchema,
      required: false,
    },

    penaltyApplied: {
      type: Boolean,
      required: true,
      default: false,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

dailyQuestCompletionSchema.index(
  {
    userId: 1,
    dailyQuestKey: 1,
    date: 1,
  },
  {
    unique: true,
  },
);

dailyQuestCompletionSchema.index({
  userId: 1,
  status: 1,
  date: 1,
});

dailyQuestCompletionSchema.index({
  userId: 1,
  date: -1,
  dailyQuestKey: 1,
});

const DailyQuestCompletionModel =
  (models.DailyQuestCompletion as Model<DailyQuestCompletion> | undefined) ??
  model<DailyQuestCompletion>(
    "DailyQuestCompletion",
    dailyQuestCompletionSchema,
  );

export default DailyQuestCompletionModel;
