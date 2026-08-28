"use server";

import { Types } from "mongoose";
import { revalidatePath } from "next/cache";

import connectMongoDB from "@/lib/mongodb";
import QuestModel from "@/models/Quest";
import DailyQuestCompletionModel from "@/models/DailyQuestCompletion";
import ShopItemModel from "@/models/ShopItem";
import UserModel, {
  PLAYER_ATTRIBUTES,
  type PlayerAttribute,
} from "@/models/User";
import { processDailyQuestRollover } from "@/lib/dailyQuestRollover";
import {
  getRankReward,
  rankForLevel,
} from "@/lib/rankProgression";

function formString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function formOptionalString(
  formData: FormData,
  name: string,
): string | undefined {
  const value = formString(formData, name);
  return value.length > 0 ? value : undefined;
}

function formOptionalNumber(
  formData: FormData,
  name: string,
): number | undefined {
  const value = formString(formData, name);

  if (!value) {
    return undefined;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Invalid ${name}.`);
  }

  return parsed;
}

function dateKeyToUtcDate(dateKey: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    throw new Error(`Invalid date key: ${dateKey}`);
  }

  return new Date(Date.UTC(year, month - 1, day));
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

function applyXpAndLevelUps(
  user: {
    currentXp: number;
    xpToNextLevel: number;
    level: number;
    rank: Parameters<typeof rankForLevel>[0] extends never
      ? never
      : import("@/models/User").PlayerRank;
    unlockedRankRewards: Array<{
      rank: import("@/models/User").PlayerRank;
      title: string;
      description: string;
      triggerObject: string;
      alterEgoName: string;
      unlockedAt: Date;
    }>;
  },
  xpReward: number,
): void {
  user.currentXp += xpReward;

  while (user.currentXp >= user.xpToNextLevel) {
    user.currentXp -= user.xpToNextLevel;
    user.level += 1;
    user.xpToNextLevel = calculateXpToNextLevel(user.level);

    const newRank = rankForLevel(user.level);

    if (newRank !== user.rank) {
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
}

export async function buyShopItem(itemId: string): Promise<void> {
  await connectMongoDB();

  if (!Types.ObjectId.isValid(itemId)) {
    throw new Error("Invalid shop item ID.");
  }

  const user = await UserModel.findOne().sort({ createdAt: 1 });

  if (!user) {
    throw new Error("Player not found.");
  }

  const item = await ShopItemModel.findById(itemId);

  if (!item) {
    throw new Error("Shop item not found.");
  }

  if (user.gold < item.cost) {
    throw new Error("Not enough gold.");
  }

  if (typeof item.stock === "number" && item.stock <= 0) {
    throw new Error("This item is out of stock.");
  }

  user.gold -= item.cost;

  if (typeof item.stock === "number") {
    item.stock -= 1;
    await item.save();
  }

  await user.save();

  revalidatePath("/");
  revalidatePath("/admin");
}

export async function completeQuest(
  questId: string,
  formData: FormData,
): Promise<void> {
  await connectMongoDB();

  if (!Types.ObjectId.isValid(questId)) {
    throw new Error("Invalid quest ID.");
  }

  const user = await UserModel.findOne().sort({ createdAt: 1 });

  if (!user) {
    throw new Error("Player not found.");
  }

  await processDailyQuestRollover(user._id);

  const currentUser = await UserModel.findById(user._id);

  if (!currentUser) {
    throw new Error("Player not found.");
  }

  const quest = await QuestModel.findById(questId);

  if (!quest) {
    throw new Error("Quest not found.");
  }

  if (quest.isPermanentDaily && quest.type === "DAILY") {
    if (!quest.dailyQuestKey) {
      throw new Error("Permanent daily quest is missing dailyQuestKey.");
    }

    const { getCurrentGameDateKey } = await import(
      "@/lib/dailyQuestRollover"
    );
    const dateKey = getCurrentGameDateKey(currentUser.timezone);
    const date = dateKeyToUtcDate(dateKey);

    const dailyRecord = await DailyQuestCompletionModel.findOne({
      userId: currentUser._id,
      dailyQuestKey: quest.dailyQuestKey,
      date,
    });

    if (!dailyRecord) {
      throw new Error("Today's daily quest record does not exist.");
    }

    if (dailyRecord.status === "COMPLETED") {
      throw new Error("This daily quest has already been completed today.");
    }

    if (dailyRecord.status === "MISSED") {
      throw new Error("This daily quest has already been missed.");
    }

    const selectableAttributes = quest.targetAttributes.filter(
      (attribute): attribute is PlayerAttribute =>
        attribute !== "NONE" && PLAYER_ATTRIBUTES.includes(attribute),
    );

    if (selectableAttributes.length === 0) {
      throw new Error("This quest does not have a valid reward attribute.");
    }

    const allottedAttribute =
      selectableAttributes.length === 1
        ? selectableAttributes[0]
        : parseSelectedAttribute(formData, selectableAttributes);

    const details = validateQuestDetails(formData);

    const updatedDailyRecord = await DailyQuestCompletionModel.findOneAndUpdate(
      {
        _id: dailyRecord._id,
        status: "AVAILABLE",
      },
      {
        $set: {
          status: "COMPLETED",
          completedAt: new Date(),
          allottedAttribute,
          details,
        },
      },
      { new: true },
    );

    if (!updatedDailyRecord) {
      throw new Error(
        "Quest completion could not be finalized. It may have already been completed.",
      );
    }

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

  if (quest.completed) {
    throw new Error("This quest has already been completed.");
  }

  const selectableAttributes = quest.targetAttributes.filter(
    (attribute): attribute is PlayerAttribute =>
      attribute !== "NONE" && PLAYER_ATTRIBUTES.includes(attribute),
  );

  let allottedAttribute: PlayerAttribute | undefined;

  if (selectableAttributes.length === 1) {
    allottedAttribute = selectableAttributes[0];
  } else if (selectableAttributes.length > 1) {
    allottedAttribute = parseSelectedAttribute(formData, selectableAttributes);
  }

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
