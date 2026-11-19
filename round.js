// Round timing of the live Coin Toss game (build 2026-11-10-02-41-51).

// Server phases, in seconds. Measured from the roundStartBet / roundCloseBet
// socket messages of 13 live rounds (1 coin and 4 coins).
export const server = {
  // closeBetAt - startedBetAt. Always 18.000 s.
  betting: 18,
  // endAt - closedBetAt. Always 12.000 s.
  result: 12,
  // closedBetAt - closeBetAt. Server processing time, 0.05 to 1.91 s (median).
  closeDelay: 0.92,
  // Next round's startedBetAt - endAt. 0.23 to 2.61 s (median).
  nextRoundDelay: 1.82,
};

// Client delays, in milliseconds, copied from the game's
// ct_result_display_controller.
export const delays = {
  // StartedBet: "NEW ROUND" banner, then the coin flip / bowl shake.
  shake: 2500,
  // 4 coins: idle loop once the shake has played.
  idle: 5000,
  // ClosedBet: camera down to the bowl (4 coins).
  camDown: 500,
  // Then the reveal (hand lifts the bowl / opens over the coin).
  reveal: 2800,
  // Then the result voice and PostClosedBet.
  postClose: 3300,
  // PostClosedBet payout steps; the cover starts after the last one.
  payout: [700, 1000, 700, 1500, 1000],
  // After the cover starts: hide the hand, camera back up (4 coins).
  camUp: 800,
};
