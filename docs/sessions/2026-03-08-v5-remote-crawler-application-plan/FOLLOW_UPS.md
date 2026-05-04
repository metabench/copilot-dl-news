# Follow Ups – V5 Remote Crawler Application Plan

## Immediate Next Session
- Verify which v2 helper modules must be restored first to make the remote crawl backend bootable.
- Inventory which unified-shell panels can be reused directly versus which need remote-aware adapters.
- Inventory which existing hub-intelligence services, query adapters, and candidate-state tables can be reused directly in v5.
- Define the first bundle job schema and archive format choices before implementation begins.

## Near-Term Planning Questions
- Should v5 keep remote SQLite as the primary operator-facing store, or should bundle jobs and the library move to a stronger database tier?
- How much of the existing Data Explorer should be embedded in the remote shell versus exposed as a dedicated standalone route?
- What is the minimum acceptable auth model for remote operator access: SSH tunnel only, reverse-proxy auth, or in-app login/session management?
- What is the cleanest shared state model for place/topic hub candidates, accepted crawl targets, and verified hubs?
