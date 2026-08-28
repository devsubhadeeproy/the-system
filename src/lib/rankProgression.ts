import {
  PLAYER_RANKS,
  type PlayerRank,
} from "@/models/User";

/**
 * Number of levels spent in each rank before the player
 * advances to the next rank.
 *
 * E: 10 levels  -> D at level 11
 * D: 15 levels  -> C at level 26
 * C: 20 levels  -> B at level 46
 * B: 25 levels  -> A at level 71
 * A: 30 levels  -> S at level 101
 * S: 35 levels  -> National at level 136
 * National: 40 levels -> Monarch at level 176
 * Monarch has no upper bound.
 */
export const LEVELS_PER_RANK: Record<PlayerRank, number> = {
  E: 10,
  D: 15,
  C: 20,
  B: 25,
  A: 30,
  S: 35,
  NATIONAL: 40,
  MONARCH: Number.POSITIVE_INFINITY,
};

export type RankRewardDefinition = {
  rank: Exclude<PlayerRank, "E">;
  title: string;
  description: string;
  triggerObject: string;
  alterEgoName: string;
};

/**
 * Psychological rank rewards. These are deliberately framed
 * as real-world identity rituals rather than physical loot.
 */
export const RANK_REWARDS: RankRewardDefinition[] = [
  {
    rank: "D",
    title: "The First Mirror",
    description:
      "Unlock an alter ego representing the disciplined version of yourself. Trigger it through a physical object you keep exclusively for System sessions.",
    triggerObject: "A dedicated black wristband",
    alterEgoName: "The Disciplined Self",
  },
  {
    rank: "C",
    title: "The Strategist",
    description:
      "Unlock an alter ego focused on deliberate planning, restraint, and execution. The trigger object becomes a cue to stop reacting and start choosing.",
    triggerObject: "A metal card kept in your wallet",
    alterEgoName: "The Strategist",
  },
  {
    rank: "B",
    title: "The Executor",
    description:
      "Unlock an alter ego built around finishing difficult work without negotiation. Its ritual begins whenever the trigger object is put on.",
    triggerObject: "A dedicated ring",
    alterEgoName: "The Executor",
  },
  {
    rank: "A",
    title: "The Sovereign",
    description:
      "Unlock an alter ego defined by calm authority, emotional control, and standards that do not depend on motivation.",
    triggerObject: "A physical notebook reserved for System decisions",
    alterEgoName: "The Sovereign",
  },
  {
    rank: "S",
    title: "The Perfected Self",
    description:
      "Unlock an alter ego representing your deliberately perfected operating mode: focused, composed, disciplined, and uncompromising about priorities.",
    triggerObject: "A personal pendant or necklace",
    alterEgoName: "The Perfected Self",
  },
  {
    rank: "NATIONAL",
    title: "The Apex Persona",
    description:
      "Unlock an alter ego designed to operate above ordinary standards: strategic, resilient, physically composed, and capable of sustained execution.",
    triggerObject: "A ceremonial object chosen specifically for this rank",
    alterEgoName: "The Apex Persona",
  },
  {
    rank: "MONARCH",
    title: "The Monarch Within",
    description:
      "Unlock the final alter ego: a symbolic version of yourself that embodies complete ownership of attention, habits, decisions, and long-term direction.",
    triggerObject: "A unique personal artifact chosen at Monarch rank",
    alterEgoName: "The Monarch Within",
  },
];

export function rankStartLevel(rank: PlayerRank): number {
  let level = 1;

  for (const currentRank of PLAYER_RANKS) {
    if (currentRank === rank) {
      return level;
    }

    const levels = LEVELS_PER_RANK[currentRank];

    if (!Number.isFinite(levels)) {
      return level;
    }

    level += levels;
  }

  return level;
}

export function rankForLevel(level: number): PlayerRank {
  if (level < 1) {
    return "E";
  }

  let remaining = level - 1;

  for (const rank of PLAYER_RANKS) {
    const levels = LEVELS_PER_RANK[rank];

    if (!Number.isFinite(levels) || remaining < levels) {
      return rank;
    }

    remaining -= levels;
  }

  return "MONARCH";
}

export function levelsUntilNextRank(
  level: number,
  rank: PlayerRank,
): number | null {
  const levelsInRank = LEVELS_PER_RANK[rank];

  if (!Number.isFinite(levelsInRank)) {
    return null;
  }

  const startLevel = rankStartLevel(rank);
  const levelsSpent = level - startLevel + 1;

  return Math.max(1, levelsInRank - levelsSpent + 1);
}

export function getRankReward(rank: PlayerRank): RankRewardDefinition | undefined {
  return RANK_REWARDS.find((reward) => reward.rank === rank);
}
