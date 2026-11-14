// Usage: node scripts/set-version.mjs 0.2.0
// Writes the version into package.json, tauri.conf.json and Cargo.toml.
import { readFileSync, writeFileSync } from "node:fs";

const version = process.argv[2]?.replace(/^v/, "");
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error("Usage: node scripts/set-version.mjs <major.minor.patch>");
  process.exit(1);
}

const editJson = (path) => {
  const data = JSON.parse(readFileSync(path, "utf8"));
  data.version = version;
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
};
editJson("package.json");
editJson("src-tauri/tauri.conf.json");

const cargo = "src-tauri/Cargo.toml";
writeFileSync(cargo, readFileSync(cargo, "utf8").replace(/^version = ".*"$/m, `version = "${version}"`));
console.log(`Version set to ${version}`);
