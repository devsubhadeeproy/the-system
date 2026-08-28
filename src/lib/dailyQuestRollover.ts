import { Types } from "mongoose";

import connectMongoDB from "@/lib/mongodb";
import QuestModel from "@/models/Quest";
import DailyQuestCompletionModel from "@/models/DailyQuestCompletion";
import PenaltyModel from "@/models/Penalty";
import UserModel, {
  PLAYER_ATTRIBUTES,
  type PlayerAttribute,
  type UserDocument,
} from "@/models/User";
import { DAILY_QUEST_DEFINITIONS } from "@/lib/dailyQuests";

export const DAILY_CYCLE_RESET_HOUR = 2;
export const DAILY_CYCLE_RESET_MINUTE = 30;

const MISSED_QUEST_ATTRIBUTE_PENALTY = 1;

type RolloverResult = {
  currentDateKey: string;
  missedQuestCount: number;
  penaltiesApplied: number;
  initializedToday: boolean;
};

/**
 * A System day starts at 02:30 in the player's local timezone.
 *
 * Shifting the instant backwards by 2h30m before formatting it
 * as a calendar date makes 00:00-02:29 belong to the previous
 * System day, while 02:30 starts the new one.
 */
export function getCurrentGameDateKey(
  timezone: string,
  now = new Date(),
): string {
  const shifted = new Date(
    now.getTime() -
      (DAILY_CYCLE_RESET_HOUR * 60 + DAILY_CYCLE_RESET_MINUTE) * 60_000,
  );

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(shifted);
}

export function dateKeyToUtcDate(dateKey: string): Date {
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

function addDays(dateKey: string, amount: number): string {
  const date = dateKeyToUtcDate(dateKey);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function getYesterday(dateKey: string): string {
  return addDays(dateKey, -1);
}

function selectPenaltyAttribute(
  questKey: string,
): PlayerAttribute | undefined {
  const definition = DAILY_QUEST_DEFINITIONS.find(
    (quest) => quest.key === questKey,
  );

  return definition?.targetAttributes.find((attribute) =>
    PLAYER_ATTRIBUTES.includes(attribute),
  );
}

async function ensureDailyRecord(
  userId: Types.ObjectId,
  questKey: string,
  dateKey: string,
): Promise<void> {
  const date = dateKeyToUtcDate(dateKey);

  await DailyQuestCompletionModel.updateOne(
    {
      userId,
      dailyQuestKey: questKey,
      date,
    },
    {
      $setOnInsert: {
        userId,
        dailyQuestKey: questKey,
        date,
        status: "AVAILABLE",
        penaltyApplied: false,
      },
    },
    { upsert: true },
  );
}

async function applyMissedQuestPenalty(
  user: UserDocument,
  questKey: string,
  dateKey: string,
): Promise<boolean> {
  const attribute = selectPenaltyAttribute(questKey);

  if (!attribute) {
    return false;
  }

  try {
    await PenaltyModel.create({
      userId: user._id,
      questKey,
      dateKey,
      type: "ATTRIBUTE_LOSS",
      amount: MISSED_QUEST_ATTRIBUTE_PENALTY,
      attribute,
      reason: `Daily quest "${questKey}" was missed on ${dateKey}.`,
      applied: false,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as { code?: number }).code === 11000
    ) {
      return false;
    }

    throw error;
  }

  user.attributes[attribute] = Math.max(
    0,
    user.attributes[attribute] - MISSED_QUEST_ATTRIBUTE_PENALTY,
  );
  user.markModified("attributes");
  await user.save();

  await PenaltyModel.updateOne(
    { userId: user._id, questKey, dateKey, applied: false },
    { $set: { applied: true, appliedAt: new Date() } },
  );

  return true;
}

/**
 * Processes the player's System-day rollover.
 *
 * The cycle boundary is 02:30 local time, not midnight.
 */
export async function processDailyQuestRollover(
  userId: Types.ObjectId,
): Promise<RolloverResult> {
  await connectMongoDB();

  const user = await UserModel.findById(userId);

  if (!user) {
    throw new Error("Player not found.");
  }

  const currentDateKey = getCurrentGameDateKey(user.timezone);

  const dailyQuests = await QuestModel.find({
    isPermanentDaily: true,
    type: "DAILY",
    dailyQuestKey: { $exists: true, $ne: null },
  }).lean();

  if (!user.lastDailyQuestProcessedDate) {
    for (const quest of dailyQuests) {
      if (quest.dailyQuestKey) {
        await ensureDailyRecord(
          user._id,
          quest.dailyQuestKey,
          currentDateKey,
        );
      }
    }

    user.lastDailyQuestProcessedDate = currentDateKey;
    await user.save();

    return {
      currentDateKey,
      missedQuestCount: 0,
      penaltiesApplied: 0,
      initializedToday: true,
    };
  }

  let dateToProcess = addDays(user.lastDailyQuestProcessedDate, 1);
  const yesterday = getYesterday(currentDateKey);
  let missedQuestCount = 0;
  let penaltiesApplied = 0;

  while (dateToProcess <= yesterday) {
    for (const quest of dailyQuests) {
      const questKey = quest.dailyQuestKey;

      if (!questKey) {
        continue;
      }

      await ensureDailyRecord(user._id, questKey, dateToProcess);

      const dailyRecord = await DailyQuestCompletionModel.findOne({
        userId: user._id,
        dailyQuestKey: questKey,
        date: dateKeyToUtcDate(dateToProcess),
      });

      if (!dailyRecord) {
        continue;
      }

      if (
        dailyRecord.status === "COMPLETED" ||
        dailyRecord.status === "MISSED"
      ) {
        continue;
      }

      dailyRecord.status = "MISSED";
      await dailyRecord.save();
      missedQuestCount += 1;

      if (await applyMissedQuestPenalty(user, questKey, dateToProcess)) {
        penaltiesApplied += 1;
      }
    }

    dateToProcess = addDays(dateToProcess, 1);
  }

  for (const quest of dailyQuests) {
    if (quest.dailyQuestKey) {
      await ensureDailyRecord(
        user._id,
        quest.dailyQuestKey,
        currentDateKey,
      );
    }
  }

  user.lastDailyQuestProcessedDate = currentDateKey;
  await user.save();

  return {
    currentDateKey,
    missedQuestCount,
    penaltiesApplied,
    initializedToday: false,
  };
}
