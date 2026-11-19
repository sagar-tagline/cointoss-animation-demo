/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    "pixi.js",
    "pixi-spine",
    "@pixi-spine/base",
    "@pixi-spine/loader-base",
    "@pixi-spine/loader-uni",
    "@pixi-spine/runtime-3.7",
    "@pixi-spine/runtime-3.8",
    "@pixi-spine/runtime-4.1",
  ],
};

export default nextConfig;
