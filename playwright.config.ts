import { defineConfig } from "@playwright/test";

const baseURL = "http://127.0.0.1:1421";

export default defineConfig({
    testDir: "./tests/ui",
    testMatch: "**/*.ui.ts",
    fullyParallel: true,
    outputDir: "test-results/ui",
    use: { baseURL, trace: "retain-on-failure" },
    webServer: {
        command: "bun run dev --host 127.0.0.1 --port 1421",
        url: baseURL,
        reuseExistingServer: false,
    },
});
