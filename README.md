# Update Project Action

Updates an item's fields on a GitHub Projects (beta) board based on a workflow dispatch (or other) event's input.

[![CI](https://github.com/benbalter/update-project-action/actions/workflows/ci.yml/badge.svg)](https://github.com/benbalter/update-project-action/actions/workflows/ci.yml)

## Usage

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