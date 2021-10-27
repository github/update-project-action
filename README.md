# Update Project Action

A composite GitHub action that updates an item's fields on a GitHub Projects (beta) board based on a workflow dispatch (or other) event's input.

[![CI](https://github.com/benbalter/update-project-action/actions/workflows/ci.yml/badge.svg)](https://github.com/benbalter/update-project-action/actions/workflows/ci.yml)

## Goals 

* To make it easier to update the fields of a GitHub Project board based on action taken elsewhere within the development process (e.g., status update comments)
* Keep it simple - Prefer boring technology that others can understand, modify, and contribute to
* Never force a human to do what a robot can

## Status

Used to automate non-production workflows.

## Usage

To use this composite GitHub Action, add the following to a YAML file in your repository's `.github/workflows/` directory:

```yml
name: Update status on project board
on:
  repository_dispatch:
    types: [status_update]
jobs:
  update_project:
    runs-on: ubuntu-latest
    steps:
      - name: Update status
        uses: benbalter/update-project-action@v1
        with:
          github_token: ${{ secrets.STATUS_UPDATE_TOKEN }}
          organization: github
          project_number: 1234
          content_id: ${{ github.event.client_payload.command.resource.id }}
          field: Status
          value: ${{ github.event.client_payload.data.status }}
```

*Note: The above step can be repeated multiple times in a given job to update multiple fields on the same or different projects.* 

### Roadmap

The Action is largely feature complete with regards to its initial goals. Find a bug or have a feature request? [Open an issue](https://github.com/benbalter/update-project-action/issues), or better yet, submit a pull request - contribution welcome!
### Inputs

* `content_id` - The global ID of the issue or pull request within the project
* `field` - The field on the project to set the value of
* `github_token` - A GitHub Token with access to both the source issue and the destination project (`repo` and `write:org` scopes)
* `organization` - The organization that contains the project, defaults to the current repository owner
* `project_number` - The project number from the project's URL
* `value` - The value to set the project field to

### Outputs

* `field_id` - The global ID of the field
* `field_is_select` - Whether or not the field is a select field vs. free-form input
* `item_id` - The global ID of the issue or pull request
* `item_title` - The title of the issue or pull request
* `option_id` - The global ID of the selected option
* `project_id` - The global ID of the project