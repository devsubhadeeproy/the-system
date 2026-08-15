import Link from "next/link";
import { createQuest, createShopItem } from "@/actions/gameActions";
import connectMongoDB from "@/lib/mongodb";
import QuestModel, { QUEST_TARGET_ATTRIBUTES, QUEST_TYPES } from "@/models/Quest";
import ShopItemModel from "@/models/ShopItem";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type AdminStats = {
  activeQuests: number;
  completedQuests: number;
  shopItems: number;
};

async function getAdminStats(): Promise<AdminStats> {
  await connectMongoDB();

  const [activeQuests, completedQuests, shopItems] = await Promise.all([
    QuestModel.countDocuments({ completed: false }),
    QuestModel.countDocuments({ completed: true }),
    ShopItemModel.countDocuments(),
  ]);

  return {
    activeQuests,
    completedQuests,
    shopItems,
  };
}

export default async function AdminPage() {
  const stats = await getAdminStats();

  return (
    <main className="min-h-screen bg-[#09090b] text-zinc-100">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-5 py-8 sm:px-8 lg:px-10">
        <header className="flex flex-col gap-4 border-b border-violet-400/20 pb-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.32em] text-violet-300">
              Architect Console
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-normal text-white sm:text-5xl">
              Admin Dashboard
            </h1>
          </div>
          <Link
            href="/"
            className="w-fit rounded border border-sky-300/40 px-4 py-2 font-mono text-xs uppercase tracking-[0.2em] text-sky-100 shadow-[0_0_15px_rgba(56,189,248,0.24)] transition hover:border-sky-200 hover:bg-sky-400/10"
          >
            Player View
          </Link>
        </header>

        <section className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-sky-400/30 bg-zinc-950/80 p-5 shadow-[0_0_15px_rgba(56,189,248,0.2)]">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-sky-200">
              Active
            </p>
            <p className="mt-3 text-4xl font-semibold text-white">
              {stats.activeQuests}
            </p>
          </div>
          <div className="rounded-lg border border-violet-400/30 bg-zinc-950/80 p-5 shadow-[0_0_15px_rgba(192,132,252,0.18)]">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-violet-200">
              Completed
            </p>
            <p className="mt-3 text-4xl font-semibold text-white">
              {stats.completedQuests}
            </p>
          </div>
          <div className="rounded-lg border border-amber-300/30 bg-zinc-950/80 p-5">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-amber-200">
              Shop Items
            </p>
            <p className="mt-3 text-4xl font-semibold text-white">
              {stats.shopItems}
            </p>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <form
            action={createQuest}
            className="rounded-lg border border-sky-400/30 bg-zinc-950/80 p-5 shadow-[0_0_15px_rgba(56,189,248,0.18)] backdrop-blur"
          >
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.24em] text-sky-300">
                Mission Forge
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-white">
                Create Quest
              </h2>
            </div>

            <div className="mt-6 space-y-4">
              <label className="block">
                <span className="font-mono text-xs uppercase tracking-[0.18em] text-zinc-400">
                  Title
                </span>
                <input
                  name="title"
                  required
                  maxLength={120}
                  className="mt-2 w-full rounded border border-white/10 bg-black/40 px-3 py-3 text-white outline-none transition placeholder:text-zinc-700 focus:border-sky-300/60"
                  placeholder="Clear the morning dungeon"
                />
              </label>

              <label className="block">
                <span className="font-mono text-xs uppercase tracking-[0.18em] text-zinc-400">
                  Description
                </span>
                <textarea
                  name="description"
                  required
                  maxLength={1000}
                  rows={4}
                  className="mt-2 w-full resize-none rounded border border-white/10 bg-black/40 px-3 py-3 text-white outline-none transition placeholder:text-zinc-700 focus:border-sky-300/60"
                  placeholder="Define the exact challenge the player must complete."
                />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="font-mono text-xs uppercase tracking-[0.18em] text-zinc-400">
                    Type
                  </span>
                  <select
                    name="type"
                    defaultValue="DAILY"
                    className="mt-2 w-full rounded border border-white/10 bg-black/40 px-3 py-3 text-white outline-none transition focus:border-sky-300/60"
                  >
                    {QUEST_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="font-mono text-xs uppercase tracking-[0.18em] text-zinc-400">
                    Attribute
                  </span>
                  <select
                    name="targetAttribute"
                    defaultValue="NONE"
                    className="mt-2 w-full rounded border border-white/10 bg-black/40 px-3 py-3 text-white outline-none transition focus:border-sky-300/60"
                  >
                    {QUEST_TARGET_ATTRIBUTES.map((attribute) => (
                      <option key={attribute} value={attribute}>
                        {attribute}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="font-mono text-xs uppercase tracking-[0.18em] text-zinc-400">
                    XP Reward
                  </span>
                  <input
                    name="xpReward"
                    type="number"
                    min={0}
                    required
                    defaultValue={50}
                    className="mt-2 w-full rounded border border-white/10 bg-black/40 px-3 py-3 text-white outline-none transition focus:border-sky-300/60"
                  />
                </label>

                <label className="block">
                  <span className="font-mono text-xs uppercase tracking-[0.18em] text-zinc-400">
                    Gold Reward
                  </span>
                  <input
                    name="goldReward"
                    type="number"
                    min={0}
                    required
                    defaultValue={25}
                    className="mt-2 w-full rounded border border-white/10 bg-black/40 px-3 py-3 text-white outline-none transition focus:border-sky-300/60"
                  />
                </label>
              </div>
            </div>

            <button
              type="submit"
              className="mt-6 w-full rounded border border-sky-300/50 px-4 py-3 font-mono text-xs uppercase tracking-[0.2em] text-sky-100 shadow-[0_0_15px_rgba(56,189,248,0.22)] transition hover:border-sky-200 hover:bg-sky-400/10"
            >
              Create Quest
            </button>
          </form>

          <form
            action={createShopItem}
            className="rounded-lg border border-violet-400/30 bg-zinc-950/80 p-5 shadow-[0_0_15px_rgba(192,132,252,0.18)] backdrop-blur"
          >
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.24em] text-violet-300">
                Relic Registry
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-white">
                Add Shop Item
              </h2>
            </div>

            <div className="mt-6 space-y-4">
              <label className="block">
                <span className="font-mono text-xs uppercase tracking-[0.18em] text-zinc-400">
                  Title
                </span>
                <input
                  name="title"
                  required
                  maxLength={120}
                  className="mt-2 w-full rounded border border-white/10 bg-black/40 px-3 py-3 text-white outline-none transition placeholder:text-zinc-700 focus:border-violet-300/60"
                  placeholder="Recovery Crystal"
                />
              </label>

              <label className="block">
                <span className="font-mono text-xs uppercase tracking-[0.18em] text-zinc-400">
                  Description
                </span>
                <textarea
                  name="description"
                  required
                  maxLength={1000}
                  rows={4}
                  className="mt-2 w-full resize-none rounded border border-white/10 bg-black/40 px-3 py-3 text-white outline-none transition placeholder:text-zinc-700 focus:border-violet-300/60"
                  placeholder="A reward item the player can spend gold on."
                />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="font-mono text-xs uppercase tracking-[0.18em] text-zinc-400">
                    Cost
                  </span>
                  <input
                    name="cost"
                    type="number"
                    min={0}
                    required
                    defaultValue={100}
                    className="mt-2 w-full rounded border border-white/10 bg-black/40 px-3 py-3 text-white outline-none transition focus:border-violet-300/60"
                  />
                </label>

                <label className="block">
                  <span className="font-mono text-xs uppercase tracking-[0.18em] text-zinc-400">
                    Stock
                  </span>
                  <input
                    name="stock"
                    type="number"
                    min={0}
                    className="mt-2 w-full rounded border border-white/10 bg-black/40 px-3 py-3 text-white outline-none transition placeholder:text-zinc-700 focus:border-violet-300/60"
                    placeholder="Unlimited"
                  />
                </label>
              </div>
            </div>

            <button
              type="submit"
              className="mt-6 w-full rounded border border-violet-300/50 px-4 py-3 font-mono text-xs uppercase tracking-[0.2em] text-violet-100 shadow-[0_0_15px_rgba(192,132,252,0.22)] transition hover:border-violet-200 hover:bg-violet-400/10"
            >
              Add Item
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
