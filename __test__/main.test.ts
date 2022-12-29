import { resourceLimits } from "worker_threads";
import * as updateProject from "../src/update-project";
import fetchMock from "fetch-mock";

test("ensureExists returns false", () => {
  const result = updateProject.ensureExists(undefined, "test", "test");
  expect(result).toBe(false);
});

test("ensureExists returns true", () => {
  const result = updateProject.ensureExists("test", "test", "test");
  expect(result).toBe(true);
});

test("valueGraphqlType returns Date for date", () => {
  const result = updateProject.valueGraphqlType("date");
  expect(result).toBe("Date");
});

test("valueGraphqlType returns Float for number", () => {
  const result = updateProject.valueGraphqlType("number");
  expect(result).toBe("Float");
});

test("valueGraphqlType returns String for text", () => {
  const result = updateProject.valueGraphqlType("text");
  expect(result).toBe("String");
});

describe("with environmental variables", () => {
  const OLD_ENV = process.env;
  const INPUTS = {
    INPUT_CONTENT_ID: "1",
    INPUT_FIELD: "test",
    INPUT_VALUE: "test",
    INPUT_PROJECT_NUMBER: "1",
    INPUT_OWNER: "github",
  };

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV, ...INPUTS };
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  test("getInputs returns inputs", () => {
    const result = updateProject.getInputs();
    expect(result.contentId).toEqual(INPUTS.INPUT_CONTENT_ID);
  });

  test("getInputs defaults to update", () => {
    const result = updateProject.getInputs();
    expect(result.operation).toEqual("update");
  });

  test("getInputs accepts read", () => {
    process.env = { ...process.env, ...{ INPUT_OPERATION: "read" } };
    const result = updateProject.getInputs();
    expect(result.operation).toEqual("read");
  });

  test("getInputs doesn't accept other operations", () => {
    process.env = { ...process.env, ...{ INPUT_OPERATION: "foo" } };
    const result = updateProject.getInputs();
    expect(result).toEqual({});
  });
});

describe("with Octokit setup", () => {
  const OLD_ENV = process.env;
  let mock: typeof fetchMock;

  const mockGraphQL = (
    data: { [key: string]: any },
    name: string,
    body?: String
  ) => {
    const response = { status: 200, body: data };
    const matcher = (_: string, options: { [key: string]: any }): boolean => {
      if (!body) {
        return true;
      }
      const haystack = options.body || "";
      return haystack.toString().includes(body);
    };
    mock.once(
      {
        method: "POST",
        url: "https://api.github.com/graphql",
        name: name,
        functionMatcher: matcher,
      },
      response
    );
  };

  const mockContentMetadata = (
    title: String,
    item: { project: { number: number; owner: { login: string } } }
  ) => {
    const data = {
      data: {
        node: {
          title: title,
          projectItems: {
            nodes: [item, { project: { number: 2, owner: { login: "foo" } } }],
          },
        },
      },
    };
    mockGraphQL(data, "contentMetadata", "projectItems");
  };

  const mockProjectMetadata = (
    projectId: number,
    field: { [key: string]: any }
  ) => {
    const data = {
      data: {
        organization: {
          projectV2: {
            id: projectId,
            fields: {
              nodes: [field],
            },
          },
        },
      },
    };
    mockGraphQL(data, "projectMetadata", "projectV2");
  };

  beforeEach(() => {
    process.env = { ...OLD_ENV, ...{ INPUT_TOKEN: "test" } };
    fetchMock.config.sendAsJson = true;
    mock = fetchMock.sandbox();
    let options = { request: { fetch: mock } };
    updateProject.setupOctokit(options);
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  test("fetchContentMetadata fetches content metadata", async () => {
    const item = { project: { number: 1, owner: { login: "github" } } };
    mockContentMetadata("test", item);

    const result = await updateProject.fetchContentMetadata(
      "1",
      "test",
      1,
      "github"
    );
    expect(result).toEqual({ ...item, ...{ title: "test" } });
    expect(mock.done()).toBe(true);
  });

  test("fetchContentMetadata returns empty object if not found", async () => {
    const item = { project: { number: 1, owner: { login: "github" } } };
    mockContentMetadata("test", item);

    const result = await updateProject.fetchContentMetadata(
      "2",
      "test",
      2,
      "github"
    );
    expect(result).toEqual({});
    expect(mock.done()).toBe(true);
  });

  test("fetchProjectMetadata fetches project metadata", async () => {
    const expected = {
      projectId: 1,
      field: {
        fieldId: 1,
        fieldType: "single_select",
        optionId: 1,
      },
    };

    const field = {
      id: 1,
      name: "testField",
      dataType: "single_select",
      options: [
        {
          id: 1,
          name: "testValue",
        },
      ],
    };
    mockProjectMetadata(1, field);

    const result = await updateProject.fetchProjectMetadata(
      "github",
      1,
      "testField",
      "testValue",
      "update"
    );
    expect(result).toEqual(expected);
    expect(mock.done()).toBe(true);
  });

  test("fetchProjectMetadata returns empty object if field is not found", async () => {
    const field = {
      id: 1,
      name: "testField",
      dataType: "single_select",
      options: [
        {
          id: 1,
          name: "testValue",
        },
      ],
    };
    mockProjectMetadata(1, field);

    const missingField = await updateProject.fetchProjectMetadata(
      "github",
      1,
      "missingField",
      "testValue",
      "update"
    );
    expect(missingField).toEqual({});
    expect(mock.done()).toBe(true);
  });

  test("fetchProjectMetadata returns empty object if value is not found", async () => {
    const field = {
      id: 1,
      name: "testField",
      dataType: "single_select",
      options: [
        {
          id: 1,
          name: "testValue",
        },
      ],
    };
    mockProjectMetadata(1, field);

    const missingValue = await updateProject.fetchProjectMetadata(
      "github",
      1,
      "testField",
      "missingValue",
      "update"
    );
    expect(missingValue).toEqual({});
    expect(mock.done()).toBe(true);
  });

  test("updateField", async () => {
    const item = { project: { number: 1, owner: { login: "github" } } };
    mockContentMetadata("test", item);

    const field = {
      id: 1,
      name: "testField",
      dataType: "single_select",
      options: [
        {
          id: 1,
          name: "testValue",
        },
      ],
    };
    mockProjectMetadata(1, field);

    const data = { data: { projectV2Item: { id: 1 } } };
    mockGraphQL(data, "updateField", "updateProjectV2ItemFieldValue");

    const projectMetadata = await updateProject.fetchProjectMetadata(
      "github",
      1,
      "testField",
      "testValue",
      "update"
    );
    const contentMetadata = await updateProject.fetchContentMetadata(
      "1",
      "test",
      1,
      "github"
    );
    const result = await updateProject.updateField(
      projectMetadata,
      contentMetadata,
      "new value"
    );
    expect(result).toEqual(data.data);
    expect(mock.done()).toBe(true);
  });
});
