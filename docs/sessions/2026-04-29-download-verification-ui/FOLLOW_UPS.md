# Follow Ups

- Remote import/storage code should record `compression_type_id` or equivalent level/options metadata when possible. Current recent imported rows expose `storage_type=gzip`, but do not record the gzip level.
- Consider adding a compact per-host filter to the Download Verify screen if the operator wants to audit a specific crawl domain after a large distributed run.
