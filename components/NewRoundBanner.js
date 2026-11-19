"use client";

import { useEffect, useState } from "react";
import { delays } from "@/round";

// The game plays the CT_NewRound spine ("new_round", 4.0 s at timeScale 1.75)
// on StartedBet and hides it when the shake starts (2.5 s). That spine is not
// in the local files, so this is a stand-in with the same timing and place:
// the coin turns in from its M side, holds, then rolls off to the right.
const DURATION_MS = (4.0 / 1.75) * 1000;

export default function NewRoundBanner({ clock, x, y }) {
  const [round, setRound] = useState(0);

  useEffect(() => {
    if (!clock) return undefined;
    let timer = null;
    const off = clock.on("startedBet", () => {
      setRound((value) => value + 1);
      clearTimeout(timer);
      timer = setTimeout(() => setRound(0), delays.shake);
    });
    return () => {
      off();
      clearTimeout(timer);
    };
  }, [clock]);

  if (!round) return null;

  const face = {
    position: "absolute",
    inset: 0,
    borderRadius: "50%",
    backfaceVisibility: "hidden",
    WebkitBackfaceVisibility: "hidden",
  };

  return (
    <div
      aria-hidden="true"
      style={{ position: "absolute", left: x, top: y, perspective: 900, pointerEvents: "none" }}
    >
      <div
        key={round}
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: 240,
          height: 240,
          transformStyle: "preserve-3d",
          animation: `new-round-coin ${DURATION_MS}ms linear forwards`,
        }}
      >
        <div
          style={{
            ...face,
            background:
              "radial-gradient(circle at 50% 38%, #ffe08a 0%, #f2a91c 48%, #c66a06 78%, #8a3f02 100%)",
            boxShadow: "inset 0 0 0 10px #f7c54a, inset 0 0 0 16px #b85d05, 0 6px 18px rgba(0,0,0,0.45)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "MyriadPro-Bold, sans-serif",
            fontSize: 46,
            lineHeight: "44px",
            color: "#ffe9a8",
            textShadow: "0 3px 0 #7a3300, 0 0 2px #5a2400, 2px 2px 0 #5a2400, -2px -2px 0 #5a2400",
            letterSpacing: 1,
          }}
        >
          <span>NEW</span>
          <span>ROUND</span>
        </div>
        <div
          style={{
            ...face,
            transform: "rotateY(180deg)",
            backgroundImage: "url(/coins/head.png?v=2)",
            backgroundSize: "cover",
          }}
        />
      </div>
    </div>
  );
}
