"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameLauncher = void 0;
const CommandMapping_1 = require("../../shared/mappings/CommandMapping");
const Util_1 = require("../../shared/Util");
const child_process_1 = require("child_process");
const path = require("path");
//@TODO we probably doesn't need seperate launch functions for add apps, setup, etc.
// Only one function to launch file with mapper for different file types
var GameLauncher;
(function (GameLauncher) {
    const logSource = "Game Launcher";
    function launchCommand(appPath, // Ceci doit être un chemin ABSOLU FINAL
    appArgs, mappings, log) {
        const command = (0, CommandMapping_1.createCommand)(appPath, appArgs, mappings);
        const proc = (0, child_process_1.exec)(command.command, { cwd: command.cwd, shell: '/bin/bash' });
        logProcessOutput(proc, log);
        log({
            source: logSource,
            content: `Launch command (PID: ${proc.pid}) [ path: "${appPath}", arg: "${appArgs}", command: ${command.command} ]`,
        });
        return new Promise((resolve, reject) => {
            if (proc.killed) {
                resolve();
            }
            else {
                proc.once("exit", () => {
                    resolve();
                });
                proc.once("error", (error) => {
                    reject(error);
                });
            }
        });
    }
    GameLauncher.launchCommand = launchCommand;
    function launchAdditionalApplication(opts) {
        // @FIXTHIS It is not possible to open dialog windows from the back process (all electron APIs are undefined).
        switch (opts.addApp.applicationPath) {
            case ":message:":
                return opts
                    .openDialog({
                    type: "info",
                    title: "About This Game",
                    message: opts.addApp.launchCommand,
                    buttons: ["Ok"],
                })
                    .then();
            case ":extras:":
                const folderPath = (0, Util_1.fixSlashes)(path.join(opts.fpPath, path.posix.join("Extras", opts.addApp.launchCommand)));
                return opts
                    .openExternal(folderPath, { activate: true })
                    .catch((error) => {
                    if (error) {
                        opts.openDialog({
                            type: "error",
                            title: "Failed to Open Extras",
                            message: `${error.toString()}\n` +
                                `Path: ${folderPath}`,
                            buttons: ["Ok"],
                        });
                    }
                });
            default:
                // Pour les AddApps, on ne gère pas Flatimage spécifiquement ici.
                // Si une AddApp est elle-même un Flatimage, cela pourrait poser problème.
                // On garde la logique existante pour les AddApps.
                const appPath = (0, Util_1.fixSlashes)(path.join(opts.fpPath, getApplicationPath(opts.addApp.applicationPath, opts.execMappings, opts.native)));
                const appArgs = opts.addApp.launchCommand;
                const command = (0, CommandMapping_1.createCommand)(appPath, appArgs, opts.mappings);
                return new Promise((resolve, reject) => {
                    const proc = (0, child_process_1.exec)(command.command, { cwd: command.cwd, shell: '/bin/bash' });
                    logProcessOutput(proc, opts.log);
                    proc.once('exit', () => resolve());
                    proc.once('error', reject);
                });
        }
    }
    GameLauncher.launchAdditionalApplication = launchAdditionalApplication;
    /**
     * Launch a game
     * @param game Game to launch
     */
    async function launchGame(opts) {
        // Détection et lancement direct des Flatimages
        if (opts.game.applicationPath.endsWith('.flatimage')) {
            try {
                const { spawn } = require('child_process');
                const fs = require('fs');
                // Résoudre le chemin complet
                const fullPath = path.isAbsolute(opts.game.applicationPath)
                    ? opts.game.applicationPath
                    : path.join(opts.config.exodosPath, opts.game.applicationPath);
                // Vérifier que le fichier existe
                if (!fs.existsSync(fullPath)) {
                    opts.log({
                        source: logSource,
                        content: `Flatimage not found: ${fullPath}`,
                    });
                    return;
                }
                // Rendre exécutable
                fs.chmodSync(fullPath, '755');
                // Lancer directement
                const proc = spawn(fullPath, [], {
                    detached: true,
                    stdio: 'ignore'
                });
                proc.unref();
                opts.log({
                    source: logSource,
                    content: `Flatimage launched: "${opts.game.title}" (PID: ${proc.pid}) [applicationPath: "${fullPath}"]`,
                });
                return; // Sortir de la fonction, ne pas continuer avec la logique normale
            }
            catch (error) {
                opts.log({
                    source: logSource,
                    content: `Failed to launch Flatimage "${opts.game.title}": ${error}`,
                });
                return;
            }
        }
        // Abort if placeholder (placeholders are not "actual" games)
        if (opts.game.placeholder) {
            return;
        }
        // Run all provided additional applications with "AutoRunBefore" enabled
        if (opts.addApps) {
            const addAppOpts = {
                fpPath: opts.fpPath,
                native: opts.native,
                execMappings: opts.execMappings,
                mappings: opts.mappings,
                log: opts.log,
                openDialog: opts.openDialog,
                openExternal: opts.openExternal,
                config: opts.config, // IMPORTANT : Passez la config aux AddApps
            };
            for (let addApp of opts.addApps) {
                if (addApp.autoRunBefore) {
                    const promise = launchAdditionalApplication({
                        ...addAppOpts,
                        addApp,
                    });
                    if (addApp.waitForExit) {
                        await promise;
                    }
                }
            }
        }
        // Launch game
        let proc;
        // --- DÉBUT DE LA LOGIQUE DE CONSTRUCTION DU CHEMIN FINAL ---
        let finalApplicationPath;
        let relativeAppPath = getApplicationPath(opts.game.applicationPath, opts.execMappings, opts.native);
        if (opts.game.platform === "Flatimage") {
            // Pour les Flatimages, applicationPath est déjà le chemin complet
            finalApplicationPath = opts.game.applicationPath;
        }
        else {
            // Pour les autres plateformes (eXoDOS), le ApplicationPath du XML est relatif à exodosPath (fpPath).
            finalApplicationPath = (0, Util_1.fixSlashes)(path.join(opts.fpPath, relativeAppPath));
        }
        // --- FIN DE LA LOGIQUE DE CONSTRUCTION DU CHEMIN FINAL ---
        const gameArgs = opts.game.launchCommand;
        let command;
        try {
            // Utilisez finalApplicationPath pour créer la commande
            command = (0, CommandMapping_1.createCommand)(finalApplicationPath, gameArgs, opts.mappings);
        }
        catch (e) {
            opts.log({
                source: logSource,
                content: `Launch Game "${opts.game.title}" failed. Error: ${e}`,
            });
            return;
        }
        proc = (0, child_process_1.exec)(command.command, { cwd: command.cwd, shell: '/bin/bash' });
        logProcessOutput(proc, opts.log);
        opts.log({
            source: logSource,
            content: `Launch Game "${opts.game.title}" (PID: ${proc.pid}) [\n` +
                `    applicationPath: "${opts.game.applicationPath}",\n` +
                `    launchCommand:   "${opts.game.launchCommand}",\n` +
                `    finalApplicationPath: "${finalApplicationPath}",\n` + // Ajout pour le débogage
                `    command:         "${command.command}" ]`,
        });
    }
    GameLauncher.launchGame = launchGame;
    /**
     * Launch a game
     * @param game Game to launch
     */
    async function launchGameSetup(opts) {
        // Logique pour launchGameSetup (inchangée pour l'instant, si Flatimages n'ont pas de setups spécifiques)
        let proc;
        const setupPath = opts.game.applicationPath.replace((0, Util_1.getFilename)(opts.game.applicationPath), "install.command");
        // Ici aussi, il faudrait adapter si un Flatimage a un setup spécifique.
        // Pour l'instant, on suppose que les setups ne sont pas pour les Flatimages.
        const gamePath = (0, Util_1.fixSlashes)(path.join(opts.fpPath, // Utilise toujours exodosPath
        getApplicationPath(setupPath, opts.execMappings, opts.native)));
        const gameArgs = opts.game.launchCommand;
        const command = (0, CommandMapping_1.createCommand)(gamePath, gameArgs, opts.mappings);
        proc = (0, child_process_1.exec)(command.command, { cwd: command.cwd, shell: '/bin/bash' });
        logProcessOutput(proc, opts.log);
        opts.log({
            source: logSource,
            content: `Launch Game Setup "${opts.game.title}" (PID: ${proc.pid}) [\n` +
                `    applicationPath: "${opts.game.applicationPath}",\n` +
                `    launchCommand:   "${opts.game.launchCommand}",\n` +
                `    command:         "${command.command}" ]`,
        });
    }
    GameLauncher.launchGameSetup = launchGameSetup;
    /**
     * The paths provided in the Game/AdditionalApplication XMLs are only accurate
     * on Windows. So we replace them with other hard-coded paths here.
     */
    function getApplicationPath(filePath, execMappings, native) {
        const platform = process.platform;
        // Bat files won't work on Wine, force a .sh file on non-Windows platforms instead. Sh File may not exist.
        if (platform !== "win32" && filePath.endsWith(".bat")) {
            return filePath.substring(0, filePath.length - 4) + ".command";
        }
        // Skip mapping if on Windows or Native application was not requested
        if (platform !== "win32" && native) {
            for (let i = 0; i < execMappings.length; i++) {
                const mapping = execMappings[i];
                if (mapping.win32 === filePath) {
                    switch (platform) {
                        case "linux":
                            return mapping.linux || mapping.win32;
                        case "darwin":
                            return mapping.darwin || mapping.win32;
                        default:
                            return filePath;
                    }
                }
            }
        }
        // No Native exec found, return Windows/XML application path
        return filePath;
    }
    function logProcessOutput(proc, log) {
        const logStuff = (event, args) => {
            log({
                source: logSource,
                content: `${event} (PID: ${(0, Util_1.padStart)(proc.pid ?? -1, 5)}) ${(0, Util_1.stringifyArray)(args, stringifyArrayOpts)}`,
            });
        };
        doStuffs(proc, [/* 'close', */ "disconnect", "error", "exit", "message"], logStuff);
        if (proc.stdout) {
            proc.stdout.on("data", (data) => {
                logStuff("stdout", [data.toString("utf8")]);
            });
        }
        if (proc.stderr) {
            proc.stderr.on("data", (data) => {
                logStuff("stderr", [data.toString("utf8")]);
            });
        }
    }
})(GameLauncher || (exports.GameLauncher = GameLauncher = {}));
const stringifyArrayOpts = {
    trimStrings: true,
};
function doStuffs(emitter, events, callback) {
    for (let i = 0; i < events.length; i++) {
        const e = events[i];
        emitter.on(e, (...args) => {
            callback(e, args);
        });
    }
}
/**
 * Escape a string that will be used in a Windows shell (command line)
 * ( According to this: http://www.robvanderwoude.com/escapechars.php )
 */
function escapeWin(str) {
    return splitQuotes(str).reduce((acc, val, i) => acc + (i % 2 === 0 ? val.replace(/[\^&<>|]/g, "^$&") : `"${val}"`), "");
}
/**
 * Split a string to separate the characters wrapped in quotes from all other.
 * Example: '-a -b="123" "example.com"' => ['-a -b=', '123', ' ', 'example.com']
 * @param str String to split.
 * @returns Split of the argument string.
 *          Items with odd indices are wrapped in quotes.
 *          Items with even indices are NOT wrapped in quotes.
 */
function splitQuotes(str) {
    // Search for all pairs of quotes and split the string accordingly
    const splits = [];
    let start = 0;
    while (true) {
        const begin = str.indexOf('"', start);
        if (begin >= 0) {
            const end = str.indexOf('"', begin + 1);
            if (end >= 0) {
                splits.push(str.substring(start, begin));
                splits.push(str.substring(begin + 1, end));
                start = end + 1;
            }
            else {
                break;
            }
        }
        else {
            break;
        }
    }
    // Push remaining characters
    if (start < str.length) {
        splits.push(str.substring(start, str.length));
    }
    return splits;
}
const unityOutputResponses = [
    {
        text: "Failed to set registry keys!\r\n" + "Retry? (Y/n): ",
        fn(proc, openDialog) {
            openDialog({
                type: "warning",
                title: "Start Unity - Registry Key Warning",
                message: "Failed to set registry keys!\n" + "Retry?",
                buttons: ["Yes", "No"],
                defaultId: 0,
                cancelId: 1,
            }).then((response) => {
                if (!proc.stdin) {
                    throw new Error('Failed to signal to Unity starter. Can not access its "standard in".');
                }
                if (response === 0) {
                    proc.stdin.write("Y");
                }
                else {
                    proc.stdin.write("n");
                }
            });
        },
    },
    {
        text: "Invalid parameters!\r\n" +
            "Correct usage: startUnity [2.x|5.x] URL\r\n" +
            "If you need to undo registry changes made by this script, run unityRestoreRegistry.bat. \r\n" +
            "Press any key to continue . . . ",
        fn(proc, openDialog) {
            openDialog({
                type: "warning",
                title: "Start Unity - Invalid Parameters",
                message: "Invalid parameters!\n" +
                    "Correct usage: startUnity [2.x|5.x] URL\n" +
                    "If you need to undo registry changes made by this script, run unityRestoreRegistry.bat.",
                buttons: ["Ok"],
                defaultId: 0,
                cancelId: 0,
            });
        },
    },
    {
        text: "You must close the Basilisk browser to continue.\r\n" +
            "If you have already closed Basilisk, please wait a moment...\r\n",
        fn(proc, openDialog) {
            openDialog({
                type: "info",
                title: "Start Unity - Browser Already Open",
                message: "You must close the Basilisk browser to continue.\n" +
                    "If you have already closed Basilisk, please wait a moment...",
                buttons: ["Ok", "Cancel"],
                defaultId: 0,
                cancelId: 1,
            }).then((response) => {
                if (response === 1) {
                    proc.kill();
                }
            });
        },
    },
];
//# sourceMappingURL=GameLauncher.js.map