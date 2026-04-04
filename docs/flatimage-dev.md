# FlatImage Developer Reference

This document explains the FlatImage feature architecture. Keep it up to date when making changes.

## What is FlatImage?

FlatImage (`.flatimage` files) are portable Linux game executables — similar to AppImage but used in the PCVaultLauncher context. They are self-contained executables that run directly on Linux without installation.

## Architecture

### Files involved

| File | Role |
|------|------|
| `src/shared/flatimage/FlatImageScanner.ts` | Scans a directory for `.flatimage` files and returns an `IGameCollection` |
| `src/shared/config/interfaces.ts` | `IFlatImageConfig` type definition |
| `src/shared/config/util.ts` | Default values + parsing for `flatimage` config key |
| `src/renderer/redux/gamesMiddleware.ts` | Loads FlatImage games on startup, after eXoDOS platforms |
| `src/renderer/util/media.ts` | `loadPlatformImages(platform, directPath?)` / `loadPlatformVideos(platform, directPath?)` |
| `src/renderer/components/pages/ConfigPage.tsx` | UI for FlatImage config section |
| `src/back/game/GameLauncher.ts` | Special detached spawn for `platform === "Flatimage"` |
| `docs/reference/` | Compiled JS from working version — ground truth for launch behavior |

### Config fields (`config.json` → `flatimage` object)

```json
{
  "flatimage": {
    "enabled": true,
    "flatimageDirectory": "/path/to/flatimage/files",
    "autoDetect": true,
    "metadataCache": true,
    "imagesDirectory": "/path/to/Images/Flatimage/",
    "videosDirectory": "/path/to/Videos/Flatimage/"
  }
}
```

- `flatimageDirectory`: folder containing `.flatimage` executables
- `imagesDirectory`: direct path to the `Images/Flatimage/` folder (bypasses exodosPath)
- `videosDirectory`: direct path to the `Videos/Flatimage/` folder (bypasses exodosPath)

### Game loading flow

1. `gamesMiddleware.ts` calls `scanFlatImageDirectory(flatimageDirectory)`
2. Scanner lists all `.flatimage` files, creates `IGameInfo` objects with:
   - `platform: "Flatimage"`
   - `library: "Flatimage"`
   - `applicationPath`: absolute path to the `.flatimage` file
   - `launchCommand: ""`
   - Deterministic ID from SHA1 hash of filename
3. Media is loaded via `loadPlatformImages("Flatimage", imagesDirectory)` and `loadPlatformVideos("Flatimage", videosDirectory)`
4. Games are added to the main collection under library `"Flatimage"`
5. When FlatImage support is enabled, "Flatimage" is filtered out of eXoDOS platforms (prevents duplicate library tab)

### Launch flow — CURRENT STATE (BROKEN for some games)

In `GameLauncher.launchGame()`, FlatImage games bypass the normal `exec()` + mapping system.

Current implementation (commit `2dcbec2`) — uses `./filename` relative path with cwd:

```typescript
if (opts.game.platform === "Flatimage") {
    const flatimageDir = path.dirname(gamePath);
    const flatimageFilename = `./${path.basename(gamePath)}`;
    const proc = spawn(flatimageFilename, [], {
        detached: true,
        stdio: ["ignore", "ignore", "pipe"],
        cwd: flatimageDir,
    });
    // stderr captured for 3 seconds then logged
    proc.unref();
    return;
}
```

**STATUS: Does not work for Age of Empires II HD (and possibly others).** Some FlatImages launch (PID confirmed), others show PID but no window appears.

### Launch flow — REFERENCE (working version)

From `docs/reference/GameLauncher.ref.js` — the user's working installation at `/media/fabien/jeux/ExodosLauncher/exogui`:

```javascript
// Detection by applicationPath extension, not platform field
if (opts.game.applicationPath.endsWith('.flatimage')) {
    const proc = spawn(fullPath, [], {
        detached: true,
        stdio: 'ignore'   // ALL streams ignored — not piped
    });
    proc.unref();
    return;
}
```

Key differences from current implementation:
1. **No `cwd`** — reference passes no working directory
2. **`stdio: 'ignore'`** — all 3 streams ignored (not `["ignore","ignore","pipe"]`)
3. **Absolute path** — `spawn(fullPath, ...)` not `spawn('./filename', ...)`
4. **Detection by file extension** — not by `platform` field (though in our version platform IS set to "Flatimage")

**The next fix to try:** revert to exact reference behavior — `spawn(absolutePath, [], { detached: true, stdio: 'ignore' })` with no `cwd`. This is confirmed working on the user's machine.

### Media folder structure

```
imagesDirectory/          (e.g. /media/fabien/jeux/ExodosLauncher/Images/Flatimage/)
  Box - Front/
    GameName-01.png
  Screenshot - Gameplay/
    GameName-01.png

videosDirectory/          (e.g. /media/fabien/jeux/ExodosLauncher/Videos/Flatimage/)
  GameName.mp4
```

Image filenames must follow the pattern `{GameTitle}-NN.ext` (e.g. `Dune-01.png`).
The game title used for matching is derived from `applicationPath` basename without extension.

### Platforms.xml

FlatImage games do NOT require `Platforms.xml`. If the file is missing (eXoDOS not configured), a warning is logged and eXoDOS games are skipped — FlatImage games still load normally.

## Known decisions

- `exodosPath` is NOT required for FlatImage-only usage.
- FlatImage images/videos are configured with `imagesDirectory` + `videosDirectory` (absolute paths to the platform-specific folders).
- The `fileServer.ts` routes `Images/Flatimage/` and `Videos/Flatimage/` requests to these custom directories.
- When FlatImage support is enabled, `gamesMiddleware.ts` filters "Flatimage" from eXoDOS platform list to prevent duplicate library tab.

## Reference files

All files in `docs/reference/` are compiled JS from the user's working FlatImage installation at `/media/fabien/jeux/ExodosLauncher/exogui`. They are ground truth for how things should work.

- `docs/reference/GameLauncher.ref.js` — launch logic summary
- `docs/reference/FlatimageGameManager.ref.js` — game manager summary  
- `docs/reference/GameLauncher.js` — full compiled GameLauncher from working version
- `docs/reference/FlatimageGameManager.js` — full compiled FlatimageGameManager from working version
- `docs/reference/ref.back.index.js` — full back process entry point from working version
- `docs/reference/ref.config.util.js` — config utilities from working version

## Upstream

This fork is based on [exogui/exogui](https://github.com/exogui/exogui). The upstream does NOT have FlatImage support — all FlatImage code is custom to this fork.

## Environment

- Dev machine: Ubuntu, `/home/projects/ProjetsClaude/exogui`
- Deployed on: Linux Mint, `/media/fabien/jeux/PCVaultLauncher`
- GitHub: https://github.com/flelard/PCVaultLauncher
- Deploy workflow: build on Ubuntu → push → `git pull && npm run build` on Linux Mint
- User does NOT modify code — relies entirely on Claude for all code changes
