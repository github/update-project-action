# Update Project Action

Updates an item on a GitHub Projects (beta) board based on a workflow dispatch event's input.

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

* `github_token` - a personal access token with `repo` and `write:org` scope
* `organization` - the organization that owns the project. If not is given, the owner of the repo is assumed
* `project_number` - the numeric ID of the project, as seen in the project's URL
* `content_id` - the GraphQL global ID of the Issue or PR to update on the project
* `field` - the human-readable label of the field to update (e.g., `Status`)
* `value` - the human-readable value to set the field to

### Outputs

* `project_id` - the global ID of the project that was updated
* `item_id` - the global ID of the pull request or issue on the project board that was updated
* `item_title` - the title of the pull request or issue on the project board that was updated
* `field_id` - the field that was updated
* `field_is_select` - if the updated field was a select one field (vs. free-form input)
* `option_id` - the ID of the selected option