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

const MISSED_QUEST_ATTRIBUTE_PENALTY = 1;

type RolloverResult = {
  currentDateKey: string;
  missedQuestCount: number;
  penaltiesApplied: number;
  initializedToday: boolean;
};

function getDateKeyInTimezone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
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

  if (!definition) {
    return undefined;
  }

  return definition.targetAttributes.find((attribute) =>
    PLAYER_ATTRIBUTES.includes(attribute),
  );
}

/**
 * Ensure that a daily completion record exists for
 * a particular quest/day.
 *
 * DailyQuestCompletion is intentionally not tied to userId
 * because the current application has a single player.
 *
 * The unique dailyQuestKey + date index guarantees that
 * repeated calls remain idempotent.
 */
async function ensureDailyRecord(
  questKey: string,
  dateKey: string,
): Promise<void> {
  const date = dateKeyToUtcDate(dateKey);

  await DailyQuestCompletionModel.updateOne(
    {
      dailyQuestKey: questKey,
      date,
    },
    {
      $setOnInsert: {
        dailyQuestKey: questKey,
        date,
        status: "AVAILABLE",
        penaltyApplied: false,
      },
    },
    {
      upsert: true,
    },
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

  /**
   * Penalty creation is protected by the unique index
   * on the Penalty model.
   *
   * If rollover runs twice, the second execution receives
   * a duplicate-key error and does not subtract the
   * attribute again.
   */
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
    {
      userId: user._id,
      questKey,
      dateKey,
      applied: false,
    },
    {
      $set: {
        applied: true,
        appliedAt: new Date(),
      },
    },
  );

  return true;
}

/**
 * Processes daily quest rollover for the player.
 *
 * Properties:
 * - Safe to call repeatedly.
 * - Does not punish the player twice.
 * - Handles multiple missed calendar days.
 * - Uses the player's timezone.
 * - Creates today's daily quest records.
 */
export async function processDailyQuestRollover(
  userId: Types.ObjectId,
): Promise<RolloverResult> {
  await connectMongoDB();

  const user = await UserModel.findById(userId);

  if (!user) {
    throw new Error("Player not found.");
  }

  const currentDateKey = getDateKeyInTimezone(
    new Date(),
    user.timezone,
  );

  const dailyQuests = await QuestModel.find({
    isPermanentDaily: true,
    type: "DAILY",
    dailyQuestKey: {
      $exists: true,
      $ne: null,
    },
  }).lean();

  /**
   * First-time initialization.
   *
   * We create today's records but do not punish the player
   * for any dates before daily tracking started.
   */
  if (!user.lastDailyQuestProcessedDate) {
    for (const quest of dailyQuests) {
      if (!quest.dailyQuestKey) {
        continue;
      }

      await ensureDailyRecord(
        quest.dailyQuestKey,
        currentDateKey,
      );
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

  let dateToProcess = addDays(
    user.lastDailyQuestProcessedDate,
    1,
  );

  const yesterday = getYesterday(currentDateKey);

  let missedQuestCount = 0;
  let penaltiesApplied = 0;

  /**
   * Process every completed calendar day between the
   * last processed date and yesterday.
   */
  while (dateToProcess <= yesterday) {
    for (const quest of dailyQuests) {
      const questKey = quest.dailyQuestKey;

      if (!questKey) {
        continue;
      }

      await ensureDailyRecord(
        questKey,
        dateToProcess,
      );

      const dailyRecord = await DailyQuestCompletionModel.findOne({
        dailyQuestKey: questKey,
        date: dateKeyToUtcDate(dateToProcess),
      });

      if (!dailyRecord) {
        continue;
      }

      /**
       * Already completed — nothing to do.
       */
      if (dailyRecord.status === "COMPLETED") {
        continue;
      }

      /**
       * A previous rollover may already have marked it
       * missed. Never punish it again.
       */
      if (dailyRecord.status === "MISSED") {
        continue;
      }

      /**
       * Both AVAILABLE and PENDING represent an unfinished
       * daily quest whose calendar day has ended.
       */
      if (
        dailyRecord.status === "AVAILABLE" ||
        dailyRecord.status === "PENDING"
      ) {
        dailyRecord.status = "MISSED";

        await dailyRecord.save();

        missedQuestCount += 1;

        const penaltyApplied = await applyMissedQuestPenalty(
          user,
          questKey,
          dateToProcess,
        );

        if (penaltyApplied) {
          penaltiesApplied += 1;
        }
      }
    }

    dateToProcess = addDays(dateToProcess, 1);
  }

  /**
   * Today's records must always exist.
   */
  for (const quest of dailyQuests) {
    if (!quest.dailyQuestKey) {
      continue;
    }

    await ensureDailyRecord(
      quest.dailyQuestKey,
      currentDateKey,
    );
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