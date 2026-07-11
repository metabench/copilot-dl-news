# Stage 1 — SSH Bootstrap & Re-bootstrap (design note)

## Key model

The sandbox mints its own ED25519 keypair per session; the operator's
personal key NEVER enters the sandbox (hard rail). Current session key:

- Path (sandbox): `~/.ssh/cowork-deploy` (private, 0600) + `.pub`
- Comment: `cowork-sandbox-deploy-20260704`
- Fingerprint: `SHA256:VnExb0KuX+mLhV215aYSvHkUo9+h+HGmJ52WqI50xPM`
- Status at writing: present in sandbox, NOT authorized on VM
  (`Permission denied (publickey)` on BatchMode probe).

## Authorization (operator, one command from Windows)

    ssh oracle-worker "echo '<PUBKEY LINE>' >> ~/.ssh/authorized_keys"

where `<PUBKEY LINE>` is the full `ssh-ed25519 AAAA... cowork-sandbox-deploy-YYYYMMDD`
line the agent echoes in chat. Optional hardening — prepend restrictions:

    no-agent-forwarding,no-X11-forwarding,no-port-forwarding <PUBKEY LINE>

Full command-restriction (`command="..."`) is NOT recommended here: deploy
needs scp + several distinct remote commands; a forced command would break it.

## Verification probe (agent, after operator confirms)

    ssh -o BatchMode=yes -o ConnectTimeout=10 -i ~/.ssh/cowork-deploy \
        ubuntu@141.144.193.218 'echo AUTH-OK'

Expected `AUTH-OK`. `Permission denied (publickey)` = line not added / typo.
Timeout = network path, not auth. Known-hosts: VM host key (ED25519) was
pinned into the sandbox known_hosts on first contact 2026-07-04.

## Re-bootstrap (every new session — sandbox storage is wiped)

1. Agent checks `~/.ssh/cowork-deploy`; if absent, regenerate:
   `ssh-keygen -t ed25519 -f ~/.ssh/cowork-deploy -N "" -C cowork-sandbox-deploy-$(date +%Y%m%d)`
2. Agent echoes the new PUBLIC key line in chat.
3. Operator appends it to the VM's authorized_keys (command above).
4. Agent runs the verification probe before any deploy step.

## Hygiene

- Each session adds one `cowork-sandbox-deploy-*` line; stale lines are dead
  (their private keys are destroyed with the sandbox). Operator may prune:
  `ssh oracle-worker "sed -i '/cowork-sandbox-deploy/d' ~/.ssh/authorized_keys"`
  then re-add only the current one.
- Revocation = delete the line. Nothing else to clean up.
- The agent must never echo, copy, or read back the PRIVATE key half.

## Exit criterion

Design note exists; current key status verified and recorded. (Actual
authorization is an implementation-stage step, gated on the operator.)
