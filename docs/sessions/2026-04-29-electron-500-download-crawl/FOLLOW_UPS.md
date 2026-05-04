# Follow Ups

- Add a documented `electron:unified:downloads` script or launcher note for long-lived Downloads mode so future crawl runs do not need to remember the `--url-path "/?app=downloads" --port <port>` flags.
- Consider adding an Electron screenshot mode that captures the current Electron window without closing it, so future evidence can be from the actual Electron process rather than its localhost server route.
- Restore or replace `remote-crawl-admin` so distributed remote crawl control can be operated inside the Electron unified app, not only from CLI.
