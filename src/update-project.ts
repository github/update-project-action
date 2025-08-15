import { getInput, setFailed, info, setOutput } from "@actions/core";
import { getOctokit } from "@actions/github";
import type { GraphQlQueryResponseData } from "@octokit/graphql";

let octokit: ReturnType<typeof getOctokit>;

/**
 * Fetch the metadata for the content item
 *
 * @param {string} contentId - The ID of the content to fetch
 * @param {string} fieldName - The name of the field to fetch
 * @param {number} projectNumber - The number of the project
 * @param {string} owner - The owner of the project
 * @returns {Promise<GraphQlQueryResponseData>} - The content metadata
 */
export async function fetchContentMetadata(
  contentId: string,
  fieldName: string,
  projectNumber: number,
  owner: string
): Promise<GraphQlQueryResponseData> {
  const result: GraphQlQueryResponseData = await octokit.graphql(
    `
    fragment ProjectItemFields on ProjectV2Item {
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
    
    query result($contentId: ID!, $fieldName: String!) {
      node(id: $contentId) {
        ... on Issue {
          id
          title
          projectItems(first: 100) {
            nodes {
              ...ProjectItemFields
            }
          }
        }
        ... on PullRequest {
          id
          title
          projectItems(first: 100) {
            nodes {
              ...ProjectItemFields
            }
          }
        }
      }
    }
  `,
    { contentId, fieldName }
  );

  const item = result.node.projectItems.nodes.find(
    (node: GraphQlQueryResponseData) => {
      return (
        node.project.number === projectNumber &&
        node.project.owner.login === owner
      );
    }
  );
  const itemTitle = result.node.title;

  if (!item) {
    // Check if the node exists but is not in the project
    if (result.node && result.node.id) {
      info(
        `Issue/PR ${contentId} exists but is not in project ${projectNumber} for ${owner}`
      );
      return {
        notInProject: true,
        nodeId: result.node.id,
        title: itemTitle,
      };
    } else {
      setFailed(`Item not found with ID ${contentId}`);
      return {};
    }
  } else {
    return { ...item, title: itemTitle };
  }
}

/**
 * Fetch the metadata for the project
 * @param {string} owner - The owner of the project
 * @param {number} projectNumber - The number of the project
 * @returns {Promise<GraphQlQueryResponseData>} - The project metadata
 */
export async function fetchProjectMetadata(
  owner: string,
  projectNumber: number,
  fieldName: string,
  value: string,
  operation: string
): Promise<GraphQlQueryResponseData> {
  const result: GraphQlQueryResponseData = await octokit.graphql(
    `
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
    `,
    { organization: owner, projectNumber }
  );

  // Ensure project was found
  if (
    !ensureExists(
      result.organization.projectV2?.id,
      "project",
      `Number ${projectNumber}, Owner ${owner}`
    )
  ) {
    return {};
  }

  const field = result.organization.projectV2.fields.nodes.find(
    (f: GraphQlQueryResponseData) => f.name === fieldName
  );

  // Ensure field was found
  if (!ensureExists(field, "Field", `Name ${fieldName}`)) {
    return {};
  }

  const option = field.options?.find(
    (o: GraphQlQueryResponseData) => o.name === value
  );

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
      optionId: option?.id,
    },
  };
}

/**
 * Ensure a returned value exists
 *
 * @param {any} returnedValue - The value to check
 * @param {string} label - The label to use in the error message
 * @param {string} identifier - The identifier to use in the error message
 * @returns {bool} - True if the value exists, false otherwise
 */
export function ensureExists(
  returnedValue: any,
  label: string,
  identifier: string
) {
  if (returnedValue === undefined) {
    setFailed(`${label} not found with ${identifier}`);
    return false;
  } else {
    info(`Found ${label}: ${JSON.stringify(returnedValue)}`);
    return true;
  }
}

/**
 * Converts the field type to the GraphQL type
 * @param {string} fieldType - the field type returned from fetchProjectMetadata()
 * @returns {string} - the field type to use in the GraphQL query
 */
export function valueGraphqlType(fieldType: String): String {
  if (fieldType === "date") {
    return "Date";
  } else if (fieldType === "number") {
    return "Float";
  } else {
    return "String";
  }
}

/**
 * Converts a string value to the appropriate type for the field
 * @param {string} value - the string value from the action input
 * @param {string} fieldType - the field type from the project metadata
 * @returns {string | number} - the converted value
 */
export function convertValueToFieldType(
  value: string,
  fieldType: string
): string | number {
  if (fieldType === "number") {
    const numValue = parseFloat(value);
    if (isNaN(numValue)) {
      throw new Error(`Invalid number value: ${value}`);
    }
    return numValue;
  }
  return value;
}

/**
 * Adds an issue or pull request to a project
 * @param {string} projectId - The global ID of the project
 * @param {string} contentId - The global ID of the issue or pull request
 * @returns {Promise<GraphQlQueryResponseData>} - The added project item
 */
export async function addProjectItem(
  projectId: string,
  contentId: string
): Promise<GraphQlQueryResponseData> {
  const result: GraphQlQueryResponseData = await octokit.graphql(
    `
    mutation($project: ID!, $contentId: ID!) {
      addProjectV2ItemById(
        input: {
          projectId: $project
          contentId: $contentId
        }
      ) {
        item {
          id
        }
      }
    }
    `,
    {
      project: projectId,
      contentId,
    }
  );

  return result;
}

/**
 * Updates the field value for the content item
 * @param {GraphQlQueryResponseData} projectMetadata - The project metadata returned from fetchProjectMetadata()
 * @param {GraphQlQueryResponseData} contentMetadata - The content metadata returned from fetchContentMetadata()
 * @return {Promise<GraphQlQueryResponseData>} - The updated content metadata
 */
export async function updateField(
  projectMetadata: GraphQlQueryResponseData,
  contentMetadata: GraphQlQueryResponseData,
  value: string
): Promise<GraphQlQueryResponseData> {
  let valueType: string;
  let valueToSet: string | number;

  if (projectMetadata.field.fieldType === "single_select") {
    valueToSet = projectMetadata.field.optionId;
    valueType = "singleSelectOptionId";
  } else {
    valueToSet = convertValueToFieldType(
      value,
      projectMetadata.field.fieldType
    );
    valueType = projectMetadata.field.fieldType;
  }

  const result: GraphQlQueryResponseData = await octokit.graphql(
    `
    mutation($project: ID!, $item: ID!, $field: ID!, $value: ${valueGraphqlType(
      projectMetadata.field.fieldType
    )}) {
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
    `,
    {
      project: projectMetadata.projectId,
      item: contentMetadata.id,
      field: projectMetadata.field.fieldId,
      value: valueToSet,
    }
  );

  return result;
}

/**
 * Returns the validated and normalized inputs for the action
 *
 * @returns {object} - The inputs for the action
 */
export function getInputs(): { [key: string]: any } {
  let operation = getInput("operation");
  if (operation === "") operation = "update";

  if (!["read", "update"].includes(operation)) {
    setFailed(
      `Invalid value passed for the 'operation' parameter (passed: ${operation}, allowed: read, update)`
    );

    return {};
  }

  const inputs = {
    contentId: getInput("content_id", { required: true }),
    fieldName: getInput("field", { required: true }),
    projectNumber: parseInt(getInput("project_number", { required: true })),
    owner: getInput("organization", { required: true }),
    value: getInput("value", { required: operation === "update" }),
    autoAdd: getInput("auto_add") === "true",
    operation,
  };

  info(`Inputs: ${JSON.stringify(inputs)}`);

  return inputs;
}

/**
 * Setups up a shared Octokit instance hydrated with Actions information
 *
 * @param options - Octokit options
 */
export function setupOctokit(options?: { [key: string]: any }): void {
  const token = getInput("github_token", { required: true });
  octokit = getOctokit(token, options);
}

/**
 * The main event: Updates the selected field with the given value
 */
export async function run(): Promise<void> {
  const inputs = getInputs();
  if (Object.entries(inputs).length === 0) return;

  let contentMetadata = await fetchContentMetadata(
    inputs.contentId,
    inputs.fieldName,
    inputs.projectNumber,
    inputs.owner
  );

  // Check if the item is not in the project but auto_add is enabled
  if (contentMetadata.notInProject && inputs.autoAdd) {
    info(
      `Auto-adding item ${inputs.contentId} to project ${inputs.projectNumber}`
    );

    // First get the project metadata to get the project ID
    const projectMetadata = await fetchProjectMetadata(
      inputs.owner,
      inputs.projectNumber,
      inputs.fieldName,
      inputs.value,
      inputs.operation
    );
    if (Object.entries(projectMetadata).length === 0) return;

    // Add the item to the project
    await addProjectItem(projectMetadata.projectId, inputs.contentId);

    // Fetch the content metadata again now that it's in the project
    contentMetadata = await fetchContentMetadata(
      inputs.contentId,
      inputs.fieldName,
      inputs.projectNumber,
      inputs.owner
    );
  }

  if (Object.entries(contentMetadata).length === 0) return;

  const projectMetadata = await fetchProjectMetadata(
    inputs.owner,
    inputs.projectNumber,
    inputs.fieldName,
    inputs.value,
    inputs.operation
  );
  if (Object.entries(projectMetadata).length === 0) return;

  setOutput("field_read_value", contentMetadata.field?.value);
  if (inputs.operation === "update") {
    await updateField(projectMetadata, contentMetadata, inputs.value);
    setOutput("field_updated_value", inputs.value);
    info(
      `Updated field ${inputs.fieldName} on ${contentMetadata.title} to ${inputs.value}`
    );
  } else {
    setOutput("field_updated_value", contentMetadata.field?.value);
  }
}
