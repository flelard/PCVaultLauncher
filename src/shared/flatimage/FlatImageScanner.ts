import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { IGameCollection, IGameInfo } from "@shared/game/interfaces";
import { generateGameOrderTitle } from "@shared/game/GameParser";

const FLATIMAGE_PLATFORM = "Flatimage";

/**
 * Generates a deterministic UUID-like ID from a filename.
 * Stable across restarts as long as the filename doesn't change.
 */
function deterministicId(filename: string): string {
    const hash = crypto.createHash("sha1").update(filename).digest("hex");
    return [
        hash.slice(0, 8),
        hash.slice(8, 12),
        "4" + hash.slice(13, 16),
        ((parseInt(hash.slice(16, 18), 16) & 0x3f) | 0x80).toString(16) + hash.slice(18, 20),
        hash.slice(20, 32),
    ].join("-");
}

/**
 * Scans a directory for .flatimage files and returns a game collection.
 */
export function scanFlatImageDirectory(directory: string): IGameCollection {
    const collection: IGameCollection = {
        games: [],
        addApps: [],
    };

    if (!directory || !fs.existsSync(directory)) {
        return collection;
    }

    let entries: string[];
    try {
        entries = fs.readdirSync(directory);
    } catch {
        return collection;
    }

    for (const entry of entries) {
        if (!entry.toLowerCase().endsWith(".flatimage")) {
            continue;
        }

        const fullPath = path.join(directory, entry);
        const stat = fs.statSync(fullPath);
        if (!stat.isFile()) {
            continue;
        }

        // Ensure the file is executable
        try {
            fs.chmodSync(fullPath, stat.mode | 0o111);
        } catch {
            // Non-fatal: proceed even if chmod fails
        }

        const title = entry.slice(0, -".flatimage".length);
        const game: IGameInfo = {
            id: deterministicId(entry),
            title,
            convertedTitle: title,
            alternateTitles: "",
            series: "",
            developer: "",
            publisher: "",
            platform: FLATIMAGE_PLATFORM,
            dateAdded: "",
            playMode: "",
            status: "",
            notes: "",
            genre: "",
            source: "",
            applicationPath: fullPath,
            rootFolder: "",
            launchCommand: "",
            releaseYear: "",
            version: "",
            originalDescription: "",
            language: "",
            library: FLATIMAGE_PLATFORM,
            orderTitle: generateGameOrderTitle(title),
            placeholder: false,
            manualPath: "",
            musicPath: "",
            thumbnailPath: "",
            configurationPath: "",
            favorite: false,
            recommended: false,
            region: "",
            rating: "",
            maxPlayers: undefined,
            installed: true,
            media: {
                images: {},
                video: "",
            },
        };

        collection.games.push(game);
    }

    return collection;
}
