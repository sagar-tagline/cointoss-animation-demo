/** @type {import('next').NextConfig} */
const nextConfig = {
  // `next dev --turbopack` (npm run dev) and plain `next dev` build different
  // chunk formats. Sharing one .next folder makes them overwrite each other,
  // which shows up in the browser as "can't infer type of chunk from URL".
  // Give Turbopack its own folder so both can be used safely.
  distDir: process.env.TURBOPACK ? ".next-turbo" : ".next",
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
