"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { completeQuest } from "@/actions/gameActions";
import type { QuestType } from "@/models/Quest";
import type { PlayerAttribute, PlayerRank } from "@/models/User";

export type QuestBoardQuest = {
  id: string;
  title: string;
  description: string;
  type: QuestType;
  targetAttributes: Array<PlayerAttribute | "NONE">;
  xpReward: number;
  goldReward: number;
  isPermanentDaily: boolean;
  dailyQuestKey?: string;
  targetDisplay: string;
  scalingLabel: string;
  completedToday: boolean;
  completed: boolean;
  lastCompletedAt?: string;
};

export type QuestBoardRankReward = {
  rank: PlayerRank;
  title: string;
  description: string;
  triggerObject: string;
  alterEgoName: string;
  unlockedAt: string;
};

type Props = { quests: QuestBoardQuest[]; rankRewards: QuestBoardRankReward[] };

const groups: Array<{ title: string; type: QuestType; accent: string }> = [
  { title: "Daily Routine", type: "DAILY", accent: "border-sky-400/50" },
  { title: "Urgent Tasks", type: "URGENT", accent: "border-rose-400/50" },
];

function displayRank(rank: PlayerRank) {
  return rank === "NATIONAL" ? "National Level" : rank === "MONARCH" ? "Monarch" : rank;
}

function canComplete(quest: QuestBoardQuest) {
  return quest.isPermanentDaily ? !quest.completedToday : !quest.completed;
}

function detailsForQuest(quest: QuestBoardQuest) {
  const title = quest.title.toLowerCase();
  const key = quest.dailyQuestKey ?? "";
  return {
    exercises: key === "gym" || title.includes("gym"),
    reading: key === "reading" || title.includes("reading"),
    topics: key === "gate-prep" || key === "classes" || title.includes("gate") || title.includes("class"),
  };
}

export default function QuestBoardV2({ quests, rankRewards }: Props) {
  const router = useRouter();
  const [localQuests, setLocalQuests] = useState(quests);
  const [selectedQuest, setSelectedQuest] = useState<QuestBoardQuest | null>(null);
  const [isPending, startTransition] = useTransition();

  const attributes = useMemo(
    () => selectedQuest?.targetAttributes.filter((a): a is PlayerAttribute => a !== "NONE") ?? [],
    [selectedQuest],
  );
  const details = selectedQuest ? detailsForQuest(selectedQuest) : null;

  function submitCompletion(formData: FormData) {
    if (!selectedQuest || !canComplete(selectedQuest)) return;
    const completedQuest = selectedQuest;
    startTransition(async () => {
      try {
        await completeQuest(completedQuest.id, formData);
        setLocalQuests((current) => current.map((quest) => quest.id === completedQuest.id ? {
          ...quest,
          completedToday: quest.isPermanentDaily ? true : quest.completedToday,
          completed: quest.isPermanentDaily ? quest.completed : true,
          lastCompletedAt: new Date().toISOString(),
        } : quest));
        setSelectedQuest(null);
        router.refresh();
      } catch (error) {
        console.error("Quest completion failed:", error);
      }
    });
  }

  return (
    <>
      <section>
        <div className="mb-5">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-sky-300">Quest Board</p>
          <h2 className="mt-2 text-3xl font-semibold text-white">Active Missions</h2>
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          {groups.map((group) => {
            const groupQuests = localQuests.filter((quest) => quest.type === group.type);
            return (
              <div key={group.type} className={`rounded-lg border ${group.accent} bg-zinc-950/70 p-5 backdrop-blur`}>
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-semibold text-white">{group.title}</h3>
                  <span className="font-mono text-xs text-zinc-500">{groupQuests.length} listed</span>
                </div>
                <div className="mt-4 space-y-3">
                  {groupQuests.length === 0 ? (
                    <p className="rounded border border-white/10 bg-white/[0.03] p-4 text-sm text-zinc-500">No open missions in this gate.</p>
                  ) : groupQuests.map((quest) => {
                    const completed = !canComplete(quest);
                    return (
                      <button key={quest.id} type="button" disabled={completed || isPending} onClick={() => !completed && setSelectedQuest(quest)} className={[
                        "block w-full rounded border p-4 text-left transition",
                        completed ? "cursor-not-allowed border-emerald-400/20 bg-emerald-400/[0.04] opacity-65" : "border-white/10 bg-white/[0.03] hover:border-sky-300/40 hover:bg-sky-400/[0.06]",
                        isPending && !completed ? "cursor-wait opacity-70" : "",
                      ].join(" ")}>
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <h4 className={completed ? "font-semibold text-zinc-400" : "font-semibold text-white"}>{quest.title}</h4>
                              {completed ? <span className="rounded border border-emerald-300/30 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-emerald-200">Completed</span> : null}
                            </div>
                            <p className={completed ? "mt-2 text-sm leading-6 text-zinc-600" : "mt-2 text-sm leading-6 text-zinc-400"}>{quest.description}</p>
                            <div className="mt-3 flex flex-wrap gap-2 font-mono text-[11px] uppercase tracking-[0.12em]">
                              <span className="rounded border border-sky-300/30 px-2 py-1 text-sky-200">{quest.targetDisplay}</span>
                              <span className="rounded border border-violet-300/30 px-2 py-1 text-violet-200">{quest.targetAttributes.join(", ")}</span>
                              <span className="rounded border border-amber-300/30 px-2 py-1 text-amber-200">+{quest.xpReward} XP / +{quest.goldReward} G</span>
                            </div>
                            {completed && quest.isPermanentDaily ? <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-emerald-300/70">Complete for today • Available next cycle</p> : null}
                          </div>
                          <span className={completed ? "rounded border border-emerald-300/20 px-3 py-2 font-mono text-xs uppercase tracking-[0.16em] text-emerald-300/60" : "rounded border border-white/10 px-3 py-2 font-mono text-xs uppercase tracking-[0.16em] text-zinc-300"}>{completed ? "Completed" : isPending ? "Processing..." : "Track"}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mt-5 rounded-lg border border-violet-400/30 bg-zinc-950/70 p-5 backdrop-blur">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.24em] text-violet-300">Rank Progression</p>
            <h3 className="mt-2 text-2xl font-semibold text-white">Unlocked Rank Rewards</h3>
          </div>
          <span className="font-mono text-xs uppercase tracking-[0.16em] text-zinc-500">{rankRewards.length} unlocked</span>
        </div>
        {rankRewards.length === 0 ? (
          <div className="mt-4 rounded border border-white/10 bg-white/[0.03] p-5">
            <p className="font-semibold text-zinc-300">No rank rewards unlocked yet.</p>
            <p className="mt-2 text-sm leading-6 text-zinc-500">Advance beyond E-Rank to unlock your first alter ego.</p>
          </div>
        ) : (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {rankRewards.map((reward) => (
              <article key={`${reward.rank}-${reward.unlockedAt}`} className="rounded border border-violet-300/20 bg-violet-400/[0.04] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="rounded border border-violet-300/30 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-violet-200">{displayRank(reward.rank)}</span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-600">Unlocked {new Date(reward.unlockedAt).toLocaleDateString()}</span>
                </div>
                <h4 className="mt-3 text-lg font-semibold text-white">{reward.title}</h4>
                <p className="mt-2 text-sm leading-6 text-zinc-300">{reward.description}</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded border border-white/10 bg-black/20 p-3"><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">Alter Ego</p><p className="mt-1 text-sm font-semibold text-violet-200">{reward.alterEgoName}</p></div>
                  <div className="rounded border border-white/10 bg-black/20 p-3"><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">Trigger Object</p><p className="mt-1 text-sm font-semibold text-sky-200">{reward.triggerObject}</p></div>
                </div>
                <div className="mt-3 rounded border border-emerald-300/10 bg-emerald-400/[0.03] p-3">
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-emerald-300/80">Activation Effect</p>
                  <p className="mt-1 text-sm leading-6 text-zinc-300">When activated, use the alter ego as a deliberate mental mode: follow its standards, decision rules, and behavior described above.</p>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {selectedQuest && canComplete(selectedQuest) ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 py-6 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-sky-300/40 bg-zinc-950 p-5 shadow-[0_0_35px_rgba(56,189,248,0.28)]">
            <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
              <div><p className="font-mono text-xs uppercase tracking-[0.24em] text-sky-300">Session Log</p><h3 className="mt-2 text-2xl font-semibold text-white">{selectedQuest.title}</h3><p className="mt-2 text-sm leading-6 text-zinc-400">{selectedQuest.description}</p></div>
              <button type="button" onClick={() => !isPending && setSelectedQuest(null)} disabled={isPending} className="rounded border border-white/10 px-3 py-2 font-mono text-xs uppercase tracking-[0.16em] text-zinc-300 disabled:opacity-50">Close</button>
            </div>
            <form action={submitCompletion} className="mt-5 space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded border border-sky-300/20 bg-sky-400/[0.04] p-3"><p className="font-mono text-[10px] uppercase tracking-[0.18em] text-sky-200">Target</p><p className="mt-2 text-sm font-semibold text-white">{selectedQuest.targetDisplay}</p></div>
                <div className="rounded border border-violet-300/20 bg-violet-400/[0.04] p-3"><p className="font-mono text-[10px] uppercase tracking-[0.18em] text-violet-200">Scaling</p><p className="mt-2 text-sm font-semibold text-white">{selectedQuest.scalingLabel}</p></div>
                <div className="rounded border border-amber-300/20 bg-amber-400/[0.04] p-3"><p className="font-mono text-[10px] uppercase tracking-[0.18em] text-amber-200">Reward</p><p className="mt-2 text-sm font-semibold text-white">+{selectedQuest.xpReward} XP / +{selectedQuest.goldReward} G</p></div>
              </div>
              {attributes.length > 1 ? <fieldset className="rounded border border-violet-300/30 bg-violet-400/[0.04] p-4"><legend className="px-2 font-mono text-xs uppercase tracking-[0.18em] text-violet-100">Choose the attribute to allot your rewards to:</legend><div className="mt-3 grid gap-2 sm:grid-cols-2">{attributes.map((attribute, index) => <label key={attribute} className="flex cursor-pointer items-center gap-3 rounded border border-white/10 bg-black/30 px-3 py-3 text-sm text-zinc-200"><input type="radio" name="selectedAttribute" value={attribute} required defaultChecked={index === 0} className="h-4 w-4 accent-violet-300" />{attribute}</label>)}</div></fieldset> : attributes.length === 1 ? <input type="hidden" name="selectedAttribute" value={attributes[0]} /> : null}
              {details?.exercises ? <label className="block"><span className="font-mono text-xs uppercase tracking-[0.18em] text-zinc-400">Exercises, sets, reps, weight</span><textarea name="exercises" rows={4} className="mt-2 w-full resize-none rounded border border-white/10 bg-black/40 px-3 py-3 text-white outline-none" placeholder="Squat 3x5 at 80kg, rows 4x8 at 45kg..." /></label> : null}
              {details?.reading ? <div className="grid gap-4 sm:grid-cols-[1fr_160px]"><label className="block"><span className="font-mono text-xs uppercase tracking-[0.18em] text-zinc-400">Book title</span><input name="bookTitle" className="mt-2 w-full rounded border border-white/10 bg-black/40 px-3 py-3 text-white outline-none" placeholder="Book or article" /></label><label className="block"><span className="font-mono text-xs uppercase tracking-[0.18em] text-zinc-400">Pages</span><input name="pagesRead" type="number" min={0} className="mt-2 w-full rounded border border-white/10 bg-black/40 px-3 py-3 text-white outline-none" /></label></div> : null}
              {details?.topics ? <label className="block"><span className="font-mono text-xs uppercase tracking-[0.18em] text-zinc-400">Concepts and topics studied</span><textarea name="topicsStudied" rows={4} className="mt-2 w-full resize-none rounded border border-white/10 bg-black/40 px-3 py-3 text-white outline-none" placeholder="Signals and systems, compiler design, DBMS joins..." /></label> : null}
              <label className="block"><span className="font-mono text-xs uppercase tracking-[0.18em] text-zinc-400">Notes and reflections</span><textarea name="notes" rows={5} className="mt-2 w-full resize-none rounded border border-white/10 bg-black/40 px-3 py-3 text-white outline-none" placeholder="What happened, what changed, what needs attention tomorrow?" /></label>
              <button type="submit" disabled={isPending} className="w-full rounded border border-sky-300/50 px-4 py-3 font-mono text-xs uppercase tracking-[0.2em] text-sky-100 disabled:cursor-not-allowed disabled:border-zinc-700 disabled:text-zinc-600">{isPending ? "Completing..." : "Complete Quest"}</button>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
