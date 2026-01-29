# Session Summary – Distributed crawling defaults

## Accomplishments
- Defaulted place/topic hub guessing UI jobs to use distributed crawling when available, with env overrides.
- Defaulted API `/place-hubs/guess` and `GuessPlaceHubsOperation` to distributed mode when available.

## Metrics / Evidence
- Not run.

## Notes
- Env overrides: `PLACE_HUB_GUESSING_DISTRIBUTED`, `TOPIC_HUB_GUESSING_DISTRIBUTED`, `GUESS_PLACE_HUBS_DISTRIBUTED` can disable distributed mode.
