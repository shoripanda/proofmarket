import { defineConfig, devices } from "@playwright/test";
import { FAKE_VIDEO } from "./e2e/global-setup";

// Runs against a DEV_MODE server (see e2e/README in 11-code-skeleton.md §4):
//   APP_ENV=local DEV_MODE=1 NEXT_PUBLIC_DEV_MODE=1 DATABASE_URL=pglite:.data/pglite ... next dev -p 3917
export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/global-setup.ts",
  // Keep test-results (it holds the fake camera file written by globalSetup).
  preserveOutput: "always",
  timeout: 90_000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3917",
    ...devices["Pixel 7"],
    geolocation: { latitude: 35.6595, longitude: 139.7005, accuracy: 10 },
    permissions: ["geolocation", "camera"],
    locale: "ja-JP",
    launchOptions: {
      args: [
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
        `--use-file-for-fake-video-capture=${FAKE_VIDEO}`,
      ],
    },
  },
});
