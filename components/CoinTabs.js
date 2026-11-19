"use client";

import { useRouter, useSearchParams } from "next/navigation";
import BowlAnim from "@/components/BowlAnim";
import { result, results } from "@/result";

const TABS = [
  { mode: 1, label: "1 coin" },
  { mode: 4, label: "4 coins" },
];

export default function CoinTabs() {
  const params = useSearchParams();
  const router = useRouter();
  const mode = Number(params.get("mode")) === 4 ? 4 : 1;

  function select(next) {
    if (next === mode) return;
    const query = new URLSearchParams(params.toString());
    query.set("mode", String(next));
    router.replace(`/?${query.toString()}`, { scroll: false });
  }

  return (
    <main className="flex min-h-screen flex-col items-center gap-6 bg-[#120c08] px-4 py-8">
      <div className="flex gap-2" role="tablist" aria-label="Coin animation">
        {TABS.map((tab) => {
          const selected = mode === tab.mode;
          return (
            <button
              key={tab.mode}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => select(tab.mode)}
              className={
                selected
                  ? "rounded-full bg-amber-100 px-5 py-2 text-sm text-[#120c08]"
                  : "rounded-full bg-white/10 px-5 py-2 text-sm text-amber-100/80"
              }
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      <BowlAnim key={mode} mode={mode} result={mode === 1 ? result : results} />
    </main>
  );
}
