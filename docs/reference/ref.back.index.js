"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onGameUpdated = onGameUpdated;
const types_1 = require("../shared/back/types");
const util_1 = require("../shared/config/util");
const PreferencesFile_1 = require("../shared/preferences/PreferencesFile");
const util_2 = require("../shared/preferences/util");
const Util_1 = require("../shared/Util");
const Coerce_1 = require("../shared/utils/Coerce");
const path = require("path");
const WebSocket = require("ws");
const uuid_1 = require("uuid");
const events_1 = require("events");
const ConfigFile_1 = require("./config/ConfigFile");
const Execs_1 = require("./Execs");
const GameLauncher_1 = require("./game/GameLauncher");
const misc_1 = require("./util/misc");
const fileServer_1 = require("./backend/fileServer");
const PlaylistManager_1 = require("./playlist/PlaylistManager");
const interfaces_1 = require("../shared/mappings/interfaces");
const VlcPlayer_1 = require("./VlcPlayer");
const FlatimageGameManager_1 = require("./FlatimageGameManager");
const send = process.send
    ? process.send.bind(process)
    : () => {
        throw new Error("process.send is undefined.");
    };
const state = {
    isInitialized: false,
    isExit: false,
    server: (0, Util_1.createErrorProxy)("server"),
    fileServer: undefined,
    secret: (0, Util_1.createErrorProxy)("secret"),
    preferences: (0, Util_1.createErrorProxy)("preferences"),
    config: (0, Util_1.createErrorProxy)("config"),
    configFolder: (0, Util_1.createErrorProxy)("configFolder"),
    exePath: (0, Util_1.createErrorProxy)("exePath"),
    basePath: (0, Util_1.createErrorProxy)("basePath"),
    localeCode: (0, Util_1.createErrorProxy)("countryCode"),
    playlistManager: new PlaylistManager_1.PlaylistManager(),
    messageQueue: [],
    isHandling: false,
    messageEmitter: new events_1.EventEmitter(),
    init: {
        0: false,
        1: false,
    },
    initEmitter: new events_1.EventEmitter(),
    logs: [],
    themeFiles: [],
    execMappings: [],
    queries: {},
    commandMappings: {
        defaultMapping: interfaces_1.DefaultCommandMapping,
        commandsMapping: [],
    },
    vlcPlayer: (0, Util_1.createErrorProxy)("vlcPlayer"),
};
const preferencesFilename = "preferences.json";
const configFilename = "config.json";
const commandMappingsFilename = "mappings.json";
process.on("message", initialize);
process.on("disconnect", () => {
    exit();
});
async function initialize(message, _) {
    if (state.isInitialized) {
        return;
    }
    state.isInitialized = true;
    const content = JSON.parse(message);
    state.secret = content.secret;
    state.configFolder = content.configFolder;
    state.localeCode = content.localeCode;
    state.exePath = content.exePath;
    state.basePath = content.basePath;
    state.preferences = await PreferencesFile_1.PreferencesFile.readOrCreateFile(path.join(state.configFolder, preferencesFilename));
    state.config = await ConfigFile_1.ConfigFile.readOrCreateFile(path.join(state.configFolder, configFilename));
    try {
        state.commandMappings = await (0, Util_1.readJsonFile)(path.join(state.configFolder, commandMappingsFilename));
    }
    catch (e) {
        console.error(`Cannot load mappings file. ${e}. Check if file exists and have valid values. Without that file most of the entries won't work.`);
    }
    await ConfigFile_1.ConfigFile.readOrCreateFile(path.join(state.configFolder, configFilename));
    if (!path.isAbsolute(state.config.exodosPath)) {
        state.config.exodosPath = path.join(state.basePath, state.config.exodosPath);
    }
    console.log("Exodos path: " + state.config.exodosPath);
    console.info(`Starting exogui with ${state.config.exodosPath} exodos path.`);
    console.log("Starting directory: " + process.cwd());
    try {
        process.chdir(state.configFolder);
        console.log("New directory: " + state.configFolder);
    }
    catch (err) {
        console.log("chdir: " + err);
    }
    await initializePlaylistManager();
    // Load Exec Mappings
    (0, Execs_1.loadExecMappingsFile)(path.join(state.config.exodosPath, state.config.jsonFolderPath), (content) => log({ source: "Launcher", content }))
        .then((data) => {
        state.execMappings = data;
    })
        .catch((error) => {
        log({
            source: "Launcher",
            content: `Failed to load exec mappings file. Ignore if on Windows. - ${error}`,
        });
    })
        .finally(() => {
        state.init[types_1.BackInit.EXEC] = true;
        state.initEmitter.emit(types_1.BackInit.EXEC);
    });
    state.fileServer = new fileServer_1.FileServer(state.config, log);
    await state.fileServer.start();
    const serverPort = await startMainServer(content.acceptRemote);
    if (serverPort < 0) {
        setImmediate(exit);
    }
    // Initialize VLC player
    try {
        switch (process.platform) {
            case 'win32': {
                state.vlcPlayer = new VlcPlayer_1.VlcPlayer(path.join(state.config.exodosPath, 'ThirdParty\\VLC\\x64\\vlc.exe'), [], state.preferences.vlcPort, state.preferences.gameMusicVolume);
                break;
            }
            default: {
                console.log('Disabled VLC player (unsupported on this operating system)');
                break;
            }
        }
    }
    catch (err) {
        log({
            source: 'VLC',
            content: `${err}`
        });
        console.log(`Error starting VLC server: ${err}`);
    }
    send(serverPort);
}
const startMainServer = async (acceptRemote) => new Promise((resolve) => {
    const minPort = state.config.backPortMin;
    const maxPort = state.config.backPortMax;
    let port = minPort - 1;
    let server;
    tryListen();
    function tryListen() {
        if (server) {
            server.off("error", onError);
            server.off("listening", onceListening);
        }
        if (port++ < maxPort) {
            server = new WebSocket.Server({
                host: acceptRemote ? undefined : "127.0.0.1",
                port: port,
            });
            server.on("error", onError);
            server.on("listening", onceListening);
        }
        else {
            done(new Error(`Failed to open server. All attempted ports are already in use (Ports: ${minPort} - ${maxPort}).`));
        }
    }
    function onError(error) {
        if (error.code === "EADDRINUSE") {
            tryListen();
        }
        else {
            done(error);
        }
    }
    function onceListening() {
        done(undefined);
    }
    function done(error) {
        if (server) {
            server.off("error", onError);
            server.off("listening", onceListening);
            state.server = server;
            state.server.on("connection", onConnect);
        }
        if (error) {
            log({
                source: "Back",
                content: "Failed to open WebSocket server.\n" + error,
            });
            resolve(-1);
        }
        else {
            resolve(port);
        }
    }
});
async function initializePlaylistManager() {
    const playlistFolder = path.join(state.config.exodosPath, state.config.playlistFolderPath);
    const onPlaylistAddOrUpdate = function (playlist) {
        const hashes = Object.keys(state.queries);
        for (let hash of hashes) {
            const cache = state.queries[hash];
            if (cache.query.playlistId === playlist.filename) {
                delete state.queries[hash];
            }
        }
        broadcast({
            id: "",
            type: types_1.BackOut.PLAYLIST_UPDATE,
            data: playlist,
        });
    };
    state.playlistManager.init({
        playlistFolder,
        log,
        onPlaylistAddOrUpdate,
    });
    state.init[types_1.BackInit.PLAYLISTS] = true;
    state.initEmitter.emit(types_1.BackInit.PLAYLISTS);
}
function onConnect(socket, _) {
    socket.onmessage = function onAuthMessage(event) {
        if (event.data === state.secret) {
            socket.onmessage = onMessageWrap;
            socket.send("auth successful");
        }
        else {
            socket.close();
        }
    };
}
async function onMessageWrap(event) {
    const [req, error] = parseWrappedRequest(event.data);
    if (error || !req) {
        console.error("Failed to parse incoming WebSocket request (see error below):\n", error);
        return;
    }
    if (req.type === types_1.BackIn.GENERIC_RESPONSE) {
        state.messageEmitter.emit(req.id, req);
    }
    else {
        state.messageQueue.push(event);
        if (!state.isHandling) {
            state.isHandling = true;
            while (state.messageQueue.length > 0) {
                const message = state.messageQueue.shift();
                if (message) {
                    await onMessage(message);
                }
            }
            state.isHandling = false;
        }
    }
}
async function onMessage(event) {
    const [req, error] = parseWrappedRequest(event.data);
    if (error || !req) {
        console.error("Failed to parse incoming WebSocket request (see error below):\n", error);
        return;
    }
    state.messageEmitter.emit(req.id, req);
    switch (req.type) {
        case types_1.BackIn.ADD_LOG:
            {
                const reqData = req.data;
                log(reqData, req.id);
            }
            break;
        case types_1.BackIn.GET_MAIN_INIT_DATA:
            {
                respond(event.target, {
                    id: req.id,
                    type: types_1.BackOut.GET_MAIN_INIT_DATA,
                    data: {
                        preferences: state.preferences,
                        config: state.config,
                    },
                });
            }
            break;
        case types_1.BackIn.GET_RENDERER_INIT_DATA:
            {
                respond(event.target, {
                    id: req.id,
                    type: types_1.BackOut.GENERIC_RESPONSE,
                    data: {
                        preferences: state.preferences,
                        config: state.config,
                        commandMappings: state.commandMappings,
                        fileServerPort: state.fileServer?.port ?? -1,
                        log: state.logs,
                        themes: state.themeFiles.map((theme) => ({
                            entryPath: theme.entryPath,
                            meta: theme.meta,
                        })),
                        playlists: state.init[types_1.BackInit.PLAYLISTS]
                            ? state.playlistManager.playlists
                            : undefined,
                        localeCode: state.localeCode,
                    },
                });
            }
            break;
        case types_1.BackIn.INIT_LISTEN:
            {
                const done = [];
                for (let key in state.init) {
                    const init = key;
                    if (state.init[init]) {
                        done.push(init);
                    }
                    else {
                        state.initEmitter.once(init, () => {
                            respond(event.target, {
                                id: "",
                                type: types_1.BackOut.INIT_EVENT,
                                data: { done: [init] },
                            });
                        });
                    }
                }
                respond(event.target, {
                    id: req.id,
                    type: types_1.BackOut.INIT_EVENT,
                    data: { done },
                });
            }
            break;
        case types_1.BackIn.SET_LOCALE:
            {
                const reqData = req.data;
                state.localeCode = reqData;
                respond(event.target, {
                    id: req.id,
                    type: types_1.BackOut.LOCALE_UPDATE,
                    data: reqData,
                });
            }
            break;
        case types_1.BackIn.GET_EXEC:
            {
                respond(event.target, {
                    id: req.id,
                    type: types_1.BackOut.GENERIC_RESPONSE,
                    data: state.execMappings,
                });
            }
            break;
        case types_1.BackIn.LAUNCH_ADDAPP:
            {
                const reqData = req.data;
                const { game, addApp } = reqData;
                if (addApp) {
                    GameLauncher_1.GameLauncher.launchAdditionalApplication({
                        addApp,
                        fpPath: path.resolve(state.config.exodosPath),
                        native: (game && state.config.nativePlatforms.some(p => p === game.platform)) || false,
                        mappings: state.commandMappings,
                        execMappings: state.execMappings,
                        log: log,
                        openDialog: openDialog(event.target),
                        openExternal: openExternal(event.target),
                        config: state.config, // <-- CORRECTION: Passer la config
                    });
                    break;
                }
                respond(event.target, {
                    id: req.id,
                    type: types_1.BackOut.GENERIC_RESPONSE,
                    data: undefined,
                });
            }
            break;
        case types_1.BackIn.LAUNCH_COMMAND:
            {
                const reqData = req.data;
                const appPath = (0, Util_1.fixSlashes)(path.join(path.resolve(state.config.exodosPath), reqData.path));
                GameLauncher_1.GameLauncher.launchCommand(appPath, "", state.commandMappings, log);
                respond(event.target, {
                    id: req.id,
                    type: types_1.BackOut.GENERIC_RESPONSE,
                    data: undefined,
                });
            }
            break;
        case types_1.BackIn.LAUNCH_GAME:
            {
                const reqData = req.data;
                // state.vlcPlayer?.stop(); // <-- CORRECTION: Laisser commenté
                const { game, addApps } = reqData;
                if (game) {
                    GameLauncher_1.GameLauncher.launchGame({
                        game,
                        addApps,
                        fpPath: path.resolve(state.config.exodosPath),
                        native: state.config.nativePlatforms.some(p => p === game.platform),
                        execMappings: state.execMappings,
                        mappings: state.commandMappings,
                        log,
                        openDialog: openDialog(event.target),
                        openExternal: openExternal(event.target),
                        config: state.config, // <-- CORRECTION: Passer la config
                    });
                }
                respond(event.target, {
                    id: req.id,
                    type: types_1.BackOut.GENERIC_RESPONSE,
                    data: undefined,
                });
            }
            break;
        case types_1.BackIn.LAUNCH_GAME_SETUP:
            {
                const reqData = req.data;
                const { game, addApps } = reqData;
                if (game) {
                    GameLauncher_1.GameLauncher.launchGameSetup({
                        game,
                        addApps,
                        fpPath: path.resolve(state.config.exodosPath),
                        native: state.config.nativePlatforms.some(p => p === game.platform),
                        mappings: state.commandMappings,
                        execMappings: state.execMappings,
                        log,
                        openDialog: openDialog(event.target),
                        openExternal: openExternal(event.target),
                        config: state.config, // <-- CORRECTION: Passer la config
                    });
                }
                respond(event.target, {
                    id: req.id,
                    type: types_1.BackOut.GENERIC_RESPONSE,
                    data: undefined,
                });
            }
            break;
        case types_1.BackIn.UPDATE_CONFIG:
            {
                const reqData = req.data;
                const newConfig = (0, Util_1.deepCopy)(state.config);
                (0, util_1.overwriteConfigData)(newConfig, reqData);
                try {
                    await ConfigFile_1.ConfigFile.saveFile(path.join(state.configFolder, configFilename), newConfig);
                }
                catch (error) {
                    log({ source: "Launcher", content: error?.toString() ?? "" });
                }
                respond(event.target, {
                    id: req.id,
                    type: types_1.BackOut.GENERIC_RESPONSE,
                });
            }
            break;
        case types_1.BackIn.PLAY_AUDIO_FILE:
            {
                try {
                    if (state.preferences.gameMusicPlay) {
                        console.log(`Playing: ${req.data}`);
                        // await state.vlcPlayer?.play(req.data); // <-- CORRECTION: Laisser commenté
                    }
                    else {
                        // state.vlcPlayer?.setFile(req.data); // <-- CORRECTION: Laisser commenté
                    }
                }
                catch (err) {
                    log({ source: 'VLC', content: `${err}` });
                    console.log(err);
                }
            }
            break;
        case types_1.BackIn.TOGGLE_MUSIC:
            {
                try {
                    if (req.data) {
                        // await state.vlcPlayer?.resume(); // <-- CORRECTION: Laisser commenté
                    }
                    else {
                        // await state.vlcPlayer?.stop(); // <-- CORRECTION: Laisser commenté
                    }
                }
                catch (err) {
                    log({ source: 'VLC', content: `${err}` });
                    console.log(err);
                }
            }
            break;
        case types_1.BackIn.SET_VOLUME:
            {
                try {
                    // state.vlcPlayer?.setVol(req.data); // <-- CORRECTION: Laisser commenté
                }
                catch (err) {
                    log({ source: 'VLC', content: `${err}` });
                    console.log(err);
                }
            }
            break;
        case types_1.BackIn.UPDATE_PREFERENCES:
            {
                const dif = (0, misc_1.difObjects)(util_2.defaultPreferencesData, state.preferences, req.data);
                if (dif) {
                    (0, util_2.overwritePreferenceData)(state.preferences, dif);
                    await PreferencesFile_1.PreferencesFile.saveFile(path.join(state.configFolder, preferencesFilename), state.preferences);
                }
                respond(event.target, {
                    id: req.id,
                    type: types_1.BackOut.UPDATE_PREFERENCES_RESPONSE,
                    data: state.preferences,
                });
            }
            break;
        case types_1.BackIn.GET_PLAYLISTS:
            {
                respond(event.target, {
                    id: req.id,
                    type: types_1.BackOut.GENERIC_RESPONSE,
                    data: state.playlistManager.playlists,
                });
            }
            break;
        case types_1.BackIn.QUIT:
            {
                respond(event.target, {
                    id: req.id,
                    type: types_1.BackOut.QUIT,
                });
                exit();
            }
            break;
        case types_1.BackIn.SCAN_FLATIMAGES:
            {
                if (state.config?.flatimage?.enabled) {
                    const manager = new FlatimageGameManager_1.FlatimageGameManager(state.config.flatimage, state.config.exodosPath);
                    const games = await manager.scanFlatimages();
                    respond(event.target, { id: req.id, type: types_1.BackOut.GENERIC_RESPONSE, data: games });
                }
                else {
                    respond(event.target, { id: req.id, type: types_1.BackOut.GENERIC_RESPONSE, data: [] });
                }
            }
            break;
        case types_1.BackIn.LAUNCH_FLATIMAGE:
            {
                const gameData = req.data;
                if (state.config?.flatimage?.enabled) {
                    const manager = new FlatimageGameManager_1.FlatimageGameManager(state.config.flatimage, state.config.exodosPath);
                    await manager.launchFlatimage(gameData);
                }
                respond(event.target, { id: req.id, type: types_1.BackOut.GENERIC_RESPONSE });
            }
            break;
    }
}
function exit() {
    if (!state.isExit) {
        state.isExit = true;
        Promise.all([
            (0, Util_1.isErrorProxy)(state.server) ? undefined : new Promise((resolve) => state.server.close((error) => {
                if (error) {
                    console.warn("An error occurred whie closing the WebSocket server.", error);
                }
                resolve();
            })),
            new Promise((resolve) => state.fileServer?.server.close((error) => {
                if (error) {
                    console.warn("An error occurred whie closing the file server.", error);
                }
                resolve();
            })),
        ]).then(() => { process.exit(); });
    }
}
function onGameUpdated(game) {
    if (!(0, Util_1.isErrorProxy)(state.server)) {
        const res = {
            id: "",
            type: types_1.BackOut.GAME_CHANGE,
            data: game,
        };
        const message = JSON.stringify(res);
        state.server.clients.forEach((socket) => {
            if (socket.onmessage === onMessageWrap) {
                console.log(`Broadcast: ${types_1.BackOut[res.type]}`);
                socket.send(message);
            }
        });
    }
}
function respond(target, response) {
    target.send(JSON.stringify(response));
}
function broadcast(response) {
    let count = 0;
    if (!(0, Util_1.isErrorProxy)(state.server)) {
        const message = JSON.stringify(response);
        state.server.clients.forEach((socket) => {
            if (socket.onmessage === onMessageWrap) {
                console.log(`Broadcast: ${types_1.BackOut[response.type]}`);
                socket.send(message);
                count += 1;
            }
        });
    }
    return count;
}
function log(preEntry, id) {
    const entry = {
        source: preEntry.source,
        content: preEntry.content,
        timestamp: Date.now(),
    };
    if (typeof entry.source !== "string") {
        console.warn(`Type Warning! A log entry has a source of an incorrect type!\n  Type: "${typeof entry.source}"\n  Value: "${entry.source}"`);
        entry.source = entry.source + "";
    }
    if (typeof entry.content !== "string") {
        console.warn(`Type Warning! A log entry has content of an incorrect type!\n  Type: "${typeof entry.content}"\n  Value: "${entry.content}"`);
        entry.content = entry.content + "";
    }
    state.logs.push(entry);
    broadcast({
        id: id || "",
        type: types_1.BackOut.LOG_ENTRY_ADDED,
        data: {
            entry,
            index: state.logs.length - 1,
        },
    });
}
function openDialog(target) {
    return (options) => {
        return new Promise((resolve, _) => {
            const id = (0, uuid_1.v4)();
            state.messageEmitter.once(id, (req) => {
                const reqData = req.data;
                resolve(reqData);
            });
            respond(target, { id, data: options, type: types_1.BackOut.OPEN_DIALOG });
        });
    };
}
function openExternal(target) {
    return (url, options) => {
        return new Promise((resolve, reject) => {
            const id = (0, uuid_1.v4)();
            state.messageEmitter.once(id, (req) => {
                if (req.data && req.data.error) {
                    const error = new Error();
                    error.name = req.data.error.name;
                    error.message = req.data.error.message;
                    error.stack = req.data.error.stack;
                    reject(error);
                }
                else {
                    resolve();
                }
            });
            respond(target, { id, data: { url, options }, type: types_1.BackOut.OPEN_EXTERNAL });
        });
    };
}
function parseWrappedRequest(data) {
    let str;
    if (typeof data === "string") {
        // Déjà une chaîne
        str = data;
    }
    else if (Buffer.isBuffer(data)) {
        // Cas d'un Buffer unique
        str = data.toString();
    }
    else if (Array.isArray(data)) {
        // Cas d'un tableau de buffers (ou Uint8Array[])
        str = Buffer.concat(data).toString();
    }
    else {
        // Cas ArrayBuffer
        str = Buffer.from(data).toString();
    }
    if (typeof str !== "string") {
        return [
            undefined,
            new Error('Failed to parse WrappedRequest. Failed to convert "data" into a string.'),
        ];
    }
    // Parsing JSON
    let json;
    try {
        json = JSON.parse(str);
    }
    catch (error) {
        if (error && typeof error === "object" && "message" in error) {
            error.message =
                'Failed to parse WrappedRequest. Failed to convert "data" into an object.\n' +
                    Coerce_1.Coerce.str(error.message);
        }
        return [undefined, error];
    }
    // Résultat typé
    const result = {
        id: Coerce_1.Coerce.str(json.id),
        type: Coerce_1.Coerce.num(json.type),
        data: json.data,
    };
    return [result, undefined];
}
//# sourceMappingURL=index.js.map