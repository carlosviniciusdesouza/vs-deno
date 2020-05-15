// Copyright 2019-2020 the Deno authors. All rights reserved. MIT license.

import * as fs from "fs";
import * as path from "path";
import execa from "execa";

import * as vscode from "vscode";
import * as lsp from "vscode-languageclient";

import { bundledDtsPath } from "./deno";

export interface DenoVersion {
  deno: string;
  v8: string;
  typescript: string;
  raw: string;
}

/** Check if the package.json file exists in the root directory. */
export function packageJsonExists(): boolean {
  if (!vscode.workspace.rootPath) {
    return false;
  }

  try {
    const filename = path.join(vscode.workspace.rootPath, "package.json");
    const stat = fs.statSync(filename);
    return stat && stat.isFile();
  } catch (ignored) {
    return false;
  }
}

export function tsconfigExists() {
  if (!vscode.workspace.rootPath) {
    return false;
  }

  try {
    const filename = path.join(vscode.workspace.rootPath, "tsconfig.json");
    const stat = fs.statSync(filename);
    return stat && stat.isFile();
  } catch (ignored) {
    return false;
  }
}

export function isTypeScriptDocument(document: vscode.TextDocument) {
  return (
    document.languageId === "typescript" ||
    document.languageId === "typescriptreact"
  );
}

export function isJavaScriptDocument(document: vscode.TextDocument) {
  return (
    document.languageId === "javascript" ||
    document.languageId === "javascriptreact"
  );
}

export async function getVersions(): Promise<DenoVersion | undefined> {
  try {
    const { stdout, stderr } = await execa("deno", [
      "eval",
      "console.log(JSON.stringify(Deno.version))",
    ]);

    if (stderr) {
      return;
    }

    const { deno, v8, typescript } = JSON.parse(stdout);

    return {
      deno,
      v8,
      typescript,
      raw: `deno: ${deno}\nv8: ${v8}\ntypescript: ${typescript}`,
    };
  } catch {
    return;
  }
}

export function normalizeFilepath(filepath: string): string {
  return path.normalize(
    filepath
      // in Windows, filepath maybe `c:\foo\bar` tut the legal path should be `C:\foo\bar`
      .replace(/^([a-z]):\\/, (_, $1) => $1.toUpperCase() + ":\\")
      // There are some paths which are unix style, this style does not work on win32 systems
      .replace(/\//gm, path.sep),
  );
}

export function getDenoDir(): string {
  // ref https://deno.land/manual.html
  // On Linux/Redox: $XDG_CACHE_HOME/deno or $HOME/.cache/deno
  // On Windows: %LOCALAPPDATA%/deno (%LOCALAPPDATA% = FOLDERID_LocalAppData)
  // On macOS: $HOME/Library/Caches/deno
  // If something fails, it falls back to $HOME/.deno
  let denoDir = process.env.DENO_DIR;
  if (denoDir === undefined) {
    switch (process.platform) {
      case "win32":
        denoDir = `${process.env.LOCALAPPDATA}\\deno`;
        break;
      case "darwin":
        denoDir = `${process.env.HOME}/Library/Caches/deno`;
        break;
      case "linux":
        denoDir = process.env.XDG_CACHE_HOME
          ? `${process.env.XDG_CACHE_HOME}/deno`
          : `${process.env.HOME}/.cache/deno`;
        break;
      default:
        denoDir = `${process.env.HOME}/.deno`;
    }
  }

  return denoDir;
}

export function isInDenoDir(filepath: string): boolean {
  filepath = normalizeFilepath(filepath);
  const denoDir = getDenoDir();
  return filepath.startsWith(denoDir);
}

/**
 * The absolute file path of the directory containing this extension.
 * @param extensionId 
 */
export function getExtensionPath(extensionId: string): string | undefined {
  return vscode.extensions.getExtension(extensionId)?.extensionPath;
}

// Generate Deno's .d.ts file
export async function generateDtsForDeno(extensionId: string): Promise<void> {
  const denoDir: string = getDenoDir();
  const extensionPath = getExtensionPath(extensionId)!;
  const bundledPath = bundledDtsPath(extensionPath);

  if (!fs.existsSync(denoDir)) {
    fs.mkdirSync(denoDir, { recursive: true });
  }

  // copy bundled lib.webworker.d.ts to `denoDir`
  // fix https://github.com/microsoft/TypeScript/issues/5676
  fs.copyFileSync(
    path.resolve(bundledPath, "lib.webworker.d.ts"),
    path.resolve(denoDir, "lib.webworker.d.ts"),
  );

  try {
    const { stdout, stderr } = await execa("deno", ["types"]);

    if (stderr) {
      throw stderr;
    }

    fs.writeFileSync(path.resolve(denoDir, "lib.deno.d.ts"), stdout);
  } catch {
    // if `deno types` fails, just copy bundled lib.deno.d.ts to `denoDir`
    fs.copyFileSync(
      path.resolve(bundledPath, "lib.deno.d.ts"),
      path.resolve(denoDir, "lib.deno.d.ts"),
    );
  }
}

export async function getTypeScriptLanguageExtension() {
  const typeScriptExtensionId = "vscode.typescript-language-features";

  const extension = vscode.extensions.getExtension(typeScriptExtensionId);
  if (!extension) {
    return;
  }

  await extension.activate();
  if (!extension.exports || !extension.exports.getAPI) {
    return;
  }

  const api = extension.exports.getAPI(0);
  if (!api) {
    return;
  }

  return api;
}

/**
 * Construct the arguments that's used to spawn the server process.
 * @param ctx vscode extension context
 * @param debug true if debug mode is on
 */
function constructArgs(ctx: vscode.ExtensionContext, debug: boolean): string[] {
  const config = vscode.workspace.getConfiguration();
  const args: string[] = [];

  const denoLog: string = config.get("deno.log", "off");
  if (denoLog !== "off") {
    // Log file does not yet exist on disk. It is up to the server to create the file.
    const logFile = path.join(ctx.logPath, "denoserver.log");
    args.push("--logFile", logFile);
    args.push("--logVerbosity", debug ? "verbose" : denoLog);
  }

  // Load tsconfig.json configuration file
  const tsconfig: string | null = config.get("deno.tsconfig", null);
  if (tsconfig) {
    args.push("--config", ctx.asAbsolutePath(tsconfig));
  }

  // Load import map file
  const importmap: string | null = config.get("deno.importmap", null);
  if (importmap) {
    args.push("--importmap", ctx.asAbsolutePath(importmap));
  }
  args.push("--tsdk", ctx.extensionPath);
  return args;
}

export function getServerOptions(
  ctx: vscode.ExtensionContext,
  debug: boolean,
): lsp.NodeModule {
  // Environment variables for server process
  const prodEnv = {
    // Force TypeScript to use the non-polling version of the file watchers.
    TSC_NONPOLLING_WATCHER: true,
  };
  const devEnv = {
    ...prodEnv,
    DENO_DEBUG: true,
  };

  // Node module for the language server
  const prodBundle = ctx.asAbsolutePath("server");
  const devBundle = ctx.asAbsolutePath(path.join("server", "out", "server.js"));

  // Argv options for Node.js
  const prodExecArgv: string[] = [];
  const devExecArgv: string[] = [
    // do not lazily evaluate the code so all breakpoints are respected
    "--nolazy",
    // If debugging port is changed, update .vscode/launch.json as well
    "--inspect=6009",
  ];

  return {
    // VS Code Insider launches extensions in debug mode by default but users
    // install prod bundle so we have to check whether dev bundle exists.
    module: debug && fs.existsSync(devBundle) ? devBundle : prodBundle,
    transport: lsp.TransportKind.ipc,
    args: constructArgs(ctx, debug),
    options: {
      env: debug ? devEnv : prodEnv,
      execArgv: debug ? devExecArgv : prodExecArgv,
    },
  };
}

export async function delay(ms: number): Promise<void> {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

export async function restartTsServer(): Promise<void> {
  await delay(1000);
  vscode.commands.executeCommand("typescript.restartTsServer");
}

export function downloadLibDenoDts(): void {}
