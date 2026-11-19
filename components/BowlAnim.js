"use client";

import { useEffect, useRef, useState } from "react";
import { delays } from "@/round";
import { layout as fixedLayout } from "@/result";

// Framing of the live game (720x1280 portrait design). The coin animation is
// the top strip of the screen: the skeleton node sits at the top edge, 400 px
// left of centre, scale 1.15. For 1 coin a 720x344 Mask clips it; for 4 coins
// the bet table covers everything below the same 344 px.
export const VIEW_WIDTH = 720;
export const VIEW_HEIGHT = 344;
const NODE = { x: -400, y: 0, scale: 1.15 };

// 1 coin: cc.Animation clip "zoomIn1Coin" on that node (0.5 s, linear).
// Played forward on the spine event "zoom in" of reveal_1coin, and in reverse
// when cover_1coin starts (ct_base_ske_1coin).
const ZOOMED = { x: -695.6521739, y: 80, scale: 2 };
const ZOOM_SECONDS = 0.5;

const LAYOUTS = 5;

function restPose(spine) {
  spine.state.clearTracks();
  spine.skeleton.setToSetupPose();
  spine.skeleton.updateWorldTransform();
  spine.update(0);
}

// ui_manager.playSpineAnimation in the game: no mixing, no pose reset.
function play(spine, name, loop = false) {
  spine.state.setAnimation(0, name, loop);
}

// Cocos y points up and the node is placed relative to the strip's top centre.
function placeNode(root, node) {
  root.position.set(VIEW_WIDTH / 2 + node.x, -node.y);
  root.scale.set(node.scale);
}

function lerp(from, to, t) {
  return from + (to - from) * t;
}

function pickLayout() {
  if (Number.isInteger(fixedLayout) && fixedLayout >= 1 && fixedLayout <= LAYOUTS) {
    return fixedLayout;
  }
  // Server value n is random; the game plays result_(1 + n % 5).
  return 1 + Math.floor(Math.random() * LAYOUTS);
}

function giveIsInteractive(object) {
  let proto = object;
  while (proto && proto !== Object.prototype) {
    if (typeof proto.isInteractive === "function") return;
    proto = Object.getPrototypeOf(proto);
  }
  const owner = Object.getPrototypeOf(object);
  if (!owner || typeof owner.isInteractive === "function") return;
  owner.isInteractive = function isInteractive() {
    return this.eventMode === "static" || this.eventMode === "dynamic";
  };
}

function giveTree(object) {
  if (!object) return;
  giveIsInteractive(object);
  const children = object.children;
  if (!children) return;
  for (let i = 0; i < children.length; i += 1) giveTree(children[i]);
}

function silencePointerEvents(app) {
  const events = app.renderer && app.renderer.events;
  if (!events) return;
  events.features.move = false;
  events.features.globalMove = false;
  events.features.click = false;
  events.features.wheel = false;
  if (typeof events.removeEvents === "function") events.removeEvents();
}

async function loadSpine() {
  const PIXI = await import("pixi.js");
  const base = await import("@pixi-spine/base");
  const { TextureAtlas } = base;
  const spine37 = await import("@pixi-spine/runtime-3.7");

  const [atlasText, skeletonJson] = await Promise.all([
    fetch("/spine/cointoss_anim.atlas").then((response) => response.text()),
    fetch("/spine/cointoss_anim.json").then((response) => response.json()),
  ]);

  const baseTexture = PIXI.BaseTexture.from("/spine/cointoss_anim.png", {
    scaleMode: PIXI.SCALE_MODES.LINEAR,
  });
  await whenReady(baseTexture);

  const atlas = await new Promise((resolve, reject) => {
    try {
      new TextureAtlas(
        atlasText,
        (_page, done) => done(baseTexture),
        (loaded) => {
          if (!loaded) reject(new Error("Atlas failed to load"));
          else resolve(loaded);
        }
      );
    } catch (error) {
      reject(error);
    }
  });

  const parser = new spine37.SkeletonJson(
    new spine37.AtlasAttachmentLoader(atlas)
  );
  const spineData = parser.readSkeletonData(skeletonJson);
  return { PIXI, spine37, spineData };
}

const ONE_COIN_SLOTS = ["red_result6"];
const FOUR_COIN_SLOTS = ["red_result", "red_result2", "red_result3", "red_result4"];

function faceName(value) {
  return String(value || "").toLowerCase().startsWith("t") ? "tail" : "head";
}

function paintCoins(spine, faces, textures) {
  const slots = faces.length === 1 ? ONE_COIN_SLOTS : FOUR_COIN_SLOTS;
  for (let i = 0; i < slots.length; i += 1) {
    const index = spine.skeleton.findSlotIndex(slots[i]);
    if (index < 0) continue;
    const slot = spine.skeleton.slots[index];
    if (!slot.getAttachment()) continue;
    const texture = faceName(faces[i]) === "tail" ? textures.tail : textures.head;
    spine.hackTextureBySlotName(slots[i], texture);
  }
}

function followUpdate(spine, paint) {
  const update = spine.update.bind(spine);
  spine.update = (dt) => {
    update(dt);
    paint(spine);
  };
}

function whenReady(texture) {
  const baseTexture = texture.baseTexture || texture;
  if (baseTexture.valid) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const finish = () => {
      baseTexture.off("loaded", finish);
      baseTexture.off("error", fail);
      resolve();
    };
    const fail = (error) => {
      baseTexture.off("loaded", finish);
      baseTexture.off("error", fail);
      reject(error || new Error("Texture failed to load"));
    };
    baseTexture.once("loaded", finish);
    baseTexture.once("error", fail);
    if (baseTexture.valid) finish();
  });
}

export default function BowlAnim({ mode, result, clock, onReady }) {
  const hostRef = useRef(null);
  const [error, setError] = useState("");
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !clock) return undefined;
    let alive = true;
    let app = null;
    const timeouts = new Set();
    const unsubscribe = [];

    // wait_and_excute in the game: plain setTimeout chains.
    const later = (ms, fn) => {
      const id = setTimeout(() => {
        timeouts.delete(id);
        if (alive) fn();
      }, ms);
      timeouts.add(id);
    };

    (async () => {
      try {
        const { PIXI, spine37, spineData } = await loadSpine();
        if (!alive) return;
        const textures = {
          head: PIXI.Texture.from("/coins/head.png?v=2"),
          tail: PIXI.Texture.from("/coins/tail.png?v=2"),
        };
        await Promise.all([whenReady(textures.head), whenReady(textures.tail)]);
        if (!alive) return;
        const faces = Array.isArray(result) ? result : [result];
        const paint = (spine) => paintCoins(spine, faces, textures);

        app = new PIXI.Application({
          width: VIEW_WIDTH,
          height: VIEW_HEIGHT,
          backgroundAlpha: 0,
          antialias: true,
          resolution: Math.min(window.devicePixelRatio || 1, 2),
          autoDensity: true,
          eventMode: "none",
          eventFeatures: {
            move: false,
            globalMove: false,
            click: false,
            wheel: false,
          },
        });
        host.appendChild(app.view);
        app.view.style.width = "100%";
        app.view.style.height = "100%";
        app.view.style.display = "block";
        app.view.style.pointerEvents = "none";
        silencePointerEvents(app);
        app.stage.eventMode = "none";
        app.stage.interactiveChildren = false;

        // The Cocos node (ct_anim / xocdia_anim). Both skeletons share it.
        const root = new PIXI.Container();
        root.eventMode = "none";
        root.interactiveChildren = false;
        app.stage.addChild(root);
        placeNode(root, NODE);

        const body = new spine37.Spine(spineData);
        root.addChild(body);

        // 4 coins: second skeleton for the hand that lifts and puts back the
        // bowl lid (xocdia_coveranim). Hidden until the reveal.
        let hand = null;
        if (mode === 4) {
          hand = new spine37.Spine(spineData);
          hand.visible = false;
          root.addChild(hand);
        }

        for (const spine of [body, hand]) {
          if (!spine) continue;
          spine.eventMode = "none";
          spine.interactiveChildren = false;
          spine.autoUpdate = false;
        }

        // Room entry: setup pose, then the idle loop.
        restPose(body);
        if (hand) restPose(hand);
        play(body, mode === 4 ? "idle" : "idle_1coin", true);

        // 1 coin zoom.
        const zoom = { from: 0, to: 0, elapsed: ZOOM_SECONDS };
        const startZoom = (forward) => {
          zoom.from = forward ? 0 : 1;
          zoom.to = forward ? 1 : 0;
          zoom.elapsed = 0;
        };
        if (mode === 1) {
          body.state.addListener({
            event: (entry, event) => {
              if (
                entry.animation &&
                entry.animation.name === "reveal_1coin" &&
                event.data.name === "zoom in"
              ) {
                startZoom(true);
              }
            },
            start: (entry) => {
              if (entry.animation && entry.animation.name === "cover_1coin") {
                startZoom(false);
              }
            },
          });
          app.ticker.add(() => {
            if (zoom.elapsed >= ZOOM_SECONDS) return;
            zoom.elapsed = Math.min(
              ZOOM_SECONDS,
              zoom.elapsed + app.ticker.deltaMS / 1000
            );
            const t = lerp(zoom.from, zoom.to, zoom.elapsed / ZOOM_SECONDS);
            placeNode(root, {
              x: lerp(NODE.x, ZOOMED.x, t),
              y: lerp(NODE.y, ZOOMED.y, t),
              scale: lerp(NODE.scale, ZOOMED.scale, t),
            });
          });
        }

        followUpdate(body, paint);
        if (hand) followUpdate(hand, paint);
        body.update(0);
        body.autoUpdate = true;
        if (hand) hand.autoUpdate = true;
        giveTree(app.stage);
        silencePointerEvents(app);

        // ct_result_display_controller, step for step.
        let animatingNewRound = false;
        const animateNewRound = () => {
          if (animatingNewRound) return;
          animatingNewRound = true;
          later(delays.shake, () => {
            play(body, mode === 4 ? "shaking" : "shaking_1coin");
            later(delays.idle, () => {
              if (mode === 4) play(body, "idle", true);
              animatingNewRound = false;
            });
          });
        };

        const animatePostClosedBet = () => {
          const payout = delays.payout.reduce((sum, ms) => sum + ms, 0);
          later(payout, () => {
            if (mode === 4) play(hand, "cover");
            else play(body, "cover_1coin");
            later(delays.camUp, () => {
              if (hand) hand.visible = false;
              if (mode === 4) play(body, "camup");
            });
          });
        };

        const animateCloseBet = () => {
          later(delays.camDown, () => {
            if (mode === 4) play(body, "camDown");
            later(delays.reveal, () => {
              if (mode === 4) {
                play(body, `result_${pickLayout()}`);
                hand.visible = true;
                play(hand, "reveal");
              } else {
                play(body, "reveal_1coin");
              }
              later(delays.postClose, animatePostClosedBet);
            });
          });
        };

        unsubscribe.push(clock.on("startedBet", animateNewRound));
        unsubscribe.push(clock.on("closedBet", animateCloseBet));
        if (onReadyRef.current) onReadyRef.current();
      } catch (err) {
        if (alive) setError(err && err.message ? err.message : String(err));
      }
    })();

    return () => {
      alive = false;
      timeouts.forEach((id) => clearTimeout(id));
      timeouts.clear();
      unsubscribe.forEach((off) => off());
      if (app) {
        app.destroy(true, { children: true, texture: false, baseTexture: false });
        app = null;
      }
    };
  }, [mode, result, clock]);

  return (
    <div className="relative h-full w-full">
      <div ref={hostRef} className="h-full w-full" />
      {error ? (
        <p className="absolute inset-x-0 top-2 text-center text-sm text-red-300">
          {error}
        </p>
      ) : null}
    </div>
  );
}
