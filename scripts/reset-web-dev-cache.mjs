import { rmSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";

const ports = [3000, 3001];
const targets = [
  "apps/web/.next",
  "apps/web/tsconfig.tsbuildinfo",
  "apps/web/test-results",
  "apps/web/playwright-report"
];

function runPowerShell(command) {
  return execFileSync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
  ).trim();
}

function stopPortOwners() {
  const portList = ports.join(",");
  const command = [
    "$ErrorActionPreference = 'SilentlyContinue'",
    `$ports = @(${portList})`,
    "$owners = Get-NetTCPConnection -LocalPort $ports -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique",
    "foreach ($owner in $owners) { if ($owner -and $owner -ne 0) { Stop-Process -Id $owner -Force -ErrorAction SilentlyContinue; Write-Output \"stopped process $owner\" } }",
    "exit 0"
  ].join("; ");

  try {
    const output = runPowerShell(command);
    if (output) {
      console.log(output);
    } else {
      console.log(`no dev server found on ports ${ports.join(", ")}`);
    }
  } catch (error) {
    console.warn(`could not stop dev ports: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function removeTargets() {
  for (const target of targets) {
    rmSync(resolve(target), {
      force: true,
      maxRetries: 8,
      recursive: true,
      retryDelay: 250
    });
    console.log(`removed ${target}`);
  }
}

stopPortOwners();
removeTargets();
console.log("web dev cache reset complete");
