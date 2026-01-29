# Plan – OCI node hello world

## Objective
Deploy Node hello world on OCI instance port 80

## Done When
- [ ] Key deliverables are complete and documented in `SESSION_SUMMARY.md`.
- [ ] Tests and validations (if any) are captured in `WORKING_NOTES.md`.
- [ ] Follow-ups are recorded in `FOLLOW_UPS.md`.

## Change Set (initial sketch)
- No repo code changes expected; commands only. Record evidence in WORKING_NOTES.

## Risks & Mitigations
- Port 80 blocked by OS firewall or security list — verify `firewalld`/`iptables` status and test from outside.
- SSH key mismatch — reuse the OpenSSH key used in instance metadata.
- Node service not persistent — can add a quick `systemd` unit if time permits.

## Tests / Validation
- `curl http://<public-ip>/` from local machine returns expected hello string.
- `sudo ss -tlnp` on VM shows Node listening on 0.0.0.0:80.
