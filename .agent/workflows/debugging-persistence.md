---
description: Protocol for debugging persistence, caching, and state synchronization issues
---

# Debugging Protocol & Persistence Checks

When debugging issues where state "reverts" or fails to save, follow this rigorous verification chain to identify the break point quickly.

## 1. The Persistence Chain
Do not assume success based on logs alone. Verify the artifact at each stage.

### Write Path
1.  **Client State**: Verify the data *just before* transmission.
    *   *Technique*: Visual overlay of values (e.g., "Saving: {x: 10, y: 20}") if console is inaccessible.
2.  **Transport**: Verify the network payload.
3.  **Disk Write**: Verify the *actual file on disk* on the server.
    *   *Command*: `stat filename` (Check modification time).
    *   *Command*: `sha256sum filename` (Compare with client expectation).
    *   *Command*: `scp user@host:file ./local_verify` (Inspect content manually).
    *   *Failure Mode*: If logs say "Written" but file is unchanged, check Permissions, Docker Volumes, or silent write failures.

### Read Path (The Often Forgotten Half)
If the Write Path is valid (File is correct on disk) but the user sees old data:
1.  **Server Delivery**: Request the resource directly from the server (e.g., `curl`).
    *   *Command*: `curl -v http://host/resource`
    *   *Check*: Does the response match the disk file?
    *   *Failure Mode*: **Server-Side Caching** (In-memory `pageCache`, Varnish, Nginx).
        *   *Symptom*: Browser receives 200 OK, but content is old.
        *   *Fix*: Restart server, disable app-level cache, or bust cache keys.
2.  **Client Reception**: Check Browser Network Tab.
    *   *Check*: Response Headers (`Cache-Control`, `ETag`).
    *   *Failure Mode*: **Browser Caching** (304 Not Modified, Service Worker).
        *   *Symptom*: Browser uses internal cache, doesn't even talk to server (or gets 304).

## 2. Remote & Mobile Debugging "Skills"
When the user is on a device without DevTools (iPad, Kiosk, Mobile):
1.  **Visual Versioning**: HARDCODE a visible version identifier in the UI.
    *   *Code*: `<div>Version: v3 - Fix for X</div>`
    *   *Why*: Instantly differentiates between "Browser holds old code" and "Server serves old content".
    *   *Result*: If "v3" is visible but data is old => **Server Issue**. If "v3" is missing => **Browser Cache Issue**.
2.  **Visual Feedback**: Show *internal state* in the UI.
    *   *Code*: `showToast("Saved to " + x + "," + y)` instead of just "Saved".
    *   *Why*: Distinguishes between "Save failed" and "Save succeeded but loaded old data".

## 3. Common "Ghost" Bugs
-   **In-Memory Page Cache**: Server renders HTML once and serves it forever. (Fix: Disable cache or invalidate on write).
-   **Service Workers**: Stale assets served to support offline mode. (Fix: Unregister SW or Force Refresh).
-   **Attribute vs Property**: DOM `getAttribute('value')` vs `element.value` vs serialization. (Fix: Explicitly sync attributes before serialization).
