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
| `src/renderer/util/media.ts` | `loadPlatformImages(platform, basePath?)` / `loadPlatformVideos(platform, basePath?)` |
| `src/renderer/components/pages/ConfigPage.tsx` | UI for FlatImage config section |
| `src/back/game/GameLauncher.ts` | Special detached spawn for Flatimage platform |
| `mappings.linux.json` | Contains `flatimage` extension entry (direct execution, setCwdToFileDir) |

### Config fields (`config.json` → `flatimage` object)

```json
{
  "flatimage": {
    "enabled": true,
    "flatimageDirectory": "/path/to/flatimage/files",
    "autoDetect": true,
    "metadataCache": true,
    "mediaDirectory": "/path/to/media/base"
  }
}
```

- `flatimageDirectory`: folder containing `.flatimage` executables
- `mediaDirectory`: base folder that contains `Images/Flatimage/` and `Videos/Flatimage/` subfolders. If empty, falls back to `exodosPath`.

### Game loading flow

1. `gamesMiddleware.ts` calls `scanFlatImageDirectory(flatimageDirectory)`
2. Scanner lists all `.flatimage` files, creates `IGameInfo` objects with:
   - `platform: "Flatimage"`
   - `library: "Flatimage"`
   - `applicationPath`: absolute path to the `.flatimage` file
   - `launchCommand: ""`
   - Deterministic ID from SHA1 hash of filename
3. Media is loaded via `loadPlatformImages("Flatimage", imagesBase)` where `imagesBase = mediaDirectory + "/Images"`
4. Games are added to the main collection under library `"Flatimage"`

### Launch flow

In `GameLauncher.launchGame()`, FlatImage games bypass the normal `exec()` + mapping system.
Instead, they use `spawn()` with `detached: true` + `proc.unref()`.

**Why?** FlatImages (like AppImages) use Linux user namespaces and/or FUSE to mount themselves. Running them as a child of an Electron process via `exec()` can prevent them from setting up their namespace environment. Spawning as a detached process avoids this.

```typescript
// Special case in launchGame():
if (opts.game.platform === "Flatimage") {
    const cwd = path.dirname(gamePath);
    const proc = spawn(gamePath, [], { detached: true, stdio: "ignore", cwd, env: process.env });
    proc.unref();
    return;
}
```

### Media folder structure

```
{mediaDirectory}/
  Images/
    Flatimage/
      Box - Front/
        GameName-01.png
      Screenshot - Gameplay/
        GameName-01.png
  Videos/
    Flatimage/
      GameName.mp4
```

Image filenames must follow the pattern `{GameTitle}-NN.ext` (e.g. `Dune-01.png`).
The game title used for matching is the `.flatimage` filename without extension.

### Platforms.xml

FlatImage games do NOT require `Platforms.xml`. If the file is missing (eXoDOS not configured), a warning is logged and eXoDOS games are skipped — FlatImage games still load normally.

## Known decisions

- `exodosPath` is NOT required for FlatImage-only usage. Set `mediaDirectory` to point to your media folder instead.
- FlatImage platform is always treated as "native" (`native: true` in launch options).
- The `.flatimage` mapping in `mappings.linux.json` exists but is bypassed by the special spawn logic.

## Upstream

This fork is based on [exogui/exogui](https://github.com/exogui/exogui). The upstream does NOT have FlatImage support — all FlatImage code is custom to this fork.
