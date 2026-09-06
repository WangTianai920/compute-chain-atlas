import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const output = "dist/pages";
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
cpSync("dist/client", output, { recursive: true });
cpSync("dist/server", join(output, "_worker"), {
  recursive: true,
  filter: (source) => !/(^|[/\\])(?:\.dev\.vars|\.env(?:\..*)?)$/.test(source),
});
writeFileSync(join(output, "_worker.js"), 'export { default } from "./_worker/index.js";\n');

const ignorePath = join(output, ".assetsignore");
const existingIgnore = readFileSync(ignorePath, "utf8").trimEnd();
writeFileSync(ignorePath, `${existingIgnore}\n_worker/**\n`);

// Vinext writes a Worker-oriented redirect during `build`. Pages needs the
// project-level config so production D1 and AI bindings are applied.
mkdirSync(".wrangler/deploy", { recursive: true });
writeFileSync(".wrangler/deploy/config.json", '{"configPath":"../../wrangler.toml","auxiliaryWorkers":[]}\n');
