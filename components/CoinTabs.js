"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import BowlAnim, { VIEW_HEIGHT, VIEW_WIDTH } from "@/components/BowlAnim";
import NewRoundBanner from "@/components/NewRoundBanner";
import RoundTimer from "@/components/RoundTimer";
import { createRoundClock } from "@/components/roundClock";
import { result, results } from "@/result";
import { server } from "@/round";

const TABS = [
  { mode: 1, label: "1 coin" },
  { mode: 4, label: "4 coins" },
];

// Positions in the game's 720 px wide portrait design, measured from the top:
// the Round Timer node sits at y = 230 above centre (640 - 230 = 410), and the
// NEW ROUND coin is centred about 494 px down.
const TIMER = { x: 360, y: 410 };
const BANNER = { x: 360, y: 494 };
const STAGE_HEIGHT = 470;

function useStageScale(ref) {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const measure = () => setScale(element.clientWidth / VIEW_WIDTH || 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return scale;
}

function CoinStage({ mode }) {
  const wrapRef = useRef(null);
  const scale = useStageScale(wrapRef);
  const [clock, setClock] = useState(null);

  useEffect(() => {
    const next = createRoundClock(server);
    setClock(next);
    return () => next.stop();
  }, []);

  return (
    <div
      ref={wrapRef}
      className="w-full max-w-[720px]"
      style={{ height: STAGE_HEIGHT * scale }}
    >
      <div
        className="relative"
        style={{
          width: VIEW_WIDTH,
          height: STAGE_HEIGHT,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
        <div
          className="absolute left-0 top-0 overflow-hidden bg-[#1a3d32]"
          style={{ width: VIEW_WIDTH, height: VIEW_HEIGHT }}
        >
          <BowlAnim
            mode={mode}
            result={mode === 1 ? result : results}
            clock={clock}
            onReady={() => clock && clock.start()}
          />
        </div>
        <RoundTimer clock={clock} x={TIMER.x} y={TIMER.y} />
        <NewRoundBanner clock={clock} x={BANNER.x} y={BANNER.y} />
      </div>
    </div>
  );
}

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
      <CoinStage key={mode} mode={mode} />
    </main>
  );
}
