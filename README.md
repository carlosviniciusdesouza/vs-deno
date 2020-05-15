# Visual Studio Code Deno extension

Heavily Inspired on [Official Deno Visual Studio Code Extension] (https://github.com/denoland/vscode_deno)

## Usage

This extension works using VS Code's **built-in version** of TypeScript. You do
not need to configure the plugin in your `tsconfig.json` if you are using VS
Code's version of TypeScript.

## Configuration
Configuration

After install typescript-deno-plugin, Then you can add a plugins section to your tsconfig.json.

{
  "compilerOptions": {
    "plugins": [
      {
        "name": "typescript-deno-plugin"
      }
    ]
  }
}

Finally, run the Select TypeScript version command in VS Code to switch to use the workspace version of TypeScript for VS Code's JavaScript and TypeScript language support. You can find more information about managing typescript versions in the VS Code documentation.

 or

configure it with VS Code settings. This requires VS Code 1.40+ and TS 3.8+.
Note the VS Code based configuration overrides the `tsconfig` configuration.

- `deno.enabled` - Enable/disable this extension. Default is `true`.

- `deno.alwaysShowStatus` - Always show the Deno status bar item. Default is `true`.

- `deno.importmap` - The Path of import maps. Default is `null`.

- `deno.autoFmtOnSave` - Turns auto format on save on or off. Default is `false`. (**Not implemented**)

## Commands

This extension contributes the following commands to the Command palette.

- `Enable Deno` - Enable this extension.
- `Disable Deno` - Disable this extension.

## Contribute

Report a bug or a suggestion by posting an issue on the [Official git
repository](https://github.com/denoland/vscode_deno).
