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