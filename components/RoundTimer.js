"use client";

import { useEffect, useRef } from "react";
import { getCountdownTimer } from "@/components/roundClock";

// Port of the live game's round timer (round_timer_controller +
// bgl_timer_controller). Layout, colours, fonts, actions and the once-a-second
// update logic follow the game's code; positions are Cocos node positions
// (y points up) relative to the "Round Timer" node.

const COLORS = {
  betting: [0x10, 0xc7, 0x94],
  fiveSecond: [0xe6, 0x89, 0x00],
  threeSecond: [0xeb, 0x21, 0x7c],
  betLock: [0x2e, 0x52, 0x3d],
  shineGrey: [0xa0, 0xc1, 0xaf],
  shineWhite: [0xfa, 0xfa, 0xfa],
  label: [0xf0, 0xdc, 0x21],
  labelClosed: [0x32, 0xb5, 0x87],
};

const TEXT = {
  placeBet: "Place bet now",
  betLocked: "BET LOCKED!",
  nextRound: "Next Round",
};

const SPRITES = {
  base: { src: "/hud/round_timer_base.png", width: 259, height: 80, x: 0, y: 0 },
  shine: { src: "/hud/round_timer_shine.png", width: 256, height: 63, x: 1.516, y: 8.598 },
};

const ease = {
  linear: (t) => t,
  circOut: (t) => Math.sqrt(1 - (t - 1) * (t - 1)),
  circIn: (t) => 1 - Math.sqrt(1 - t * t),
};

const scaleTo = (dur, to, easing = "linear") => ({ kind: "scale", dur, to, easing });
const fadeTo = (dur, to) => ({ kind: "opacity", dur, to, easing: "linear" });
const tintTo = (dur, to) => ({ kind: "color", dur, to, easing: "linear" });
const delay = (dur) => ({ kind: "delay", dur });
const spawn = (...steps) => ({ kind: "spawn", steps });

function stepDuration(step) {
  if (step.kind === "spawn") return Math.max(...step.steps.map(stepDuration));
  return step.dur;
}

// A node with Cocos-like runAction / stopAllActions / getActionByTag.
function createNode(state) {
  return { ...state, actions: [] };
}

function runAction(node, steps, tag = -1) {
  node.actions.push({ steps, tag, index: 0, elapsed: 0, started: false, from: null });
}

function stopAllActions(node) {
  node.actions.length = 0;
}

function hasAction(node, tag) {
  return node.actions.some((action) => action.tag === tag);
}

function captureFrom(node, step) {
  if (step.kind === "spawn") return step.steps.map((child) => captureFrom(node, child));
  if (step.kind === "color") return node.color.slice();
  if (step.kind === "delay") return null;
  return node[step.kind];
}

function applyStep(node, step, from, t) {
  if (step.kind === "spawn") {
    const total = stepDuration(step);
    step.steps.forEach((child, i) => {
      const local = child.dur === 0 ? 1 : Math.min(1, (t * total) / child.dur);
      applyStep(node, child, from[i], local);
    });
    return;
  }
  if (step.kind === "delay") return;
  const k = ease[step.easing](t);
  if (step.kind === "color") {
    node.color = from.map((value, i) => Math.round(value + (step.to[i] - value) * k));
  } else {
    node[step.kind] = from + (step.to - from) * k;
  }
}

function advance(node, seconds) {
  for (const action of node.actions) {
    let left = seconds;
    while (action.index < action.steps.length) {
      const step = action.steps[action.index];
      if (!action.started) {
        action.from = captureFrom(node, step);
        action.started = true;
        action.elapsed = 0;
      }
      const duration = stepDuration(step);
      if (duration === 0) {
        applyStep(node, step, action.from, 1);
        action.index += 1;
        action.started = false;
        continue;
      }
      action.elapsed += left;
      left = 0;
      if (action.elapsed >= duration) {
        applyStep(node, step, action.from, 1);
        left = action.elapsed - duration;
        action.index += 1;
        action.started = false;
        continue;
      }
      applyStep(node, step, action.from, action.elapsed / duration);
      break;
    }
  }
  node.actions = node.actions.filter((action) => action.index < action.steps.length);
}

function rgb(color) {
  return `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
}

// Cocos sprite colour = texture multiplied by the node colour.
function drawTinted(canvas, image, color) {
  const ctx = canvas.getContext("2d");
  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = "source-over";
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = rgb(color);
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = "destination-in";
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  ctx.restore();
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load ${src}`));
    image.src = src;
  });
}

const placed = (x, y) => ({
  position: "absolute",
  left: x,
  top: -y,
  transform: "translate(-50%, -50%)",
});

export default function RoundTimer({ clock, x, y }) {
  const rootRef = useRef(null);
  const baseRef = useRef(null);
  const shineRef = useRef(null);
  const timerRef = useRef(null);
  const lockRef = useRef(null);
  const messageRef = useRef(null);

  useEffect(() => {
    if (!clock) return undefined;
    let alive = true;
    let frame = 0;
    const off = [];

    const root = createNode({ scale: 1, opacity: 0 });
    const base = createNode({ color: COLORS.betLock.slice() });
    const shine = createNode({ color: COLORS.shineGrey.slice() });
    const timer = createNode({ scale: 1, opacity: 255, color: COLORS.label.slice(), text: "" });
    const lock = createNode({ opacity: 0, text: TEXT.betLocked });
    const message = createNode({ opacity: 255, text: "" });

    // round_timer_controller fields.
    let countdownTimer = 0;
    let previousTimer = -1;
    let initialPlaceBetAnimationExecuted = true;
    let lastUpdate = 0;

    const round = () => clock.round;
    const isBetting = () => round() && round().state === "betting";
    const isClosedBet = () => round() && round().state === "closed_bet";
    const shownCountdown = () => (isBetting() ? countdownTimer - 1 : countdownTimer);
    const labelBaseColor = () =>
      countdownTimer <= 5 && isClosedBet() ? COLORS.labelClosed : COLORS.label;

    // ui_manager.bounce(node, 120, 1.1)
    const bounce = () => {
      const back = root.scale;
      runAction(root, [scaleTo(0.12, 1.1, "circOut"), scaleTo(0.12, back, "circIn")]);
    };

    const handleBetting = () => {
      const r = shownCountdown();
      if (previousTimer === -1) previousTimer = r;
      if (r > 0) {
        message.text = TEXT.placeBet;
        timer.text = String(r);
        timer.color = labelBaseColor().slice();
        if (!initialPlaceBetAnimationExecuted) {
          initialPlaceBetAnimationExecuted = true;
          runAction(timer, [scaleTo(0.1, 2), scaleTo(0.4, 1, "circOut")], 0);
          bounce();
          runAction(base, [tintTo(0.2, COLORS.betting)], 1);
          runAction(shine, [tintTo(0.2, COLORS.shineWhite)], 1);
          return;
        }
        if (!hasAction(base, 1)) {
          shine.color = COLORS.shineWhite.slice();
          if (r > 5) base.color = COLORS.betting.slice();
          else if (r < 5) base.color = COLORS.fiveSecond.slice();
        }
        if (r <= 5 && previousTimer !== r) {
          if (r === 5) {
            runAction(timer, [scaleTo(0, 2), scaleTo(0.4, 1, "circOut")], 0);
            bounce();
            runAction(base, [tintTo(0.2, COLORS.fiveSecond)]);
          } else {
            runAction(timer, [scaleTo(0.1, 2), scaleTo(0.4, 1, "circOut")], 0);
          }
          previousTimer = r;
        }
        if (!hasAction(timer, 0)) {
          timer.opacity = 255;
          timer.scale = 1;
          lock.opacity = 0;
        }
      } else if (previousTimer !== r) {
        if (r === 0) {
          base.color = COLORS.threeSecond.slice();
          message.text = "";
          timer.scale = 1;
          runAction(
            timer,
            [scaleTo(0, 2), spawn(scaleTo(0.4, 0, "circOut"), fadeTo(0.2, 0))],
            0
          );
          bounce();
          runAction(lock, [delay(0.2), fadeTo(0.1, 255)], 0);
        }
        previousTimer = r;
      }
    };

    const handleClosedBet = () => {
      const s = shownCountdown();
      if (s < 0) return;
      timer.text = String(s);
      if (s > 7 && base.color.join() !== COLORS.threeSecond.join()) {
        base.color = COLORS.threeSecond.slice();
        message.text = "";
        timer.scale = 1;
        runAction(
          timer,
          [scaleTo(0, 2), spawn(scaleTo(0.4, 0, "circOut"), fadeTo(0.2, 0))],
          0
        );
        bounce();
        runAction(lock, [delay(0.2), fadeTo(0.1, 255)], 0);
      }
      if (s <= 5) {
        timer.color = labelBaseColor().slice();
        if (!hasAction(base, 1)) {
          shine.color = COLORS.shineGrey.slice();
          base.color = COLORS.betLock.slice();
        }
      }
      if (s <= 6 && previousTimer !== s) {
        if (s === 6) {
          runAction(shine, [delay(0.5), tintTo(0.5, COLORS.shineGrey)], 1);
          stopAllActions(lock);
          stopAllActions(timer);
          runAction(base, [delay(0.5), tintTo(0.5, COLORS.betLock)], 1);
          runAction(lock, [delay(0.8), fadeTo(0.1, 0)]);
          message.text = TEXT.nextRound;
          message.opacity = 0;
          runAction(message, [delay(0.8), fadeTo(0.2, 255)]);
        } else if (s <= 5) {
          timer.opacity = 255;
          timer.scale = 1;
          lock.opacity = 0;
        }
        previousTimer = s;
      }
    };

    // ui_manager.isTimestampExpired(playCountdownFxTimestamp, 1000)
    const update = (now) => {
      if (!round() || now - lastUpdate <= 1000) return;
      lastUpdate = now;
      countdownTimer = getCountdownTimer(round(), now);
      if (isBetting()) handleBetting();
      else if (isClosedBet()) handleClosedBet();
    };

    off.push(
      clock.on("startedBet", () => {
        if (root.opacity === 0) {
          // resetVisual (ConstructScene) for a round that is just starting.
          root.opacity = 255;
          lock.opacity = 0;
          timer.scale = 1;
          timer.opacity = 255;
        }
        initialPlaceBetAnimationExecuted = false;
      })
    );

    let images = null;
    let drawnBase = "";
    let drawnShine = "";
    let previous = performance.now();

    const render = () => {
      const now = Date.now();
      const t = performance.now();
      const seconds = Math.min(0.1, (t - previous) / 1000);
      previous = t;
      update(now);
      for (const node of [root, base, shine, timer, lock, message]) advance(node, seconds);

      if (rootRef.current) {
        rootRef.current.style.opacity = String(root.opacity / 255);
        rootRef.current.style.transform = `scale(${root.scale})`;
      }
      if (images && baseRef.current && base.color.join() !== drawnBase) {
        drawTinted(baseRef.current, images.base, base.color);
        drawnBase = base.color.join();
      }
      if (images && shineRef.current && shine.color.join() !== drawnShine) {
        drawTinted(shineRef.current, images.shine, shine.color);
        drawnShine = shine.color.join();
      }
      if (timerRef.current) {
        const el = timerRef.current;
        if (el.textContent !== timer.text) el.textContent = timer.text;
        el.style.opacity = String(timer.opacity / 255);
        el.style.color = rgb(timer.color);
        el.style.transform = `translate(-50%, -50%) scale(${timer.scale})`;
      }
      if (lockRef.current) lockRef.current.style.opacity = String(lock.opacity / 255);
      if (messageRef.current) {
        const el = messageRef.current;
        if (el.textContent !== message.text) el.textContent = message.text;
        el.style.opacity = String(message.opacity / 255);
      }
      if (alive) frame = requestAnimationFrame(render);
    };

    Promise.all([loadImage(SPRITES.base.src), loadImage(SPRITES.shine.src)])
      .then(([baseImage, shineImage]) => {
        if (alive) images = { base: baseImage, shine: shineImage };
      })
      .catch(() => {});
    frame = requestAnimationFrame(render);

    return () => {
      alive = false;
      cancelAnimationFrame(frame);
      off.forEach((stop) => stop());
    };
  }, [clock]);

  const dpr = 2;
  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: 0,
        height: 0,
        opacity: 0,
        pointerEvents: "none",
      }}
      ref={rootRef}
    >
      <canvas
        ref={baseRef}
        width={SPRITES.base.width * dpr}
        height={SPRITES.base.height * dpr}
        style={{
          ...placed(SPRITES.base.x, SPRITES.base.y),
          width: SPRITES.base.width,
          height: SPRITES.base.height,
        }}
      />
      <canvas
        ref={shineRef}
        width={SPRITES.shine.width * dpr}
        height={SPRITES.shine.height * dpr}
        style={{
          ...placed(SPRITES.shine.x, SPRITES.shine.y),
          width: SPRITES.shine.width,
          height: SPRITES.shine.height,
        }}
      />
      <div
        ref={timerRef}
        style={{
          ...placed(0, 3.151),
          fontFamily: "MyriadPro-Bold, sans-serif",
          fontSize: 40,
          lineHeight: "40px",
          whiteSpace: "nowrap",
          textAlign: "center",
        }}
      />
      <div
        ref={lockRef}
        style={{
          ...placed(0, 12),
          width: 230,
          fontFamily: "NotoSans-Bold, sans-serif",
          fontSize: 18,
          lineHeight: "22px",
          color: "#fafafa",
          whiteSpace: "nowrap",
          textAlign: "center",
          opacity: 0,
        }}
      >
        {TEXT.betLocked}
      </div>
      <div
        ref={messageRef}
        style={{
          ...placed(0, 31),
          fontFamily: "MyriadPro-Bold, sans-serif",
          fontSize: 13,
          lineHeight: "40px",
          color: "#fffaef",
          whiteSpace: "nowrap",
          textAlign: "center",
        }}
      />
    </div>
  );
}
