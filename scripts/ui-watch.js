"use strict";

const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const esbuild = require("esbuild");

const ROOT = path.resolve(__dirname, "..");

function parseArgs(argv) {
  const args = {
    server: "data-explorer",
    port: 4600,
    host: "127.0.0.1",
    noServer: false
  };

  const tokens = Array.isArray(argv) ? argv.slice(2) : [];
  for (let i = 0; i < tokens.length; i += 1) {
    const t = tokens[i];
    if (!t) continue;
    if (t === "--no-server") args.noServer = true;
    else if (t === "--server") args.server = String(tokens[++i] || "");
    else if (t === "--port") args.port = Number(tokens[++i] || args.port);
    else if (t === "--host") args.host = String(tokens[++i] || args.host);
  }
  return args;
}

function legacyHtmlparserGlobalThisShim() {
  const matcher = /[\\/]node_modules[\\/]htmlparser[\\/]lib[\\/]htmlparser\.js$/;
  return {
    name: "legacy-htmlparser-globalthis-shim",
    setup(build) {
      build.onLoad({ filter: matcher }, async (args) => {
        const source = await fs.promises.readFile(args.path, "utf8");
        const patched = source.replace(/\bthis\.Tautologistics\b/g, "globalThis.Tautologistics");
        return { contents: patched, loader: "js" };
      });
    }
  };
}

function debounce(fn, delayMs) {
  let timer = null;
  return (...args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delayMs);
  };
}

function spawnNode(scriptPath, args, label) {
  const child = spawn(process.execPath, [scriptPath, ...(args || [])], {
    cwd: ROOT,
    stdio: "inherit",
    env: { ...process.env }
  });
  child.on("exit", (code, signal) => {
    if (signal) {
      console.log(`[ui:watch] ${label} exited (${signal})`);
      return;
    }
    if (code !== 0) {
      console.log(`[ui:watch] ${label} exited (code ${code})`);
    }
  });
  return child;
}

function runCssBuild() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, "scripts", "build-ui-css.js")], {
      cwd: ROOT,
      stdio: "inherit",
      env: { ...process.env }
    });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`CSS build failed (exit ${code})`));
    });
  });
}

function watchCss() {
  const watchDirs = [
    path.join(ROOT, "src", "ui", "controls"),
    path.join(ROOT, "src", "ui", "server")
  ];

  const rebuild = debounce(async () => {
    try {
      await runCssBuild();
      console.log("[ui:watch] ✅ CSS rebuilt");
    } catch (err) {
      console.error("[ui:watch] ❌ CSS rebuild failed:", err.message);
    }
  }, 200);

  watchDirs.forEach((dir) => {
    if (!fs.existsSync(dir)) return;
    fs.watch(dir, { recursive: true }, (eventType, filename) => {
      const file = filename ? String(filename) : "";
      if (!file) return;
      if (!/\.(js|css)$/i.test(file)) return;
      rebuild();
    });
  });

  console.log("[ui:watch] watching CSS sources (controls + server)");
}

async function watchClient() {
  const entryPoint = path.join(ROOT, "src", "ui", "client", "index.js");
  const outdir = path.join(ROOT, "public", "assets");
  const outfile = path.join(outdir, "ui-client.js");
  const defaultPluginEnabled = process.env.BINDING_PLUGIN_ENABLED ?? "true";

  fs.mkdirSync(outdir, { recursive: true });

  const ctx = await esbuild.context({
    entryPoints: [entryPoint],
    bundle: true,
    outfile,
    platform: "browser",
    format: "iife",
    target: ["es2019"],
    sourcemap: true,
    minify: false,
    plugins: [legacyHtmlparserGlobalThisShim()],
    define: {
      "process.env.BINDING_PLUGIN_ENABLED": JSON.stringify(defaultPluginEnabled)
    }
  });

  await ctx.watch();
  console.log(`[ui:watch] watching client bundle → ${path.relative(ROOT, outfile)}`);

  return ctx;
}

function watchServerRestart({ server, port, host }) {
  const serverPathByKey = {
    "data-explorer": path.join(ROOT, "src", "ui", "server", "dataExplorerServer.js")
  };

  const scriptPath = serverPathByKey[server] || serverPathByKey["data-explorer"];
  let child = null;

  const start = () => {
    const args = ["--port", String(port), "--host", String(host)];
    console.log(`[ui:watch] starting server (${path.relative(ROOT, scriptPath)}) on ${host}:${port}`);
    child = spawnNode(scriptPath, args, "server");
  };

  const stop = () => {
    if (!child) return;
    try {
      child.kill();
    } catch (_) {
      // ignore
    }
    child = null;
  };

  const restart = debounce(() => {
    console.log("[ui:watch] restarting server…");
    stop();
    start();
  }, 250);

  const watchDirs = [
    path.join(ROOT, "src", "ui", "server"),
    path.join(ROOT, "src", "ui", "controls"),
    path.join(ROOT, "src", "ui")
  ];

  watchDirs.forEach((dir) => {
    if (!fs.existsSync(dir)) return;
    fs.watch(dir, { recursive: true }, (eventType, filename) => {
      const file = filename ? String(filename) : "";
      if (!file) return;
      if (!/\.(js)$/i.test(file)) return;
      if (file.includes("public\\assets") || file.includes("public/assets")) return;
      restart();
    });
  });

  start();

  const handleExit = () => {
    stop();
    process.exit(0);
  };

  process.on("SIGINT", handleExit);
  process.on("SIGTERM", handleExit);

  console.log("[ui:watch] watching server sources (restart on .js changes)");
}

async function main() {
  const args = parseArgs(process.argv);

  console.log("[ui:watch] initial CSS build");
  try {
    await runCssBuild();
  } catch (err) {
    console.error("[ui:watch] initial CSS build failed:", err.message);
  }

  watchCss();
  await watchClient();

  if (!args.noServer) {
    watchServerRestart({ server: args.server, port: args.port, host: args.host });
  } else {
    console.log("[ui:watch] server disabled (use --no-server)");
  }

  console.log("[ui:watch] ready");
}

main().catch((err) => {
  console.error("[ui:watch] fatal:", err);
  process.exitCode = 1;
});
