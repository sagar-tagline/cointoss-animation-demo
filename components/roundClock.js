// Stands in for the game server: runs rounds with the live timings and emits
// the same two events the game reacts to (StartedBet, ClosedBet).
export function createRoundClock(server) {
  const listeners = { startedBet: new Set(), closedBet: new Set() };
  let round = null;
  let timer = null;
  let stopped = false;

  const emit = (type) => {
    listeners[type].forEach((listener) => listener(round));
  };

  function startBet() {
    if (stopped) return;
    const now = Date.now();
    round = {
      state: "betting",
      startedBetAt: now,
      closeBetAt: now + server.betting * 1000,
      closedBetAt: null,
      endAt: null,
    };
    emit("startedBet");
    timer = setTimeout(closeBet, (server.betting + server.closeDelay) * 1000);
  }

  function closeBet() {
    if (stopped) return;
    const now = Date.now();
    round = {
      ...round,
      state: "closed_bet",
      closedBetAt: now,
      endAt: now + server.result * 1000,
    };
    emit("closedBet");
    timer = setTimeout(startBet, (server.result + server.nextRoundDelay) * 1000);
  }

  return {
    start() {
      if (!round) startBet();
    },
    stop() {
      stopped = true;
      clearTimeout(timer);
    },
    on(type, listener) {
      listeners[type].add(listener);
      return () => listeners[type].delete(listener);
    },
    get round() {
      return round;
    },
  };
}

// round.js getCountdownTimer in the game: whole seconds left until bets close
// (betting) or until the round ends (closed), rounded up.
export function getCountdownTimer(round, now = Date.now()) {
  if (!round) return 0;
  const end = round.state === "betting" ? round.closeBetAt : round.endAt;
  if (!end) return 0;
  return Math.ceil((end - now) / 1000);
}
