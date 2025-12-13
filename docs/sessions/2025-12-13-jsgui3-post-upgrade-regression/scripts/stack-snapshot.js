"use strict";

const fs = require("fs");
const path = require("path");

const workspaceRoot = path.resolve(__dirname, "..", "..", "..", "..");

const packages = [
  "jsgui3-client",
  "jsgui3-html",
  "jsgui3-html-ssr",
  "jsgui3-html-core",
  "jsgui3-html-enh",
  "jsgui3-html-page-context",
  "jsgui3-client-bundle"
];

function safeReadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    return { __error: error && error.message ? error.message : String(error) };
  }
}

function classifyPath(p) {
  if (!p) return { exists: false };
  try {
    const stat = fs.lstatSync(p);
    const isSymlink = stat.isSymbolicLink();
    const realpath = isSymlink ? fs.realpathSync(p) : p;
    return {
      exists: true,
      isSymlink,
      realpath,
      kind: stat.isDirectory() ? "dir" : stat.isFile() ? "file" : "other"
    };
  } catch (error) {
    return { exists: false, error: error && error.message ? error.message : String(error) };
  }
}

function resolvePackageRoot(packageName) {
  try {
    const pkgJsonPath = require.resolve(`${packageName}/package.json`, { paths: [workspaceRoot] });
    return path.dirname(pkgJsonPath);
  } catch (_) {
    return null;
  }
}

function getVersion(packageName) {
  const root = resolvePackageRoot(packageName);
  if (!root) return null;
  const pkg = safeReadJson(path.join(root, "package.json"));
  return pkg && typeof pkg.version === "string" ? pkg.version : null;
}

function main() {
  const snapshot = {
    timestamp: new Date().toISOString(),
    workspaceRoot,
    node: process.version,
    platform: { platform: process.platform, arch: process.arch },
    packages: {}
  };

  for (const name of packages) {
    const root = resolvePackageRoot(name);
    snapshot.packages[name] = {
      resolved: root,
      version: getVersion(name),
      nodeModulesPath: path.join(workspaceRoot, "node_modules", name),
      nodeModules: classifyPath(path.join(workspaceRoot, "node_modules", name)),
      packageJson: root ? classifyPath(path.join(root, "package.json")) : { exists: false }
    };
  }

  const outPath = path.join(__dirname, "stack-snapshot.json");
  fs.writeFileSync(outPath, JSON.stringify(snapshot, null, 2), "utf8");
  console.log(`Wrote ${outPath}`);

  for (const [name, info] of Object.entries(snapshot.packages)) {
    const where = info.nodeModules && info.nodeModules.exists
      ? (info.nodeModules.isSymlink ? `symlink -> ${info.nodeModules.realpath}` : "directory")
      : "missing";
    console.log(`${name}: ${info.version || "(unresolved)"} (${where})`);
  }
}

main();
