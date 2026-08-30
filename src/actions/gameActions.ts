"use server";

import { Types } from "mongoose";
import { revalidatePath } from "next/cache";

import connectMongoDB from "@/lib/mongodb";
import QuestModel, {
  QUEST_TARGET_ATTRIBUTES,
  QUEST_TYPES,
  type QuestScalingDirection,
  type QuestTargetAttribute,
  type QuestType,
} from "@/models/Quest";
import DailyQuestCompletionModel from "@/models/DailyQuestCompletion";
import ShopItemModel from "@/models/ShopItem";
import UserModel, {
  PLAYER_ATTRIBUTES,
  type PlayerAttribute,
  type PlayerRank,
  type UnlockedRankReward,
} from "@/models/User";
import {
  dateKeyToUtcDate,
  getCurrentGameDateKey,
  processDailyQuestRollover,
} from "@/lib/dailyQuestRollover";
import {
  getRankReward,
  rankForLevel,
  rankStartLevel,
} from "@/lib/rankProgression";

function formString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function formOptionalString(formData: FormData, name: string): string | undefined {
  const value = formString(formData, name);
  return value.length > 0 ? value : undefined;
}

function formNumber(formData: FormData, name: string): number {
  const value = formString(formData, name);
  const parsed = Number(value);

  if (!value || !Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Invalid ${name}.`);
  }

  return parsed;
}

function formOptionalNumber(formData: FormData, name: string): number | undefined {
  const value = formString(formData, name);
  if (!value) return undefined;

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Invalid ${name}.`);
  }

  return parsed;
}

function addDateKey(dateKey: string, amount: number): string {
  const date = dateKeyToUtcDate(dateKey);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function parseSelectedAttribute(
  formData: FormData,
  allowedAttributes: PlayerAttribute[],
): PlayerAttribute {
  const value = formString(formData, "selectedAttribute");

  if (!value || !PLAYER_ATTRIBUTES.includes(value as PlayerAttribute)) {
    throw new Error("A valid reward attribute must be selected.");
  }

  const attribute = value as PlayerAttribute;
  if (!allowedAttributes.includes(attribute)) {
    throw new Error("The selected attribute is not valid for this quest.");
  }

  return attribute;
}

function validateQuestDetails(formData: FormData) {
  return {
    exercises: formOptionalString(formData, "exercises"),
    bookTitle: formOptionalString(formData, "bookTitle"),
    pagesRead: formOptionalNumber(formData, "pagesRead"),
    topicsStudied: formOptionalString(formData, "topicsStudied"),
    notes: formOptionalString(formData, "notes"),
  };
}

function calculateXpToNextLevel(level: number): number {
  return 100 + (level - 1) * 25;
}

type RankRewardRecord = UnlockedRankReward;

function applyXpAndLevelUps(
  user: {
    currentXp: number;
    xpToNextLevel: number;
    level: number;
    rank: PlayerRank;
    unlockedRankRewards: RankRewardRecord[];
  },
  xpReward: number,
): void {
  user.currentXp += xpReward;

  while (user.currentXp >= user.xpToNextLevel) {
    user.currentXp -= user.xpToNextLevel;
    user.level += 1;
    user.xpToNextLevel = calculateXpToNextLevel(user.level);

    const newRank = rankForLevel(user.level);
    if (newRank === user.rank) continue;

    user.rank = newRank;

    const reward = getRankReward(newRank);
    if (
      reward &&
      !user.unlockedRankRewards.some(
        (unlockedReward) => unlockedReward.rank === newRank,
      )
    ) {
      user.unlockedRankRewards.push({
        ...reward,
        unlockedAt: new Date(),
      });
    }
  }
}

export async function createQuest(formData: FormData): Promise<void> {
  await connectMongoDB();

  const title = formString(formData, "title");
  const description = formString(formData, "description");
  const type = formString(formData, "type") as QuestType;
  const targetAttribute = formString(formData, "targetAttribute") as QuestTargetAttribute;
  const xpReward = formNumber(formData, "xpReward");
  const goldReward = formNumber(formData, "goldReward");

  if (!title || !description) {
    throw new Error("Quest title and description are required.");
  }

  if (!QUEST_TYPES.includes(type)) {
    throw new Error("Invalid quest type.");
  }

  if (!QUEST_TARGET_ATTRIBUTES.includes(targetAttribute)) {
    throw new Error("Invalid quest target attribute.");
  }

  await QuestModel.create({
    title,
    description,
    type,
    targetAttributes: [targetAttribute],
    xpReward,
    goldReward,
    completed: false,
    isPermanentDaily: false,
    scalingDirection: "CONSTANT" satisfies QuestScalingDirection,
  });

  revalidatePath("/");
  revalidatePath("/admin");
}

export async function createShopItem(formData: FormData): Promise<void> {
  await connectMongoDB();

  const title = formString(formData, "title");
  const description = formString(formData, "description");
  const cost = formNumber(formData, "cost");
  const stock = formOptionalNumber(formData, "stock");

  if (!title || !description) {
    throw new Error("Shop item title and description are required.");
  }

  await ShopItemModel.create({
    title,
    description,
    cost,
    ...(stock === undefined ? {} : { stock }),
  });

  revalidatePath("/");
  revalidatePath("/admin");
}

export async function simulateDailyQuestRollover(): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("The daily rollover simulator is disabled in production.");
  }

  await connectMongoDB();

  const user = await UserModel.findOne().sort({ createdAt: 1 });
  if (!user) throw new Error("Player not found.");

  const currentGameDateKey = getCurrentGameDateKey(user.timezone);
  user.lastDailyQuestProcessedDate = addDateKey(currentGameDateKey, -2);
  await user.save();

  await processDailyQuestRollover(user._id);

  revalidatePath("/");
  revalidatePath("/admin");
}

/**
 * Development-only, non-destructive rank reward simulator.
 *
 * It clones the player's progression state in memory and uses the same
 * rank/reward calculation path as real quest XP. Nothing is written to User.
 */
export async function simulateRankReward(formData: FormData): Promise<{
  ok: boolean;
  message: string;
  currentLevel: number;
  currentRank: PlayerRank;
  targetRank: Exclude<PlayerRank, "E">;
  targetLevel: number | null;
  rewards: UnlockedRankReward[];
}> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("The rank reward simulator is disabled in production.");
  }

  const targetRank = formString(formData, "targetRank") as Exclude<PlayerRank, "E">;
  const validRanks: Array<Exclude<PlayerRank, "E">> = [
    "D",
    "C",
    "B",
    "A",
    "S",
    "NATIONAL",
    "MONARCH",
  ];

  if (!validRanks.includes(targetRank)) {
    throw new Error("Invalid target rank.");
  }

  await connectMongoDB();

  const user = await UserModel.findOne().sort({ createdAt: 1 });
  if (!user) throw new Error("Player not found.");

  const targetLevel = rankStartLevel(targetRank);

  if (targetLevel <= user.level) {
    const existingReward = user.unlockedRankRewards.find(
      (reward) => reward.rank === targetRank,
    );

    return {
      ok: true,
      message: `${targetRank === "NATIONAL" ? "National Level" : targetRank}-Rank is already at or below the player's current level (${user.level}). No data was changed.${existingReward ? " The reward is already unlocked." : " The rank reward has not been recorded for this player."}`,
      currentLevel: user.level,
      currentRank: user.rank,
      targetRank,
      targetLevel,
      rewards: existingReward ? [existingReward] : [],
    };
  }

  const simulatedUser = {
    currentXp: 0,
    xpToNextLevel: user.xpToNextLevel,
    level: user.level,
    rank: user.rank,
    unlockedRankRewards: user.unlockedRankRewards.map((reward) => ({
      ...reward,
      unlockedAt: new Date(reward.unlockedAt),
    })),
  };

  const rewardsBefore = simulatedUser.unlockedRankRewards.length;

  while (simulatedUser.level < targetLevel) {
    simulatedUser.currentXp = simulatedUser.xpToNextLevel;
    applyXpAndLevelUps(simulatedUser, 0);
  }

  const newRewards = simulatedUser.unlockedRankRewards.slice(rewardsBefore);

  return {
    ok: true,
    message: `Simulation reached ${targetRank === "NATIONAL" ? "National Level" : targetRank}-Rank at level ${targetLevel}. No player data was changed.`,
    currentLevel: user.level,
    currentRank: user.rank,
    targetRank,
    targetLevel,
    rewards: newRewards,
  };
}

export async function buyShopItem(itemId: string): Promise<void> {
  await connectMongoDB();

  if (!Types.ObjectId.isValid(itemId)) throw new Error("Invalid shop item ID.");

  const user = await UserModel.findOne().sort({ createdAt: 1 });
  if (!user) throw new Error("Player not found.");

  const item = await ShopItemModel.findById(itemId);
  if (!item) throw new Error("Shop item not found.");
  if (user.gold < item.cost) throw new Error("Not enough gold.");
  if (typeof item.stock === "number" && item.stock <= 0) throw new Error("This item is out of stock.");

  user.gold -= item.cost;
  if (typeof item.stock === "number") {
    item.stock -= 1;
    await item.save();
  }

  await user.save();
  revalidatePath("/");
  revalidatePath("/admin");
}

export async function completeQuest(questId: string, formData: FormData): Promise<void> {
  await connectMongoDB();

  if (!Types.ObjectId.isValid(questId)) throw new Error("Invalid quest ID.");

  const user = await UserModel.findOne().sort({ createdAt: 1 });
  if (!user) throw new Error("Player not found.");

  await processDailyQuestRollover(user._id);

  const currentUser = await UserModel.findById(user._id);
  if (!currentUser) throw new Error("Player not found.");

  const quest = await QuestModel.findById(questId);
  if (!quest) throw new Error("Quest not found.");

  if (quest.isPermanentDaily && quest.type === "DAILY") {
    if (!quest.dailyQuestKey) throw new Error("Permanent daily quest is missing dailyQuestKey.");

    const dateKey = getCurrentGameDateKey(currentUser.timezone);
    const date = dateKeyToUtcDate(dateKey);
    const dailyRecord = await DailyQuestCompletionModel.findOne({
      userId: currentUser._id,
      dailyQuestKey: quest.dailyQuestKey,
      date,
    });

    if (!dailyRecord) throw new Error("Today's daily quest record does not exist.");
    if (dailyRecord.status === "COMPLETED") throw new Error("This daily quest has already been completed today.");
    if (dailyRecord.status === "MISSED") throw new Error("This daily quest has already been missed.");

    const selectableAttributes = quest.targetAttributes.filter(
      (attribute): attribute is PlayerAttribute => attribute !== "NONE" && PLAYER_ATTRIBUTES.includes(attribute),
    );
    if (selectableAttributes.length === 0) throw new Error("This quest does not have a valid reward attribute.");

    const allottedAttribute = selectableAttributes.length === 1
      ? selectableAttributes[0]
      : parseSelectedAttribute(formData, selectableAttributes);

    const updatedDailyRecord = await DailyQuestCompletionModel.findOneAndUpdate(
      { _id: dailyRecord._id, status: "AVAILABLE" },
      { $set: { status: "COMPLETED", completedAt: new Date(), allottedAttribute, details: validateQuestDetails(formData) } },
      { new: true },
    );

    if (!updatedDailyRecord) throw new Error("Quest completion could not be finalized. It may have already been completed.");

    currentUser.attributes[allottedAttribute] += 1;
    applyXpAndLevelUps(currentUser, quest.xpReward);
    currentUser.gold += quest.goldReward;
    currentUser.markModified("attributes");
    currentUser.markModified("unlockedRankRewards");
    await currentUser.save();

    revalidatePath("/");
    revalidatePath("/admin");
    return;
  }

  if (quest.completed) throw new Error("This quest has already been completed.");

  const selectableAttributes = quest.targetAttributes.filter(
    (attribute): attribute is PlayerAttribute => attribute !== "NONE" && PLAYER_ATTRIBUTES.includes(attribute),
  );

  let allottedAttribute: PlayerAttribute | undefined;
  if (selectableAttributes.length === 1) allottedAttribute = selectableAttributes[0];
  else if (selectableAttributes.length > 1) allottedAttribute = parseSelectedAttribute(formData, selectableAttributes);

  quest.completed = true;
  await quest.save();

  if (allottedAttribute) {
    currentUser.attributes[allottedAttribute] += 1;
    currentUser.markModified("attributes");
  }

  applyXpAndLevelUps(currentUser, quest.xpReward);
  currentUser.gold += quest.goldReward;
  currentUser.markModified("unlockedRankRewards");
  await currentUser.save();

  revalidatePath("/");
  revalidatePath("/admin");
}
