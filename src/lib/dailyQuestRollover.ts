import connectMongoDB from "@/lib/mongodb";
import { DAILY_QUEST_DEFINITIONS } from "@/lib/dailyQuests";
import DailyQuestCompletionModel from "@/models/DailyQuestCompletion";
import QuestModel from "@/models/Quest";
import UserModel from "@/models/User";

const DAILY_CYCLE_RESET_HOUR = 2;
const DAILY_CYCLE_RESET_MINUTE = 30;

export function getCurrentGameDateKey(
  timezone: string,
  now: Date = new Date(),
): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    throw new Error("Could not determine current game date.");
  }

  const localDate = new Date(
    `${year}-${month}-${day}T${String(DAILY_CYCLE_RESET_HOUR).padStart(2, "0")}:${String(
      DAILY_CYCLE_RESET_MINUTE,
    ).padStart(2, "0")}:00`,
  );

  const resetParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);

  const currentHour = Number(
    resetParts.find((part) => part.type === "hour")?.value ?? "0",
  );
  const currentMinute = Number(
    resetParts.find((part) => part.type === "minute")?.value ?? "0",
  );

  if (
    currentHour < DAILY_CYCLE_RESET_HOUR ||
    (currentHour === DAILY_CYCLE_RESET_HOUR &&
      currentMinute < DAILY_CYCLE_RESET_MINUTE)
  ) {
    localDate.setDate(localDate.getDate() - 1);
  }

  const gameDateParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(localDate);

  const gameYear = gameDateParts.find((part) => part.type === "year")?.value;
  const gameMonth = gameDateParts.find((part) => part.type === "month")?.value;
  const gameDay = gameDateParts.find((part) => part.type === "day")?.value;

  if (!gameYear || !gameMonth || !gameDay) {
    throw new Error("Could not determine game date key.");
  }

  return `${gameYear}-${gameMonth}-${gameDay}`;
}

export function dateKeyToUtcDate(dateKey: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);

  if (!match) {
    throw new Error(`Invalid date key: ${dateKey}`);
  }

  const [, year, month, day] = match;

  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
}

async function ensurePermanentDailyQuestDefinitions(): Promise<void> {
  await QuestModel.bulkWrite(
    DAILY_QUEST_DEFINITIONS.map((definition) => ({
      updateOne: {
        filter: {
          dailyQuestKey: definition.key,
        },
        update: {
          $setOnInsert: {
            title: definition.title,
            description: definition.description,
            type: "DAILY",
            targetAttributes: definition.targetAttributes,
            xpReward: definition.xpReward,
            goldReward: definition.goldReward,
            completed: false,
            isPermanentDaily: true,
            dailyQuestKey: definition.key,
            ...(definition.baseTargetMinutes !== undefined
              ? { baseTargetMinutes: definition.baseTargetMinutes }
              : {}),
            ...(definition.targetLabel !== undefined
              ? { targetLabel: definition.targetLabel }
              : {}),
            scalingDirection: definition.scalingDirection,
          },
        },
        upsert: true,
      },
    })),
  );
}

async function ensureDailyRecord(
  userId: string,
  dailyQuestKey: string,
  dateKey: string,
): Promise<void> {
  const date = dateKeyToUtcDate(dateKey);

  await DailyQuestCompletionModel.updateOne(
    {
      userId,
      dailyQuestKey,
      date,
    },
    {
      $setOnInsert: {
        userId,
        dailyQuestKey,
        date,
        status: "AVAILABLE",
      },
    },
    {
      upsert: true,
    },
  );
}

function getPreviousGameDateKey(dateKey: string, timezone: string): string {
  const date = dateKeyToUtcDate(dateKey);
  date.setUTCDate(date.getUTCDate() - 1);

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

async function ensureDailyRecordsForDate(
  userId: string,
  dailyQuests: Array<{ dailyQuestKey?: string | null }>,
  dateKey: string,
): Promise<void> {
  for (const quest of dailyQuests) {
    if (!quest.dailyQuestKey) continue;

    await ensureDailyRecord(userId, quest.dailyQuestKey, dateKey);
  }
}

export async function processUserDailyQuestRollover(
  user: {
    _id: string;
    timezone?: string;
    lastDailyQuestProcessedDate?: string | null;
  },
  now: Date = new Date(),
): Promise<void> {
  const timezone = user.timezone || "Asia/Kolkata";
  const currentDateKey = getCurrentGameDateKey(timezone, now);

  /*
   * IMPORTANT:
   * Permanent daily quest definitions are seeded before we query them.
   *
   * This is the part that fixes a freshly-cleared database.
   * $setOnInsert means existing quests are NOT overwritten.
   */
  await ensurePermanentDailyQuestDefinitions();

  const dailyQuests = await QuestModel.find({
    isPermanentDaily: true,
    type: "DAILY",
    dailyQuestKey: { $exists: true, $ne: null },
  })
    .select({ dailyQuestKey: 1 })
    .lean();

  if (!user.lastDailyQuestProcessedDate) {
    await ensureDailyRecordsForDate(user._id, dailyQuests, currentDateKey);

    await UserModel.updateOne(
      { _id: user._id },
      {
        $set: {
          lastDailyQuestProcessedDate: currentDateKey,
        },
      },
    );

    return;
  }

  if (user.lastDailyQuestProcessedDate === currentDateKey) {
    /*
     * Same game day.
     *
     * This also repairs missing completion records if necessary,
     * without changing any already-existing records.
     */
    await ensureDailyRecordsForDate(user._id, dailyQuests, currentDateKey);

    return;
  }

  /*
   * One or more game days have passed.
   *
   * Create completion records for every missed/current day.
   * Existing records are untouched because ensureDailyRecord()
   * uses upsert + $setOnInsert.
   */
  let dateKey = getPreviousGameDateKey(currentDateKey, timezone);

  while (true) {
    await ensureDailyRecordsForDate(user._id, dailyQuests, dateKey);

    if (dateKey === user.lastDailyQuestProcessedDate) {
      break;
    }

    dateKey = getPreviousGameDateKey(dateKey, timezone);
  }

  await ensureDailyRecordsForDate(user._id, dailyQuests, currentDateKey);

  await UserModel.updateOne(
    { _id: user._id },
    {
      $set: {
        lastDailyQuestProcessedDate: currentDateKey,
      },
    },
  );
}

export async function processDailyQuestRollover(
  userId: string,
  now: Date = new Date(),
): Promise<void> {
  await connectMongoDB();

  const user = await UserModel.findById(userId).lean();

  if (!user) {
    return;
  }

  await processUserDailyQuestRollover(
    {
      _id: String(user._id),
      timezone: user.timezone,
      lastDailyQuestProcessedDate: user.lastDailyQuestProcessedDate,
    },
    now,
  );
}

export async function processAllUsersDailyQuestRollover(
  now: Date = new Date(),
): Promise<void> {
  await connectMongoDB();

  /*
   * Seed definitions even if there are currently no users.
   */
  await ensurePermanentDailyQuestDefinitions();

  const users = await UserModel.find({}).lean();

  for (const user of users) {
    await processUserDailyQuestRollover(
      {
        _id: String(user._id),
        timezone: user.timezone,
        lastDailyQuestProcessedDate: user.lastDailyQuestProcessedDate,
      },
      now,
    );
  }
}
