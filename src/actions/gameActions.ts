"use server";

import { revalidatePath } from "next/cache";
import { Types } from "mongoose";
import {
  DAILY_QUEST_DEFINITIONS,
  type DailyQuestDefinition,
} from "@/lib/dailyQuests";
import connectMongoDB from "@/lib/mongodb";
import QuestModel, {
  QUEST_TARGET_ATTRIBUTES,
  QUEST_TYPES,
  type QuestSessionLogDetails,
  type QuestTargetAttribute,
  type QuestType,
} from "@/models/Quest";
import ShopItemModel from "@/models/ShopItem";
import UserModel, {
  PLAYER_ATTRIBUTES,
  type PlayerAttribute,
  type UserAttributes,
  type UserDocument,
} from "@/models/User";

const DEFAULT_PLAYER_NAME = "Sung Jin-Woo";
const ATTRIBUTE_REWARD_AMOUNT = 1;

export type QuestFormData = {
  title: string;
  description: string;
  type: QuestType;
  targetAttributes: QuestTargetAttribute[];
  xpReward: number;
  goldReward: number;
};

export type ShopItemFormData = {
  title: string;
  description: string;
  cost: number;
  stock?: number;
};

async function getOrCreatePlayer(): Promise<UserDocument> {
  const existingPlayer = await UserModel.findOne().sort({ createdAt: 1 });

  if (!existingPlayer) {
    return UserModel.create({
      name: DEFAULT_PLAYER_NAME,
    });
  }

  let changed = false;
  const rawAttributes = existingPlayer.attributes as UserAttributes &
    Record<string, unknown>;

  for (const attribute of PLAYER_ATTRIBUTES) {
    const legacyKey = attribute.toLowerCase();
    const legacyValue = rawAttributes[legacyKey];

    if (typeof rawAttributes[attribute] !== "number") {
      rawAttributes[attribute] =
        typeof legacyValue === "number" ? legacyValue : 10;
      changed = true;
    }
  }

  if (changed) {
    existingPlayer.markModified("attributes");
    await existingPlayer.save();
  }

  return existingPlayer;
}

function assertObjectId(id: string, label: string): void {
  if (!Types.ObjectId.isValid(id)) {
    throw new Error(`Invalid ${label} id.`);
  }
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new Error(`${field} must be a string.`);
  }

  const trimmedValue = value.trim();

  if (!trimmedValue) {
    throw new Error(`${field} is required.`);
  }

  return trimmedValue;
}

function optionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmedValue = value.trim();
  return trimmedValue ? trimmedValue : undefined;
}

function nonNegativeNumber(value: unknown, field: string): number {
  const parsedValue =
    typeof value === "number" ? value : Number.parseInt(String(value), 10);

  if (!Number.isFinite(parsedValue) || parsedValue < 0) {
    throw new Error(`${field} must be a non-negative number.`);
  }

  return parsedValue;
}

function optionalNonNegativeNumber(
  value: unknown,
  field: string,
): number | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  return nonNegativeNumber(value, field);
}

function optionalStock(value: unknown): number | undefined {
  return optionalNonNegativeNumber(value, "Stock");
}

function enumValue<const T extends readonly string[]>(
  value: unknown,
  allowedValues: T,
  field: string,
): T[number] {
  if (typeof value !== "string" || !allowedValues.includes(value)) {
    throw new Error(`${field} is invalid.`);
  }

  return value;
}

function formValue(formData: FormData, key: string): FormDataEntryValue | null {
  return formData.get(key);
}

function formValues(formData: FormData, key: string): FormDataEntryValue[] {
  return formData.getAll(key);
}

function parseTargetAttributes(values: unknown[]): QuestTargetAttribute[] {
  const attributes = values
    .map((value) => enumValue(value, QUEST_TARGET_ATTRIBUTES, "Target attribute"))
    .filter((value, index, array) => array.indexOf(value) === index);

  if (attributes.length === 0) {
    return ["NONE"];
  }

  if (attributes.includes("NONE") && attributes.length > 1) {
    return attributes.filter((attribute) => attribute !== "NONE");
  }

  return attributes;
}

function parseQuestFormData(data: QuestFormData | FormData): QuestFormData {
  if (data instanceof FormData) {
    const targetAttributeValues = formValues(data, "targetAttributes");
    const legacyTargetAttribute = formValue(data, "targetAttribute");

    return {
      title: requiredString(formValue(data, "title"), "Title"),
      description: requiredString(formValue(data, "description"), "Description"),
      type: enumValue(formValue(data, "type"), QUEST_TYPES, "Quest type"),
      targetAttributes: parseTargetAttributes(
        targetAttributeValues.length > 0
          ? targetAttributeValues
          : [legacyTargetAttribute],
      ),
      xpReward: nonNegativeNumber(formValue(data, "xpReward"), "XP reward"),
      goldReward: nonNegativeNumber(
        formValue(data, "goldReward"),
        "Gold reward",
      ),
    };
  }

  return {
    title: requiredString(data.title, "Title"),
    description: requiredString(data.description, "Description"),
    type: enumValue(data.type, QUEST_TYPES, "Quest type"),
    targetAttributes: parseTargetAttributes(data.targetAttributes),
    xpReward: nonNegativeNumber(data.xpReward, "XP reward"),
    goldReward: nonNegativeNumber(data.goldReward, "Gold reward"),
  };
}

function parseShopItemFormData(data: ShopItemFormData | FormData): ShopItemFormData {
  if (data instanceof FormData) {
    return {
      title: requiredString(formValue(data, "title"), "Title"),
      description: requiredString(formValue(data, "description"), "Description"),
      cost: nonNegativeNumber(formValue(data, "cost"), "Cost"),
      stock: optionalStock(formValue(data, "stock")),
    };
  }

  return {
    title: requiredString(data.title, "Title"),
    description: requiredString(data.description, "Description"),
    cost: nonNegativeNumber(data.cost, "Cost"),
    stock: optionalStock(data.stock),
  };
}

function parseSessionLogDetails(formData: FormData): QuestSessionLogDetails {
  return {
    exercises: optionalString(formValue(formData, "exercises")),
    bookTitle: optionalString(formValue(formData, "bookTitle")),
    pagesRead: optionalNonNegativeNumber(formValue(formData, "pagesRead"), "Pages read"),
    topicsStudied: optionalString(formValue(formData, "topicsStudied")),
    notes: optionalString(formValue(formData, "notes")),
  };
}

function applyLevelUps(player: UserDocument): void {
  while (player.currentXp >= player.xpToNextLevel) {
    player.currentXp -= player.xpToNextLevel;
    player.level += 1;
    player.xpToNextLevel = Math.ceil(player.xpToNextLevel * 1.25);
  }
}

function todayRange(): { start: Date; end: Date } {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  return { start, end };
}

function hasCompletedToday(sessionLogs: { completedAt: Date }[]): boolean {
  const { start, end } = todayRange();

  return sessionLogs.some((log) => {
    const completedAt = new Date(log.completedAt);
    return completedAt >= start && completedAt < end;
  });
}

function chooseRewardAttribute(
  targetAttributes: QuestTargetAttribute[],
  selectedAttribute: FormDataEntryValue | null,
): PlayerAttribute | undefined {
  const rewardAttributes = targetAttributes.filter(
    (attribute): attribute is PlayerAttribute => attribute !== "NONE",
  );

  if (rewardAttributes.length === 0) {
    return undefined;
  }

  if (rewardAttributes.length === 1) {
    return rewardAttributes[0];
  }

  const chosenAttribute = enumValue(
    selectedAttribute,
    PLAYER_ATTRIBUTES,
    "Chosen reward attribute",
  );

  if (!rewardAttributes.includes(chosenAttribute)) {
    throw new Error("Chosen reward attribute is not valid for this quest.");
  }

  return chosenAttribute;
}

function revalidateGameRoutes(): void {
  revalidatePath("/");
  revalidatePath("/admin");
}

function questPayloadFromDailyDefinition(definition: DailyQuestDefinition) {
  return {
    title: definition.title,
    description: definition.description,
    type: "DAILY" as const,
    targetAttributes: definition.targetAttributes,
    xpReward: definition.xpReward,
    goldReward: definition.goldReward,
    completed: false,
    isPermanentDaily: true,
    dailyQuestKey: definition.key,
    baseTargetMinutes: definition.baseTargetMinutes,
    targetLabel: definition.targetLabel,
    scalingDirection: definition.scalingDirection,
  };
}

export async function ensurePermanentDailyQuests(): Promise<void> {
  await connectMongoDB();

  await Promise.all(
    DAILY_QUEST_DEFINITIONS.map((definition) =>
      QuestModel.findOneAndUpdate(
        { dailyQuestKey: definition.key },
        { $set: questPayloadFromDailyDefinition(definition) },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      ),
    ),
  );
}

export async function completeQuest(
  questId: string,
  formData?: FormData,
): Promise<void> {
  await connectMongoDB();
  assertObjectId(questId, "quest");

  const quest = await QuestModel.findById(questId);

  if (!quest) {
    throw new Error("Quest not found.");
  }

  if (quest.isPermanentDaily && hasCompletedToday(quest.sessionLogs)) {
    return;
  }

  if (!quest.isPermanentDaily && quest.completed) {
    return;
  }

  const player = await getOrCreatePlayer();
  const selectedAttribute = chooseRewardAttribute(
    quest.targetAttributes,
    formData?.get("selectedAttribute") ?? null,
  );

  if (selectedAttribute) {
    player.attributes[selectedAttribute] += ATTRIBUTE_REWARD_AMOUNT;
    player.markModified(`attributes.${selectedAttribute}`);
  }

  player.currentXp += quest.xpReward;
  player.gold += quest.goldReward;
  applyLevelUps(player);

  quest.sessionLogs.push({
    completedAt: new Date(),
    allottedAttribute: selectedAttribute,
    details: formData ? parseSessionLogDetails(formData) : {},
  });

  if (!quest.isPermanentDaily) {
    quest.completed = true;
  }

  await Promise.all([quest.save(), player.save()]);
  revalidateGameRoutes();
}

export async function createQuest(
  data: QuestFormData | FormData,
): Promise<void> {
  await connectMongoDB();

  const questData = parseQuestFormData(data);
  await QuestModel.create({
    ...questData,
    completed: false,
    isPermanentDaily: false,
    scalingDirection: "CONSTANT",
  });
  revalidateGameRoutes();
}

export async function createShopItem(
  data: ShopItemFormData | FormData,
): Promise<void> {
  await connectMongoDB();

  const itemData = parseShopItemFormData(data);
  await ShopItemModel.create(itemData);
  revalidateGameRoutes();
}

export async function buyShopItem(itemId: string): Promise<void> {
  await connectMongoDB();
  assertObjectId(itemId, "shop item");

  const [item, player] = await Promise.all([
    ShopItemModel.findById(itemId),
    getOrCreatePlayer(),
  ]);

  if (!item) {
    throw new Error("Shop item not found.");
  }

  if (typeof item.stock === "number" && item.stock <= 0) {
    return;
  }

  if (player.gold < item.cost) {
    return;
  }

  player.gold -= item.cost;

  if (typeof item.stock === "number") {
    item.stock -= 1;
  }

  await Promise.all([player.save(), item.save()]);
  revalidateGameRoutes();
}
