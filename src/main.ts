import "dotenv/config";
import { setFailed } from "@actions/core";
import { run } from "./update-project";

try {
  run();
} catch (e) {
  if (e instanceof Error) setFailed(e.message);
}
