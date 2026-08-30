"use client";

import { useState, useTransition } from "react";
import { simulateRankReward } from "@/actions/gameActions";
import type { PlayerRank } from "@/models/User";

const TESTABLE_RANKS: Array<Exclude<PlayerRank, "E">> = [
  "D",
  "C",
  "B",
  "A",
  "S",
  "NATIONAL",
  "MONARCH",
];

type SimulationResult = Awaited<ReturnType<typeof simulateRankReward>>;

type Props = {
  currentLevel: number;
  currentRank: PlayerRank;
};

function rankLabel(rank: PlayerRank): string {
  return rank === "NATIONAL" ? "National Level" : rank;
}

export default function RankRewardLab({ currentLevel, currentRank }: Props) {
  const [targetRank, setTargetRank] = useState<Exclude<PlayerRank, "E">>("D");
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [isPending, startTransition] = useTransition();

  function runSimulation() {
    const formData = new FormData();
    formData.set("targetRank", targetRank);

    startTransition(async () => {
      try {
        const simulation = await simulateRankReward(formData);
        setResult(simulation);
      } catch (error) {
        setResult({
          ok: false,
          message: error instanceof Error ? error.message : "Simulation failed.",
          currentLevel,
          currentRank,
          targetRank,
          targetLevel: null,
          rewards: [],
        });
      }
    });
  }

  return (
    <section className="rounded-lg border border-fuchsia-300/30 bg-fuchsia-400/[0.04] p-5 shadow-[0_0_18px_rgba(232,121,249,0.08)]">
      <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-fuchsia-300">
            Development Control
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-white">
            Rank Reward Laboratory
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
            Simulates the real XP and rank-reward progression in memory. It does
            not change the player&apos;s level, rank, XP, gold, attributes, or
            unlocked rewards. Use it to verify rank thresholds and reward data
            without waiting for actual progression.
          </p>
        </div>

        <div className="grid min-w-[220px] grid-cols-2 gap-2 font-mono text-xs uppercase tracking-[0.12em]">
          <div className="rounded border border-white/10 bg-black/30 p-3">
            <p className="text-zinc-500">Current Level</p>
            <p className="mt-1 text-lg text-white">{currentLevel}</p>
          </div>
          <div className="rounded border border-white/10 bg-black/30 p-3">
            <p className="text-zinc-500">Current Rank</p>
            <p className="mt-1 text-lg text-white">{rankLabel(currentRank)}</p>
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="block flex-1">
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-zinc-400">
            Target Rank
          </span>
          <select
            value={targetRank}
            onChange={(event) => {
              setTargetRank(event.target.value as Exclude<PlayerRank, "E">);
              setResult(null);
            }}
            className="mt-2 w-full rounded border border-white/10 bg-black/40 px-3 py-3 text-white outline-none transition focus:border-fuchsia-300/60"
          >
            {TESTABLE_RANKS.map((rank) => (
              <option key={rank} value={rank}>
                {rankLabel(rank)}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          onClick={runSimulation}
          disabled={isPending}
          className="rounded border border-fuchsia-300/50 px-5 py-3 font-mono text-xs uppercase tracking-[0.18em] text-fuchsia-100 shadow-[0_0_15px_rgba(232,121,249,0.18)] transition hover:border-fuchsia-200 hover:bg-fuchsia-400/10 disabled:cursor-not-allowed disabled:border-zinc-700 disabled:text-zinc-600"
        >
          {isPending ? "Simulating..." : "Simulate Rank-Up"}
        </button>
      </div>

      {result ? (
        <div
          className={`mt-5 rounded border p-4 ${
            result.ok
              ? "border-emerald-300/30 bg-emerald-400/[0.04]"
              : "border-rose-300/30 bg-rose-400/[0.04]"
          }`}
        >
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-zinc-400">
            Simulation Result
          </p>
          <p className="mt-2 text-sm leading-6 text-zinc-200">
            {result.message}
          </p>

          {result.ok && result.rewards.length > 0 ? (
            <div className="mt-4 space-y-3">
              {result.rewards.map((reward) => (
                <div
                  key={reward.rank}
                  className="rounded border border-fuchsia-300/20 bg-black/30 p-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded border border-fuchsia-300/30 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-fuchsia-200">
                      {rankLabel(reward.rank)} Unlocked
                    </span>
                    <span className="text-sm font-semibold text-white">
                      {reward.title}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-zinc-400">
                    {reward.description}
                  </p>
                  <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                    <div>
                      <span className="font-mono uppercase tracking-[0.12em] text-zinc-600">
                        Trigger Object
                      </span>
                      <p className="mt-1 text-zinc-200">{reward.triggerObject}</p>
                    </div>
                    <div>
                      <span className="font-mono uppercase tracking-[0.12em] text-zinc-600">
                        Alter Ego
                      </span>
                      <p className="mt-1 text-zinc-200">{reward.alterEgoName}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
