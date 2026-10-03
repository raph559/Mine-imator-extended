# Mine-imator Extended

An unofficial fork of [Mine-imator](https://www.mineimator.com) 2.0, the 3D movie maker based on Minecraft. It adds ways to drive the app from outside, starting with an **MCP bridge**: an AI assistant (or any MCP client) can build, animate and render scenes in the running app, live, with every change undoable with Ctrl+Z.

This fork is not affiliated with the Mine-imator team. For the official app, go to [mineimator.com](https://www.mineimator.com) and the [official repository](https://github.com/stuffbydavid/Mine-imator).

## What this fork adds

**MCP bridge** ([details](mcp/README.md)). A local socket built into the app, and an MCP server in `mcp/` with 48 tools:

- Projects: create, open and save; tempo, resolution, render settings; the whole background (sky, sun, clouds, fog, wind, sky image).
- Scene: create characters, items, blocks, text, shapes, cameras, lights, folders, sounds and particle spawners; parent, rename, duplicate, select; per-object settings such as visibility, pivot and texture.
- Animation: keyframes one by one or in batches, copying poses between frames and characters, easing, markers, loop region, playback.
- Assets: skins from a file or a player name, custom `.mimodel` models, scenery (`.schematic`, `.nbt`, `.blocks`), a box of blocks from a Minecraft world, images, sounds, particle types and their settings.
- Output: screenshots of the view, image and movie export (with sound), the view through any scene camera.

**In the app.** An **MCP** menu in the toolbar shows whether the bridge is running and starts or stops it, with a setting to start it with the app. It is closed by default and only listens on `127.0.0.1`. A `--background` launch flag keeps the window off screen and never takes the focus, so tests and assistants can work while you use the computer.

**Fixes to Mine-imator itself**, found while building the bridge:

- Five editor actions recorded the wrong action for undo, so pressing undo changed something else: the particle sprite angle and angle change, the item material and normal map textures, and the particle spawn region path.
- A particle type made of a text object crashed the app when it was drawn.

Other changes only matter when the app is driven from outside: undoing an import or a creation the bridge just made, two loads started a moment apart, and message boxes that would wait for a click are all handled.

## Getting started

1. **Build.** Follow [`BUILD.md`](BUILD.md) to set up the toolchain, but clone this fork instead of the official repository. After that, `mcp/scripts/build.ps1` builds the app into `install/Mine-imator/`.
2. **Install the MCP server.** `cd mcp && npm install` (Node 22 or newer).
3. **Connect a client.** In this repository, `.mcp.json` registers the server for MCP clients that read it, such as Claude Code. To use it from anywhere with Claude Code:
   ```
   claude mcp add --scope user mineimator -e MINEIMATOR_EXE=<repo>/install/Mine-imator/Mine-imator.exe -- node <repo>/mcp/src/server.mjs
   ```
4. **Go.** Ask the assistant to start Mine-imator (the `launch_app` tool), or start the app yourself and press Start in its MCP menu.

`mcp/scripts/deploy.ps1 -Target <install folder>` copies a build over an existing Mine-imator install. It changes only program files and leaves projects, skins, settings and the upgrade key alone.

## Status

- Tested on Windows 11: 15 unit tests and 125 integration tests that drive the real app in background mode (`cd mcp && npm test && npm run test:app`).
- Not tested yet: importing from a real Minecraft world (the tests use small generated worlds), and opening a project saved by this build in the official app (the project format is unchanged).
- Built and tested for Windows only. The original build scripts for Mac and Linux are kept but have not been tried with these changes.

Design notes and the roadmap are in [`docs/superpowers`](docs/superpowers).

## Credits and licensing

Mine-imator is created by David Andrei, with David, Nimi, Marvin and mbanders on development and Voxy on UI and branding, as its About window credits them. Almost all of this repository is their work.

The official repository had an MIT license from 2018 until it was removed with version 2.0.0 in 2023, and it has had none since. Mine-imator's code in this fork therefore stays under its authors' terms, and this fork does not grant any rights to it. GitHub's terms allow forking public repositories, but please do not redistribute builds of this fork unless the Mine-imator authors allow it.

The additions of this fork (the `mcp/` folder, the `bridge_*` scripts and the bridge code in `CppProject/Bridge`) are by [raph559](https://github.com/raph559).

## About Mine-imator

<p align="center">
  <img src="https://www.mineimatorforums.com/uploads/monthly_2021_08/image.png.4699187f1f02be8222a5bf5100c1738f.png" width=800/>
  <br/>
  <br/>
  <img src="https://www.mineimatorforums.com/uploads/monthly_2023_03/336815532_programview.png.9212aa1f6d1bed63411408aa5e905ce0.png" width=800/>
</p>

Mine-imator is a 3D movie maker based on the sandbox game Minecraft, with over 10 million downloads since its launch in 2012. Version 2.0, the 10th anniversary update brings numerous additions including a new UI, new renderer, animation features, multiplatform support and 3D world importer.

Website and download: https://www.mineimator.com

The software is written using GameMaker Language and converted to a separate C++ environment using a custom built GML parser (CppGen). The final executable is built for Windows, Mac OS and Linux using the Qt framework, DirectX/OpenGL rendering and various other libraries.

You can open `GmProject/Mine-imator.yyp` directly in GameMaker on Windows (it may need to be converted), but to support all features you must build and run the C++ project. For full build instructions, see `BUILD.md`.
