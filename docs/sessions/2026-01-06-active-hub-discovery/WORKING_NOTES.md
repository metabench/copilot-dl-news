# Working Notes – Active Place Hub Discovery Mode

- 2026-01-06 — Session created via CLI. Add incremental notes here.

## UI Integration (2026-01-06)

Integrated the scoped active probing features into the Place Hub Guessing dashboard:

1.  **Backend (`src/ui/server/placeHubGuessing/server.js`)**:
    *   Updated `POST /api/guess` to accept `activePattern` and `parentPlace`.
    *   Updated `GET /` to accept query parameters for deep linking/persistence.
    *   Passed these new parameters to `guessPlaceHubsBatch`.

2.  **Frontend Controls (`src/ui/server/placeHubGuessing/controls/PlaceHubGuessingMatrixControl.js`)**:
    *   Added two new input fields to `HubGuessingMatrixChromeControl`:
        *   "Parent Place" (e.g. "Canada")
        *   "Active Pattern" (e.g. "/news/{slug}")

3.  **Client Script (`src/ui/server/hubGuessing/controls/HubGuessingMatrixChromeControl.js`)**:
    *   Updated the click handler script to include the new fields in the JSON payload sent to the server.

Manual verification required:
-   Open Place Hub Guessing UI.
-   Enter "Canada" in Parent Place.
-   Enter "/news/{slug}" in Active Pattern.
-   Run Guessing.
-   Verify job starts and CLI output shows scoped guessing logic (e.g. limiting to Canada region).
