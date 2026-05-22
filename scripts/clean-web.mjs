import { rmSync } from "node:fs";
import { resolve } from "node:path";

const targets = [
  "apps/web/.next",
  "apps/web/tsconfig.tsbuildinfo"
];

for (const target of targets) {
  rmSync(resolve(target), { force: true, recursive: true });
  console.log(`removed ${target}`);
}
