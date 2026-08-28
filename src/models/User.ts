import {
  Schema,
  model,
  models,
  type HydratedDocument,
  type Model,
} from "mongoose";

export const PLAYER_RANKS = [
  "E",
  "D",
  "C",
  "B",
  "A",
  "S",
  "NATIONAL",
  "MONARCH",
] as const;

export const PLAYER_ATTRIBUTES = [
  "STR",
  "INT",
  "AGI",
  "WIS",
  "MANA",
  "LIF",
  "REC",
] as const;

export type PlayerRank = (typeof PLAYER_RANKS)[number];
export type PlayerAttribute = (typeof PLAYER_ATTRIBUTES)[number];

export type UserAttributes = Record<PlayerAttribute, number>;

export type UnlockedRankReward = {
  rank: Exclude<PlayerRank, "E">;
  title: string;
  description: string;
  triggerObject: string;
  alterEgoName: string;
  unlockedAt: Date;
};

export interface User {
  name: string;

  level: number;
  currentXp: number;
  xpToNextLevel: number;
  rank: PlayerRank;
  gold: number;

  attributes: UserAttributes;

  /** Psychological rewards unlocked as rank milestones are reached. */
  unlockedRankRewards: UnlockedRankReward[];

  /**
   * IANA timezone used when determining when a new
   * "game day" begins.
   */
  timezone: string;

  /**
   * Last game-day date for which daily quest rollover
   * has been processed. A game day starts at 02:30 local time.
   */
  lastDailyQuestProcessedDate?: string;
}

export type UserDocument = HydratedDocument<User>;

const attributesSchema = new Schema<UserAttributes>(
  {
    STR: { type: Number, required: true, default: 10, min: 0 },
    INT: { type: Number, required: true, default: 10, min: 0 },
    AGI: { type: Number, required: true, default: 10, min: 0 },
    WIS: { type: Number, required: true, default: 10, min: 0 },
    MANA: { type: Number, required: true, default: 10, min: 0 },
    LIF: { type: Number, required: true, default: 10, min: 0 },
    REC: { type: Number, required: true, default: 10, min: 0 },
  },
  { _id: false },
);

const unlockedRankRewardSchema = new Schema<UnlockedRankReward>(
  {
    rank: {
      type: String,
      required: true,
      enum: PLAYER_RANKS.filter((rank) => rank !== "E"),
    },
    title: { type: String, required: true },
    description: { type: String, required: true },
    triggerObject: { type: String, required: true },
    alterEgoName: { type: String, required: true },
    unlockedAt: { type: Date, required: true, default: Date.now },
  },
  { _id: false },
);

const userSchema = new Schema<User>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 80,
    },

    level: {
      type: Number,
      required: true,
      default: 1,
      min: 1,
    },

    currentXp: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },

    xpToNextLevel: {
      type: Number,
      required: true,
      default: 100,
      min: 1,
    },

    rank: {
      type: String,
      required: true,
      enum: PLAYER_RANKS,
      default: "E",
    },

    gold: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },

    attributes: {
      type: attributesSchema,
      required: true,
      default: () => ({}),
    },

    unlockedRankRewards: {
      type: [unlockedRankRewardSchema],
      required: true,
      default: [],
    },

    timezone: {
      type: String,
      required: true,
      trim: true,
      default: "Asia/Kolkata",
      maxlength: 80,
    },

    lastDailyQuestProcessedDate: {
      type: String,
      required: false,
      match: /^\d{4}-\d{2}-\d{2}$/,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

userSchema.index({ name: 1 });

const UserModel =
  (models.User as Model<User> | undefined) ?? model<User>("User", userSchema);

export default UserModel;
