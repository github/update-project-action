"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const core_1 = require("@actions/core");
const update_project_1 = require("./update-project");
try {
    (0, update_project_1.setupOctokit)();
    (0, update_project_1.run)();
}
catch (e) {
    if (e instanceof Error)
        (0, core_1.setFailed)(e.message);
}
