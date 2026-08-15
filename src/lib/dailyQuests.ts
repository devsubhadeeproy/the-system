import {
  PLAYER_RANKS,
  type PlayerAttribute,
  type PlayerRank,
} from "@/models/User";
import type { QuestScalingDirection } from "@/models/Quest";

export type DailyQuestKey =
  | "wake-up-5am"
  | "reading"
  | "gym"
  | "classes"
  | "power-nap"
  | "gate-prep"
  | "dinner"
  | "journaling"
  | "cleaning-room"
  | "meditating";

export type DailyQuestDefinition = {
  key: DailyQuestKey;
  title: string;
  description: string;
  targetAttributes: PlayerAttribute[];
  baseTargetMinutes?: number;
  targetLabel: string;
  scalingDirection: QuestScalingDirection;
  xpReward: number;
  goldReward: number;
};

export const DAILY_QUEST_DEFINITIONS: DailyQuestDefinition[] = [
  {
    key: "wake-up-5am",
    title: "Wake up at 5 AM",
    description: "Begin the day before the world gets loud.",
    targetAttributes: ["LIF"],
    targetLabel: "5:00 AM",
    scalingDirection: "CONSTANT",
    xpReward: 35,
    goldReward: 15,
  },
  {
    key: "reading",
    title: "Reading",
    description: "Read with notes, recall, and deliberate attention.",
    targetAttributes: ["WIS", "LIF"],
    baseTargetMinutes: 30,
    targetLabel: "30 minutes++",
    scalingDirection: "UP",
    xpReward: 55,
    goldReward: 20,
  },
  {
    key: "gym",
    title: "Going to gym",
    description: "Train strength and movement with tracked exercises.",
    targetAttributes: ["STR", "AGI"],
    baseTargetMinutes: 120,
    targetLabel: "2 hours",
    scalingDirection: "CONSTANT",
    xpReward: 85,
    goldReward: 35,
  },
  {
    key: "classes",
    title: "Attend all the classes after going to uni",
    description: "Show up, stay present, and capture the core concepts.",
    targetAttributes: ["INT"],
    targetLabel: "Standard",
    scalingDirection: "CONSTANT",
    xpReward: 65,
    goldReward: 25,
  },
  {
    key: "power-nap",
    title: "Taking a power nap",
    description: "Recover without drifting into a full sleep cycle.",
    targetAttributes: ["REC"],
    targetLabel: "Standard",
    scalingDirection: "CONSTANT",
    xpReward: 30,
    goldReward: 10,
  },
  {
    key: "gate-prep",
    title: "Preparing for GATE exam",
    description: "Deep work on GATE concepts, problems, and revision.",
    targetAttributes: ["INT"],
    baseTargetMinutes: 180,
    targetLabel: "3 hours++",
    scalingDirection: "UP",
    xpReward: 110,
    goldReward: 45,
  },
  {
    key: "dinner",
    title: "Dinner",
    description: "Eat cleanly and close the day with recovery in mind.",
    targetAttributes: ["REC"],
    baseTargetMinutes: 25,
    targetLabel: "25 minutes--",
    scalingDirection: "DOWN",
    xpReward: 25,
    goldReward: 10,
  },
  {
    key: "journaling",
    title: "Journaling",
    description: "Reflect, review, and capture the signal from the day.",
    targetAttributes: ["LIF"],
    baseTargetMinutes: 60,
    targetLabel: "1 hour",
    scalingDirection: "CONSTANT",
    xpReward: 45,
    goldReward: 15,
  },
  {
    key: "cleaning-room",
    title: "Cleaning the room",
    description: "Reset the physical arena so tomorrow starts clean.",
    targetAttributes: ["LIF"],
    baseTargetMinutes: 60,
    targetLabel: "1 hour",
    scalingDirection: "CONSTANT",
    xpReward: 40,
    goldReward: 15,
  },
  {
    key: "meditating",
    title: "Meditating",
    description: "Build spiritual energy through stillness and attention.",
    targetAttributes: ["MANA"],
    baseTargetMinutes: 30,
    targetLabel: "30 minutes++",
    scalingDirection: "UP",
    xpReward: 60,
    goldReward: 20,
  },
];

export function rankIndex(rank: PlayerRank): number {
  return PLAYER_RANKS.indexOf(rank);
}

export function scaledTargetMinutes(
  baseTargetMinutes: number | undefined,
  scalingDirection: QuestScalingDirection,
  rank: PlayerRank,
): number | undefined {
  if (baseTargetMinutes === undefined) {
    return undefined;
  }

  const rankStep = rankIndex(rank);

  if (scalingDirection === "UP") {
    return baseTargetMinutes + rankStep * 5;
  }

  if (scalingDirection === "DOWN") {
    return Math.max(5, baseTargetMinutes - rankStep * 3);
  }

  return baseTargetMinutes;
}

export function formatDuration(minutes: number | undefined, fallback: string): string {
  if (minutes === undefined) {
    return fallback;
  }

  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (remainingMinutes === 0) {
    return `${hours} hr`;
  }

  return `${hours} hr ${remainingMinutes} min`;
}
