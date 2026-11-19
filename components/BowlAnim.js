"use client";

import { useEffect, useRef, useState } from "react";

const WIDTH = 828;
const HEIGHT = 420;

function restPose(spine) {
  spine.state.clearTracks();
  spine.skeleton.setToSetupPose();
  spine.skeleton.updateWorldTransform();
  spine.update(0);
}

// Shaking does not key the bowl, plate, or camera hand. Those stay wherever the
// previous clip left them. The loop always enters shaking from the end of camup,
// so the first play has to be seeded with that same pose or the bowl sits on the
// bind position until camDown snaps it into place.
function seedPose(spine, name, mixBlend, mixDirection) {
  const animation = spine.skeleton.data.findAnimation(name);
  if (!animation) return;
  spine.skeleton.setToSetupPose();
  animation.apply(spine.skeleton, 0, animation.duration, false, [], 1, mixBlend, mixDirection);
  spine.skeleton.updateWorldTransform();
}

function playOnce(spine, name) {
  return new Promise((resolve) => {
    spine.state.clearListeners();
    const entry = spine.state.setAnimation(0, name, false);
    if (!entry) {
      resolve();
      return;
    }
    spine.state.addListener({
      complete: (track) => {
        if (track.animation && track.animation.name === name) resolve();
      },
    });
  });
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
  return { PIXI, spine37, spineData, base };
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

export default function BowlAnim({ mode, result }) {
  const hostRef = useRef(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    let alive = true;
    let app = null;

    (async () => {
      try {
        const { PIXI, spine37, spineData, base } = await loadSpine();
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
          width: WIDTH,
          height: HEIGHT,
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
        app.view.style.height = "auto";
        app.view.style.display = "block";
        app.view.style.pointerEvents = "none";
        silencePointerEvents(app);
        app.stage.eventMode = "none";
        app.stage.interactiveChildren = false;

        const root = new PIXI.Container();
        root.eventMode = "none";
        root.interactiveChildren = false;
        app.stage.addChild(root);

        const body = new spine37.Spine(spineData);
        root.addChild(body);

        let hand = null;
        if (mode === 4) {
          hand = new spine37.Spine(spineData);
          hand.visible = false;
          root.addChild(hand);
        }

        body.eventMode = "none";
        body.interactiveChildren = false;
        if (hand) {
          hand.eventMode = "none";
          hand.interactiveChildren = false;
        }
        body.autoUpdate = false;
        if (hand) hand.autoUpdate = false;
        body.scale.set(1.15);
        if (hand) hand.scale.set(1.15);
        app.view.style.visibility = "hidden";

        restPose(body);
        const bounds = body.getBounds();
        const scale = Math.min(
          (WIDTH - 16) / bounds.width,
          (HEIGHT - 16) / bounds.height
        );
        root.scale.set(scale);
        root.x = WIDTH / 2 - (bounds.x + bounds.width / 2) * scale;
        root.y = HEIGHT / 2 - (bounds.y + bounds.height / 2) * scale;

        if (mode === 4) seedPose(body, "camup", base.MixBlend.setup, base.MixDirection.mixIn);
        if (hand) restPose(hand);
        body.state.setAnimation(0, mode === 4 ? "shaking" : "shaking_1coin", false);
        followUpdate(body, paint);
        if (hand) followUpdate(hand, paint);
        body.update(0);
        body.autoUpdate = true;
        if (hand) hand.autoUpdate = true;
        giveTree(app.stage);
        silencePointerEvents(app);
        app.view.style.visibility = "visible";

        while (alive) {
          if (mode === 4) {
            await playOnce(body, "shaking");
            if (!alive) return;
            await playOnce(body, "camDown");
            if (!alive) return;
            hand.visible = true;
            restPose(hand);
            const reveal = playOnce(hand, "reveal");
            await Promise.all([playOnce(body, "result_1"), reveal]);
            if (!alive) return;
            await playOnce(hand, "cover");
            hand.visible = false;
            if (!alive) return;
            await playOnce(body, "camup");
          } else {
            await playOnce(body, "shaking_1coin");
            if (!alive) return;
            await playOnce(body, "reveal_1coin");
            if (!alive) return;
            await playOnce(body, "cover_1coin");
          }
        }
      } catch (err) {
        if (alive) setError(err && err.message ? err.message : String(err));
      }
    })();

    return () => {
      alive = false;
      if (app) {
        app.destroy(true, { children: true, texture: false, baseTexture: false });
        app = null;
      }
    };
  }, [mode, result]);

  return (
    <section className="w-full max-w-[828px]">
      <p className="mb-2 text-center text-sm tracking-wide text-amber-100/80">
        {mode === 1 ? "1 coin" : "4 coins"}
      </p>
      <div ref={hostRef} className="overflow-hidden rounded-xl bg-[#1a3d32]" />
      {error ? (
        <p className="mt-2 text-center text-sm text-red-300">{error}</p>
      ) : null}
    </section>
  );
}
