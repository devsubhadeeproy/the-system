import {
  Schema,
  model,
  models,
  type HydratedDocument,
  type Model,
} from "mongoose";
import { PLAYER_ATTRIBUTES, type PlayerAttribute } from "@/models/User";

export const QUEST_TYPES = ["DAILY", "MAIN", "SIDE", "URGENT"] as const;
export const QUEST_TARGET_ATTRIBUTES = [
  ...PLAYER_ATTRIBUTES,
  "NONE",
] as const;
export const QUEST_SCALING_DIRECTIONS = ["UP", "DOWN", "CONSTANT"] as const;

export type QuestType = (typeof QUEST_TYPES)[number];
export type QuestTargetAttribute = (typeof QUEST_TARGET_ATTRIBUTES)[number];
export type QuestRewardAttribute = Exclude<QuestTargetAttribute, "NONE">;
export type QuestScalingDirection = (typeof QUEST_SCALING_DIRECTIONS)[number];

export interface QuestSessionLogDetails {
  exercises?: string;
  bookTitle?: string;
  pagesRead?: number;
  topicsStudied?: string;
  notes?: string;
}

export interface QuestSessionLog {
  completedAt: Date;
  allottedAttribute?: PlayerAttribute;
  details: QuestSessionLogDetails;
}

export interface Quest {
  title: string;
  description: string;
  type: QuestType;
  targetAttributes: QuestTargetAttribute[];
  xpReward: number;
  goldReward: number;
  completed: boolean;
  isPermanentDaily: boolean;
  dailyQuestKey?: string;
  baseTargetMinutes?: number;
  targetLabel?: string;
  scalingDirection: QuestScalingDirection;
  sessionLogs: QuestSessionLog[];
  createdAt: Date;
}

export type QuestDocument = HydratedDocument<Quest>;

const sessionLogDetailsSchema = new Schema<QuestSessionLogDetails>(
  {
    exercises: { type: String, trim: true, maxlength: 2_000 },
    bookTitle: { type: String, trim: true, maxlength: 180 },
    pagesRead: { type: Number, min: 0 },
    topicsStudied: { type: String, trim: true, maxlength: 2_000 },
    notes: { type: String, trim: true, maxlength: 4_000 },
  },
  { _id: false },
);

const sessionLogSchema = new Schema<QuestSessionLog>(
  {
    completedAt: { type: Date, required: true, default: Date.now },
    allottedAttribute: {
      type: String,
      enum: PLAYER_ATTRIBUTES,
      required: false,
    },
    details: {
      type: sessionLogDetailsSchema,
      required: true,
      default: () => ({}),
    },
  },
  { _id: false },
);

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
    xpReward: { type: Number, required: true, min: 0 },
    goldReward: { type: Number, required: true, min: 0 },
    completed: { type: Boolean, required: true, default: false },
    isPermanentDaily: { type: Boolean, required: true, default: false },
    dailyQuestKey: {
      type: String,
      trim: true,
      required: false,
      maxlength: 80,
    },
    baseTargetMinutes: { type: Number, required: false, min: 0 },
    targetLabel: { type: String, required: false, trim: true, maxlength: 120 },
    scalingDirection: {
      type: String,
      required: true,
      enum: QUEST_SCALING_DIRECTIONS,
      default: "CONSTANT",
    },
    sessionLogs: {
      type: [sessionLogSchema],
      required: true,
      default: [],
    },
    createdAt: { type: Date, required: true, default: Date.now },
  },
  {
    versionKey: false,
  },
);

questSchema.index({ completed: 1, type: 1, createdAt: -1 });
questSchema.index({ dailyQuestKey: 1 }, { unique: true, sparse: true });

const QuestModel =
  (models.Quest as Model<Quest> | undefined) ??
  model<Quest>("Quest", questSchema);

export default QuestModel;
