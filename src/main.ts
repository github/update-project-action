import "dotenv/config";
import { setFailed } from "@actions/core";
import { run, setupOctokit } from "./update-project";

try {
  setupOctokit();
  run();
} catch (e) {
  if (e instanceof Error) setFailed(e.message);
}
