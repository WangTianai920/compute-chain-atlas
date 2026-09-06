import vinext from "vinext";
import { defineConfig } from "vite";

const DEVELOPMENT_DATABASE_ID =
  "00000000-0000-4000-8000-000000000000";

const isLocalReview = process.env.COMPUTE_CHAIN_LOCAL_ONLY === "1";

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

const localBindingConfig = {
  main: "./worker/index.ts",
  // Pin to the newest date supported by the bundled local Workers runtime.
  compatibility_date: "2026-05-22",
  compatibility_flags: ["nodejs_compat"],
  assets: {
    binding: "ASSETS",
  },
  observability: {
    enabled: true,
  },
  ...(isLocalReview ? {} : {
    ai: { binding: "AI", remote: true },
    workflows: [
    {
      binding: "COMPANY_PROFILE_WORKFLOW",
      name: "company-profile-enrichment",
      class_name: "CompanyProfileWorkflow",
    },
    ],
  }),
  d1_databases: [
    {
      binding: "DB",
      database_name: "site-creator-d1",
      database_id: DEVELOPMENT_DATABASE_ID,
    },
  ],
};

export default defineConfig(async () => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    server: {
      strictPort: true,
      ...(isCodexSeatbeltSandbox
        ? { watch: { useFsEvents: false, usePolling: true } }
        : {}),
    },
    plugins: [
      vinext(),
      cloudflare({
        // Local review does not require the remote English-enrichment AI binding.
        remoteBindings: !isLocalReview,
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        config: localBindingConfig,
      }),
    ],
  };
});
