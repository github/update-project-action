"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.run = exports.setupOctokit = exports.getInputs = exports.updateField = exports.valueGraphqlType = exports.ensureExists = exports.fetchProjectMetadata = exports.fetchContentMetadata = void 0;
const core_1 = require("@actions/core");
const github_1 = require("@actions/github");
let octokit;
/**
 * Fetch the metadata for the content item
 *
 * @param {string} contentId - The ID of the content to fetch
 * @param {string} fieldName - The name of the field to fetch
 * @param {number} projectNumber - The number of the project
 * @param {string} owner - The owner of the project
 * @returns {Promise<GraphQlQueryResponseData>} - The content metadata
 */
function fetchContentMetadata(contentId, fieldName, projectNumber, owner) {
    return __awaiter(this, void 0, void 0, function* () {
        const result = yield octokit.graphql(`
    query result($contentId: ID!, $fieldName: String!) {
      node(id: $contentId) {
        ... on Issue {
          id
          title
          projectItems(first: 100) {
            nodes {
              id
              project {
                number
                owner {
                  ... on Organization {
                    login
                  }
                  ... on User {
                    login
                  }
                }
              }
              field: fieldValueByName(name: $fieldName) {
                ... on ProjectV2ItemFieldSingleSelectValue {
                      value: name
                }
                ... on ProjectV2ItemFieldNumberValue {
                      value: number
                }
                ... on ProjectV2ItemFieldTextValue {
                      value: text
                }
                ... on ProjectV2ItemFieldDateValue {
                      value: date
                }
              }
            }
          }
        }
      }
    }
  `, { contentId, fieldName });
        const item = result.node.projectItems.nodes.find((node) => {
            return (node.project.number === projectNumber &&
                node.project.owner.login === owner);
        });
        const itemTitle = result.node.title;
        if (!ensureExists(item, "content", `ID ${contentId}`)) {
            return {};
        }
        else {
            return Object.assign(Object.assign({}, item), { title: itemTitle });
        }
    });
}
exports.fetchContentMetadata = fetchContentMetadata;
/**
 * Fetch the metadata for the project
 * @param {string} owner - The owner of the project
 * @param {number} projectNumber - The number of the project
 * @returns {Promise<GraphQlQueryResponseData>} - The project metadata
 */
function fetchProjectMetadata(owner, projectNumber, fieldName, value, operation) {
    var _a, _b;
    return __awaiter(this, void 0, void 0, function* () {
        const result = yield octokit.graphql(`
    query ($organization: String!, $projectNumber: Int!) {
      organization(login: $organization) {
        projectV2(number: $projectNumber) {
          id
          fields(first: 100) {
            nodes {
              ... on ProjectV2FieldCommon {
                id
                name
                dataType
              }
              ... on ProjectV2SingleSelectField {
                options {
                  id
                  name
                }
              }
            }
          }
        }
      }
    }
    `, { organization: owner, projectNumber });
        // Ensure project was found
        if (!ensureExists((_a = result.organization.projectV2) === null || _a === void 0 ? void 0 : _a.id, "project", `Number ${projectNumber}, Owner ${owner}`)) {
            return {};
        }
        const field = result.organization.projectV2.fields.nodes.find((f) => f.name === fieldName);
        // Ensure field was found
        if (!ensureExists(field, "Field", `Name ${fieldName}`)) {
            return {};
        }
        const option = (_b = field.options) === null || _b === void 0 ? void 0 : _b.find((o) => o.name === value);
        // Ensure option was found, if field is single select
        if (field.dataType === "single_select" && operation === "update") {
            if (!ensureExists(option, "Option", `Value ${value}`)) {
                return {};
            }
        }
        return {
            projectId: result.organization.projectV2.id,
            field: {
                fieldId: field.id,
                fieldType: field.dataType.toLowerCase(),
                optionId: option === null || option === void 0 ? void 0 : option.id,
            },
        };
    });
}
exports.fetchProjectMetadata = fetchProjectMetadata;
/**
 * Ensure a returned value exists
 *
 * @param {any} returnedValue - The value to check
 * @param {string} label - The label to use in the error message
 * @param {string} identifier - The identifier to use in the error message
 * @returns {bool} - True if the value exists, false otherwise
 */
function ensureExists(returnedValue, label, identifier) {
    if (returnedValue === undefined) {
        (0, core_1.setFailed)(`${label} not found with ${identifier}`);
        return false;
    }
    else {
        (0, core_1.info)(`Found ${label}: ${JSON.stringify(returnedValue)}`);
        return true;
    }
}
exports.ensureExists = ensureExists;
/**
 * Converts the field type to the GraphQL type
 * @param {string} fieldType - the field type returned from fetchProjectMetadata()
 * @returns {string} - the field type to use in the GraphQL query
 */
function valueGraphqlType(fieldType) {
    if (fieldType === "date") {
        return "Date";
    }
    else if (fieldType === "number") {
        return "Float";
    }
    else {
        return "String";
    }
}
exports.valueGraphqlType = valueGraphqlType;
/**
 * Updates the field value for the content item
 * @param {GraphQlQueryResponseData} projectMetadata - The project metadata returned from fetchProjectMetadata()
 * @param {GraphQlQueryResponseData} contentMetadata - The content metadata returned from fetchContentMetadata()
 * @return {Promise<GraphQlQueryResponseData>} - The updated content metadata
 */
function updateField(projectMetadata, contentMetadata, value) {
    return __awaiter(this, void 0, void 0, function* () {
        let valueType;
        let valueToSet;
        if (projectMetadata.field.fieldType === "single_select") {
            valueToSet = projectMetadata.field.optionId;
            valueType = "singleSelectOptionId";
        }
        else {
            valueToSet = value;
            valueType = projectMetadata.field.fieldType;
        }
        const result = yield octokit.graphql(`
    mutation($project: ID!, $item: ID!, $field: ID!, $value: ${valueGraphqlType(projectMetadata.field.fieldType)}) {
      updateProjectV2ItemFieldValue(
        input: {
          projectId: $project
          itemId: $item
          fieldId: $field
          value: {
            ${valueType}: $value
          }
        }
      ) {
        projectV2Item {
          id
        }
      }
    }
    `, {
            project: projectMetadata.projectId,
            item: contentMetadata.id,
            field: projectMetadata.field.fieldId,
            value: valueToSet,
        });
        return result;
    });
}
exports.updateField = updateField;
/**
 * Returns the validated and normalized inputs for the action
 *
 * @returns {object} - The inputs for the action
 */
function getInputs() {
    let operation = (0, core_1.getInput)("operation");
    if (operation === "")
        operation = "update";
    if (!["read", "update"].includes(operation)) {
        (0, core_1.setFailed)(`Invalid value passed for the 'operation' parameter (passed: ${operation}, allowed: read, update)`);
        return {};
    }
    const inputs = {
        contentId: (0, core_1.getInput)("content_id", { required: true }),
        fieldName: (0, core_1.getInput)("field", { required: true }),
        projectNumber: parseInt((0, core_1.getInput)("project_number", { required: true })),
        owner: (0, core_1.getInput)("organization", { required: true }),
        value: (0, core_1.getInput)("value", { required: operation === "update" }),
        operation,
    };
    (0, core_1.info)(`Inputs: ${JSON.stringify(inputs)}`);
    return inputs;
}
exports.getInputs = getInputs;
/**
 * Setups up a shared Octokit instance hydrated with Actions information
 *
 * @param options - Octokit options
 */
function setupOctokit(options) {
    const token = (0, core_1.getInput)("github_token", { required: true });
    octokit = (0, github_1.getOctokit)(token, options);
}
exports.setupOctokit = setupOctokit;
/**
 * The main event: Updates the selected field with the given value
 */
function run() {
    var _a, _b;
    return __awaiter(this, void 0, void 0, function* () {
        const inputs = getInputs();
        if (Object.entries(inputs).length === 0)
            return;
        const contentMetadata = yield fetchContentMetadata(inputs.contentId, inputs.fieldName, inputs.projectNumber, inputs.owner);
        if (Object.entries(contentMetadata).length === 0)
            return;
        const projectMetadata = yield fetchProjectMetadata(inputs.owner, inputs.projectNumber, inputs.fieldName, inputs.value, inputs.operation);
        if (Object.entries(projectMetadata).length === 0)
            return;
        (0, core_1.setOutput)("field_read_value", (_a = contentMetadata.field) === null || _a === void 0 ? void 0 : _a.value);
        if (inputs.operation === "update") {
            yield updateField(projectMetadata, contentMetadata, inputs.value);
            (0, core_1.setOutput)("field_updated_value", inputs.value);
            (0, core_1.info)(`Updated field ${inputs.fieldName} on ${contentMetadata.title} to ${inputs.value}`);
        }
        else {
            (0, core_1.setOutput)("field_updated_value", (_b = contentMetadata.field) === null || _b === void 0 ? void 0 : _b.value);
        }
    });
}
exports.run = run;
