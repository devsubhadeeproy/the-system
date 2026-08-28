import Link from "next/link";
import { buyShopItem } from "@/actions/gameActions";
import { formatDuration, scaledTargetMinutes } from "@/lib/dailyQuests";
import { getCurrentGameDateKey, processDailyQuestRollover } from "@/lib/dailyQuestRollover";
import { getRankReward, levelsUntilNextRank } from "@/lib/rankProgression";
import connectMongoDB from "@/lib/mongodb";
import QuestBoard, { type QuestBoardQuest } from "@/components/QuestBoard";
import QuestModel, { type QuestTargetAttribute } from "@/models/Quest";
import DailyQuestCompletionModel from "@/models/DailyQuestCompletion";
import ShopItemModel from "@/models/ShopItem";
import UserModel, {
  PLAYER_ATTRIBUTES,
  type PlayerAttribute,
  type PlayerRank,
  type UserAttributes,
} from "@/models/User";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type PlayerViewModel = {
  name: string;
  level: number;
  currentXp: number;
  xpToNextLevel: number;
  rank: PlayerRank;
  gold: number;
  attributes: UserAttributes;
  unlockedRankRewards: Array<{
    rank: PlayerRank;
    title: string;
    description: string;
    triggerObject: string;
    alterEgoName: string;
    unlockedAt: Date;
  }>;
};

type ShopItemViewModel = {
  id: string;
  title: string;
  description: string;
  cost: number;
  stock?: number;
};

type DashboardData = {
  player: PlayerViewModel;
  quests: QuestBoardQuest[];
  shopItems: ShopItemViewModel[];
};

const attributeDescriptions: Record<PlayerAttribute, string> = {
  STR: "Strength",
  INT: "Intelligence",
  AGI: "Agility",
  WIS: "Wisdom",
  MANA: "Spiritual Energy",
  LIF: "Lifestyle",
  REC: "Recovery",
};

function xpPercent(currentXp: number, xpToNextLevel: number): number {
  if (xpToNextLevel <= 0) return 0;
  return Math.min(100, Math.round((currentXp / xpToNextLevel) * 100));
}

function scalingLabel(direction: string): string {
  if (direction === "UP") return "++ rank scaling";
  if (direction === "DOWN") return "-- rank scaling";
  return "constant";
}

function normalizeAttributes(rawAttributes: Record<string, unknown>): UserAttributes {
  return PLAYER_ATTRIBUTES.reduce((attributes, attribute) => {
    const value = rawAttributes[attribute];
    const legacyValue = rawAttributes[attribute.toLowerCase()];

    return {
      ...attributes,
      [attribute]:
        typeof value === "number"
          ? value
          : typeof legacyValue === "number"
            ? legacyValue
            : 10,
    };
  }, {} as UserAttributes);
}

function targetAttributesForQuest(
  targetAttributes: QuestTargetAttribute[] | undefined,
): Array<PlayerAttribute | "NONE"> {
  if (!targetAttributes?.length) return ["NONE"];

  return targetAttributes.filter(
    (attribute): attribute is PlayerAttribute | "NONE" =>
      attribute === "NONE" || PLAYER_ATTRIBUTES.includes(attribute),
  );
}

async function getDashboardData(): Promise<DashboardData> {
  await connectMongoDB();

  const player =
    (await UserModel.findOne().sort({ createdAt: 1 })) ??
    (await UserModel.create({ name: "Sung Jin-Woo" }));

  await processDailyQuestRollover(player._id);

  const currentPlayer = await UserModel.findById(player._id);
  if (!currentPlayer) throw new Error("Player not found.");

  const normalizedAttributes = normalizeAttributes(
    currentPlayer.attributes as UserAttributes & Record<string, unknown>,
  );

  if (
    PLAYER_ATTRIBUTES.some(
      (attribute) => currentPlayer.attributes[attribute] !== normalizedAttributes[attribute],
    )
  ) {
    currentPlayer.attributes = normalizedAttributes;
    currentPlayer.markModified("attributes");
    await currentPlayer.save();
  }

  const currentDateKey = getCurrentGameDateKey(currentPlayer.timezone);
  const currentDate = new Date(`${currentDateKey}T00:00:00.000Z`);

  const dailyCompletions = await DailyQuestCompletionModel.find({
    userId: currentPlayer._id,
    date: currentDate,
  }).lean();

  const dailyCompletionByKey = new Map(
    dailyCompletions.map((completion) => [completion.dailyQuestKey, completion]),
  );

  const [quests, shopItems] = await Promise.all([
    QuestModel.find({
      $or: [{ isPermanentDaily: true }, { completed: false }],
    }).sort({ type: 1, isPermanentDaily: -1, createdAt: -1 }),
    ShopItemModel.find().sort({ cost: 1, title: 1 }),
  ]);

  return {
    player: {
      name: currentPlayer.name,
      level: currentPlayer.level,
      currentXp: currentPlayer.currentXp,
      xpToNextLevel: currentPlayer.xpToNextLevel,
      rank: currentPlayer.rank,
      gold: currentPlayer.gold,
      attributes: normalizedAttributes,
      unlockedRankRewards: currentPlayer.unlockedRankRewards.map((reward) => ({
        rank: reward.rank,
        title: reward.title,
        description: reward.description,
        triggerObject: reward.triggerObject,
        alterEgoName: reward.alterEgoName,
        unlockedAt: reward.unlockedAt,
      })),
    },
    quests: quests.map((quest) => {
      const dailyCompletion = quest.dailyQuestKey
        ? dailyCompletionByKey.get(quest.dailyQuestKey)
        : undefined;
      const completedToday =
        quest.isPermanentDaily &&
        quest.type === "DAILY" &&
        dailyCompletion?.status === "COMPLETED";
      const targetMinutes = scaledTargetMinutes(
        quest.baseTargetMinutes,
        quest.scalingDirection,
        currentPlayer.rank,
      );

      return {
        id: quest._id.toString(),
        title: quest.title,
        description: quest.description,
        type: quest.type,
        targetAttributes: targetAttributesForQuest(quest.targetAttributes),
        xpReward: quest.xpReward,
        goldReward: quest.goldReward,
        isPermanentDaily: quest.isPermanentDaily,
        dailyQuestKey: quest.dailyQuestKey,
        targetDisplay: formatDuration(targetMinutes, quest.targetLabel ?? "Standard"),
        scalingLabel: scalingLabel(quest.scalingDirection),
        completedToday,
        completed: quest.isPermanentDaily ? completedToday : quest.completed,
        lastCompletedAt: dailyCompletion?.completedAt
          ? new Date(dailyCompletion.completedAt).toISOString()
          : undefined,
      };
    }),
    shopItems: shopItems.map((item) => ({
      id: item._id.toString(),
      title: item.title,
      description: item.description,
      cost: item.cost,
      stock: item.stock,
    })),
  };
}

function displayRank(rank: PlayerRank): string {
  if (rank === "NATIONAL") return "National Level";
  if (rank === "MONARCH") return "Monarch";
  return rank;
}

export default async function Home() {
  const { player, quests, shopItems } = await getDashboardData();
  const progress = xpPercent(player.currentXp, player.xpToNextLevel);
  const levelsToRank = levelsUntilNextRank(player.level, player.rank);
  const latestReward = player.unlockedRankRewards.at(-1);
  const nextReward = player.rank === "MONARCH" ? undefined : getRankReward(
    ["E", "D", "C", "B", "A", "S", "NATIONAL", "MONARCH"][
      ["E", "D", "C", "B", "A", "S", "NATIONAL", "MONARCH"].indexOf(player.rank) + 1
    ] as PlayerRank,
  );

  return (
    <main className="min-h-screen bg-[#09090b] text-zinc-100">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-5 py-8 sm:px-8 lg:px-10">
        <header className="flex flex-col gap-4 border-b border-sky-400/20 pb-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.32em] text-sky-300">System Interface</p>
            <h1 className="mt-3 text-4xl font-semibold text-white sm:text-5xl">Hunter Dashboard</h1>
          </div>
          <Link href="/admin" className="w-fit rounded border border-violet-300/40 px-4 py-2 font-mono text-xs uppercase tracking-[0.2em] text-violet-100 transition hover:bg-violet-400/10">Admin Gate</Link>
        </header>

        <section className="grid gap-5 lg:grid-cols-[1.35fr_0.9fr]">
          <div className="rounded-lg border border-sky-400/30 bg-zinc-950/80 p-5 shadow-[0_0_15px_rgba(56,189,248,0.3)]">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.24em] text-zinc-500">Player</p>
                <h2 className="mt-2 text-3xl font-semibold text-white">{player.name}</h2>
              </div>
              <div className="flex flex-wrap gap-3">
                <div className="rounded border border-violet-300/50 px-4 py-3 text-center"><p className="font-mono text-[10px] uppercase text-violet-200">Rank</p><p className="text-2xl font-bold text-white">{displayRank(player.rank)}</p></div>
                <div className="rounded border border-sky-300/40 px-4 py-3 text-center"><p className="font-mono text-[10px] uppercase text-sky-200">Level</p><p className="text-2xl font-bold text-white">{player.level}</p></div>
                <div className="rounded border border-amber-300/40 px-4 py-3 text-center"><p className="font-mono text-[10px] uppercase text-amber-200">Gold</p><p className="text-2xl font-bold text-white">{player.gold}</p></div>
              </div>
            </div>

            <div className="mt-6">
              <div className="mb-2 flex justify-between font-mono text-xs uppercase text-zinc-400"><span>Experience</span><span>{player.currentXp} / {player.xpToNextLevel} XP</span></div>
              <div className="h-4 overflow-hidden rounded border border-sky-300/30 bg-zinc-900"><div className="h-full bg-gradient-to-r from-sky-400 to-violet-400" style={{ width: `${progress}%` }} /></div>
            </div>

            <div className="mt-3 flex flex-wrap justify-between gap-2 font-mono text-[11px] uppercase text-zinc-500">
              <span>{levelsToRank === null ? "Final rank reached" : `${levelsToRank} level${levelsToRank === 1 ? "" : "s"} until next rank`}</span>
              {nextReward ? <span>Next unlock: {nextReward.alterEgoName}</span> : null}
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
              {PLAYER_ATTRIBUTES.map((attribute) => (
                <div key={attribute} className="rounded border border-white/10 bg-white/[0.03] p-4 text-center"><p className="font-mono text-xs uppercase text-sky-200">{attribute}</p><p className="mt-2 text-3xl font-semibold text-white">{player.attributes[attribute]}</p><p className="mt-1 text-[11px] text-zinc-500">{attributeDescriptions[attribute]}</p></div>
              ))}
            </div>

            {latestReward ? (
              <div className="mt-6 rounded border border-violet-300/30 bg-violet-400/[0.05] p-4">
                <p className="font-mono text-xs uppercase tracking-[0.18em] text-violet-200">Rank Reward Unlocked — {displayRank(latestReward.rank)}</p>
                <h3 className="mt-2 text-xl font-semibold text-white">{latestReward.title}</h3>
                <p className="mt-2 text-sm leading-6 text-zinc-300">{latestReward.description}</p>
                <p className="mt-3 text-xs text-zinc-500">Alter ego: <span className="text-violet-200">{latestReward.alterEgoName}</span> · Trigger: <span className="text-violet-200">{latestReward.triggerObject}</span></p>
              </div>
            ) : null}
          </div>

          <aside className="rounded-lg border border-violet-400/30 bg-zinc-950/80 p-5">
            <div className="flex items-center justify-between"><div><p className="font-mono text-xs uppercase text-violet-200">Shadow Market</p><h2 className="mt-2 text-2xl font-semibold text-white">Shop</h2></div><span className="font-mono text-sm text-amber-200">{player.gold} G</span></div>
            <div className="mt-5 space-y-3">
              {shopItems.length === 0 ? <p className="rounded border border-white/10 p-4 text-sm text-zinc-400">No items are listed yet.</p> : shopItems.map((item) => (
                <div key={item.id} className="rounded border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold text-white">{item.title}</h3><p className="mt-1 text-sm leading-6 text-zinc-400">{item.description}</p></div><p className="whitespace-nowrap font-mono text-sm text-amber-200">{item.cost} G</p></div>
                  <form action={buyShopItem.bind(null, item.id)} className="mt-4"><button type="submit" disabled={player.gold < item.cost || (typeof item.stock === "number" && item.stock <= 0)} className="w-full rounded border border-violet-300/40 px-3 py-2 font-mono text-xs uppercase text-violet-100 transition hover:bg-violet-400/10 disabled:cursor-not-allowed disabled:border-zinc-700 disabled:text-zinc-600">Buy{typeof item.stock === "number" ? ` - ${item.stock} left` : ""}</button></form>
                </div>
              ))}
            </div>
          </aside>
        </section>

        <QuestBoard quests={quests} />
      </div>
    </main>
  );
}
