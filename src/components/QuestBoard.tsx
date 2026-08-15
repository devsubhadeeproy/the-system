"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { completeQuest } from "@/actions/gameActions";
import type { QuestType } from "@/models/Quest";
import type { PlayerAttribute } from "@/models/User";

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

type QuestBoardProps = {
  quests: QuestBoardQuest[];
};

const questGroups: Array<{ title: string; type: QuestType; accent: string }> = [
  { title: "Daily Routine", type: "DAILY", accent: "border-sky-400/50" },
  { title: "Main Arc", type: "MAIN", accent: "border-violet-400/50" },
  { title: "Side Contracts", type: "SIDE", accent: "border-emerald-400/50" },
  { title: "Urgent Raids", type: "URGENT", accent: "border-rose-400/50" },
];

function detailsForQuest(quest: QuestBoardQuest) {
  const title = quest.title.toLowerCase();
  const key = quest.dailyQuestKey ?? "";

  return {
    showExercises: key === "gym" || title.includes("gym"),
    showReading: key === "reading" || title.includes("reading"),
    showTopics:
      key === "gate-prep" ||
      key === "classes" ||
      title.includes("gate") ||
      title.includes("class"),
  };
}

function canComplete(quest: QuestBoardQuest): boolean {
  if (quest.isPermanentDaily) {
    return !quest.completedToday;
  }

  return !quest.completed;
}

export default function QuestBoard({ quests }: QuestBoardProps) {
  const router = useRouter();
  const [selectedQuest, setSelectedQuest] = useState<QuestBoardQuest | null>(
    null,
  );
  const [isPending, startTransition] = useTransition();

  const selectableAttributes = useMemo(
    () =>
      selectedQuest?.targetAttributes.filter(
        (attribute): attribute is PlayerAttribute => attribute !== "NONE",
      ) ?? [],
    [selectedQuest],
  );

  const selectedQuestDetails = selectedQuest
    ? detailsForQuest(selectedQuest)
    : null;

  function closeModal() {
    if (!isPending) {
      setSelectedQuest(null);
    }
  }

  function submitCompletion(formData: FormData) {
    if (!selectedQuest) {
      return;
    }

    startTransition(async () => {
      await completeQuest(selectedQuest.id, formData);
      setSelectedQuest(null);
      router.refresh();
    });
  }

  return (
    <>
      <section>
        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.24em] text-sky-300">
              Quest Board
            </p>
            <h2 className="mt-2 text-3xl font-semibold text-white">
              Active Missions
            </h2>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          {questGroups.map((group) => {
            const groupQuests = quests.filter(
              (quest) => quest.type === group.type,
            );

            return (
              <div
                key={group.type}
                className={`rounded-lg border ${group.accent} bg-zinc-950/70 p-5 backdrop-blur`}
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-semibold text-white">
                    {group.title}
                  </h3>
                  <span className="font-mono text-xs text-zinc-500">
                    {groupQuests.length} listed
                  </span>
                </div>

                <div className="mt-4 space-y-3">
                  {groupQuests.length === 0 ? (
                    <p className="rounded border border-white/10 bg-white/[0.03] p-4 text-sm text-zinc-500">
                      No open missions in this gate.
                    </p>
                  ) : (
                    groupQuests.map((quest) => (
                      <button
                        key={quest.id}
                        type="button"
                        onClick={() => setSelectedQuest(quest)}
                        className="block w-full rounded border border-white/10 bg-white/[0.03] p-4 text-left transition hover:border-sky-300/40 hover:bg-sky-400/[0.06]"
                      >
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <h4 className="font-semibold text-white">
                                {quest.title}
                              </h4>
                              {!canComplete(quest) ? (
                                <span className="rounded border border-emerald-300/30 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-emerald-200">
                                  Complete
                                </span>
                              ) : null}
                            </div>
                            <p className="mt-2 text-sm leading-6 text-zinc-400">
                              {quest.description}
                            </p>
                            <div className="mt-3 flex flex-wrap gap-2 font-mono text-[11px] uppercase tracking-[0.12em]">
                              <span className="rounded border border-sky-300/30 px-2 py-1 text-sky-200">
                                {quest.targetDisplay}
                              </span>
                              <span className="rounded border border-violet-300/30 px-2 py-1 text-violet-200">
                                {quest.targetAttributes.join(", ")}
                              </span>
                              <span className="rounded border border-amber-300/30 px-2 py-1 text-amber-200">
                                +{quest.xpReward} XP / +{quest.goldReward} G
                              </span>
                            </div>
                          </div>
                          <span className="rounded border border-white/10 px-3 py-2 font-mono text-xs uppercase tracking-[0.16em] text-zinc-300">
                            Track
                          </span>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {selectedQuest ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 py-6 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-sky-300/40 bg-zinc-950 p-5 shadow-[0_0_35px_rgba(56,189,248,0.28)]">
            <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.24em] text-sky-300">
                  Session Log
                </p>
                <h3 className="mt-2 text-2xl font-semibold text-white">
                  {selectedQuest.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-zinc-400">
                  {selectedQuest.description}
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="rounded border border-white/10 px-3 py-2 font-mono text-xs uppercase tracking-[0.16em] text-zinc-300 transition hover:border-zinc-300 hover:text-white"
              >
                Close
              </button>
            </div>

            <form action={submitCompletion} className="mt-5 space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded border border-sky-300/20 bg-sky-400/[0.04] p-3">
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-sky-200">
                    Target
                  </p>
                  <p className="mt-2 text-sm font-semibold text-white">
                    {selectedQuest.targetDisplay}
                  </p>
                </div>
                <div className="rounded border border-violet-300/20 bg-violet-400/[0.04] p-3">
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-violet-200">
                    Scaling
                  </p>
                  <p className="mt-2 text-sm font-semibold text-white">
                    {selectedQuest.scalingLabel}
                  </p>
                </div>
                <div className="rounded border border-amber-300/20 bg-amber-400/[0.04] p-3">
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-amber-200">
                    Reward
                  </p>
                  <p className="mt-2 text-sm font-semibold text-white">
                    +{selectedQuest.xpReward} XP / +{selectedQuest.goldReward} G
                  </p>
                </div>
              </div>

              {selectableAttributes.length > 1 ? (
                <fieldset className="rounded border border-violet-300/30 bg-violet-400/[0.04] p-4">
                  <legend className="px-2 font-mono text-xs uppercase tracking-[0.18em] text-violet-100">
                    Choose the attribute to allot your rewards to:
                  </legend>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {selectableAttributes.map((attribute, index) => (
                      <label
                        key={attribute}
                        className="flex cursor-pointer items-center gap-3 rounded border border-white/10 bg-black/30 px-3 py-3 text-sm text-zinc-200 transition has-[:checked]:border-violet-300/60 has-[:checked]:bg-violet-400/10"
                      >
                        <input
                          type="radio"
                          name="selectedAttribute"
                          value={attribute}
                          required
                          defaultChecked={index === 0}
                          className="h-4 w-4 accent-violet-300"
                        />
                        {attribute}
                      </label>
                    ))}
                  </div>
                </fieldset>
              ) : selectableAttributes.length === 1 ? (
                <input
                  type="hidden"
                  name="selectedAttribute"
                  value={selectableAttributes[0]}
                />
              ) : null}

              {selectedQuestDetails?.showExercises ? (
                <label className="block">
                  <span className="font-mono text-xs uppercase tracking-[0.18em] text-zinc-400">
                    Exercises, sets, reps, weight
                  </span>
                  <textarea
                    name="exercises"
                    rows={4}
                    className="mt-2 w-full resize-none rounded border border-white/10 bg-black/40 px-3 py-3 text-white outline-none transition placeholder:text-zinc-700 focus:border-sky-300/60"
                    placeholder="Squat 3x5 at 80kg, rows 4x8 at 45kg..."
                  />
                </label>
              ) : null}

              {selectedQuestDetails?.showReading ? (
                <div className="grid gap-4 sm:grid-cols-[1fr_160px]">
                  <label className="block">
                    <span className="font-mono text-xs uppercase tracking-[0.18em] text-zinc-400">
                      Book title
                    </span>
                    <input
                      name="bookTitle"
                      className="mt-2 w-full rounded border border-white/10 bg-black/40 px-3 py-3 text-white outline-none transition placeholder:text-zinc-700 focus:border-sky-300/60"
                      placeholder="Book or article"
                    />
                  </label>
                  <label className="block">
                    <span className="font-mono text-xs uppercase tracking-[0.18em] text-zinc-400">
                      Pages
                    </span>
                    <input
                      name="pagesRead"
                      type="number"
                      min={0}
                      className="mt-2 w-full rounded border border-white/10 bg-black/40 px-3 py-3 text-white outline-none transition focus:border-sky-300/60"
                    />
                  </label>
                </div>
              ) : null}

              {selectedQuestDetails?.showTopics ? (
                <label className="block">
                  <span className="font-mono text-xs uppercase tracking-[0.18em] text-zinc-400">
                    Concepts and topics studied
                  </span>
                  <textarea
                    name="topicsStudied"
                    rows={4}
                    className="mt-2 w-full resize-none rounded border border-white/10 bg-black/40 px-3 py-3 text-white outline-none transition placeholder:text-zinc-700 focus:border-sky-300/60"
                    placeholder="Signals and systems, compiler design, DBMS joins..."
                  />
                </label>
              ) : null}

              <label className="block">
                <span className="font-mono text-xs uppercase tracking-[0.18em] text-zinc-400">
                  Notes and reflections
                </span>
                <textarea
                  name="notes"
                  rows={5}
                  className="mt-2 w-full resize-none rounded border border-white/10 bg-black/40 px-3 py-3 text-white outline-none transition placeholder:text-zinc-700 focus:border-sky-300/60"
                  placeholder="What happened, what changed, what needs attention tomorrow?"
                />
              </label>

              <button
                type="submit"
                disabled={!canComplete(selectedQuest) || isPending}
                className="w-full rounded border border-sky-300/50 px-4 py-3 font-mono text-xs uppercase tracking-[0.2em] text-sky-100 shadow-[0_0_15px_rgba(56,189,248,0.22)] transition hover:border-sky-200 hover:bg-sky-400/10 disabled:cursor-not-allowed disabled:border-zinc-700 disabled:text-zinc-600"
              >
                {canComplete(selectedQuest)
                  ? isPending
                    ? "Completing..."
                    : "Complete Quest"
                  : "Already Complete"}
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
