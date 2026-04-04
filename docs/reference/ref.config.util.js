"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDefaultConfigData = getDefaultConfigData;
exports.overwriteConfigData = overwriteConfigData;
const Util_1 = require("../Util");
const Coerce_1 = require("../utils/Coerce");
const ObjectParser_1 = require("../utils/ObjectParser");
const { num, str } = Coerce_1.Coerce;
/** Configuration par défaut pour Flatimage */
const flatimageConfigDefault = Object.freeze({
    enabled: true,
    flatimageDirectory: "/media/fabien/Jeux/JeuxGameImage",
    autoDetect: true,
    metadataCache: true,
});
/** Default config values used as a "base" for the different platform defaults. */
const configDataDefaultBase = Object.freeze({
    exodosPath: "../",
    imageFolderPath: "Images",
    logoFolderPath: "Data/Logos",
    playlistFolderPath: "Data/Playlists",
    jsonFolderPath: "Data",
    platformFolderPath: "Data/Platforms",
    themeFolderPath: "Data/Themes",
    useCustomTitlebar: false,
    backPortMin: 12001,
    backPortMax: 12100,
    imagesPortMin: 12101,
    imagesPortMax: 12200,
    nativePlatforms: [],
    flatimage: flatimageConfigDefault, // ← Cette ligne est ajoutée
});
/**
 * Default config values for the different platforms.
 * All platforms not listed here use will use the base.
 */
const configDataDefaults = {
    // Windows
    win32: Object.freeze(overwriteConfigData((0, Util_1.deepCopy)(configDataDefaultBase), {
        useCustomTitlebar: true,
    })),
    // Linux
    linux: Object.freeze(overwriteConfigData((0, Util_1.deepCopy)(configDataDefaultBase), {
        useCustomTitlebar: false,
    })),
    // ...
};
/**
 * Get the default config data for a specific platform.
 * @param platform Platform to get the defaults for.
 */
function getDefaultConfigData(platform) {
    return configDataDefaults[platform] || configDataDefaultBase;
}
/**
 * Overwrite a config data object with data from another object.
 * @param source Object to overwrite.
 * @param data Object with data to overwrite the source with.
 * @returns Source argument (not a copy).
 */
function overwriteConfigData(source, data, onError) {
    const parser = new ObjectParser_1.ObjectParser({
        input: data,
        onError: onError &&
            ((e) => onError(`Error while parsing Config: ${e.toString()}`)),
    });
    parser.prop("exodosPath", (v) => (source.exodosPath = (0, Util_1.parseVarStr)(str(v))));
    parser.prop("imageFolderPath", (v) => (source.imageFolderPath = (0, Util_1.parseVarStr)(str(v))));
    parser.prop("logoFolderPath", (v) => (source.logoFolderPath = (0, Util_1.parseVarStr)(str(v))));
    parser.prop("playlistFolderPath", (v) => (source.playlistFolderPath = (0, Util_1.parseVarStr)(str(v))));
    parser.prop("jsonFolderPath", (v) => (source.jsonFolderPath = (0, Util_1.parseVarStr)(str(v))));
    parser.prop("platformFolderPath", (v) => (source.platformFolderPath = (0, Util_1.parseVarStr)(str(v))));
    parser.prop("themeFolderPath", (v) => (source.themeFolderPath = (0, Util_1.parseVarStr)(str(v))));
    parser.prop("useCustomTitlebar", (v) => (source.useCustomTitlebar = !!v));
    parser.prop("nativePlatforms", (v) => (source.nativePlatforms = strArray(v)));
    parser.prop("backPortMin", (v) => (source.backPortMin = num(v)));
    parser.prop("backPortMax", (v) => (source.backPortMax = num(v)));
    parser.prop("imagesPortMin", (v) => (source.imagesPortMin = num(v)));
    parser.prop("imagesPortMax", (v) => (source.imagesPortMax = num(v)));
    parser.prop("flatimage", (v) => {
        if (typeof v === 'object' && v !== null) {
            const flatimageParser = new ObjectParser_1.ObjectParser({ input: v });
            flatimageParser.prop("enabled", (val) => (source.flatimage.enabled = !!val));
            flatimageParser.prop("flatimageDirectory", (val) => (source.flatimage.flatimageDirectory = str(val)));
            flatimageParser.prop("autoDetect", (val) => (source.flatimage.autoDetect = !!val));
            flatimageParser.prop("metadataCache", (val) => (source.flatimage.metadataCache = !!val));
        }
    });
    // Do some alterations
    source.exodosPath = (0, Util_1.fixSlashes)(source.exodosPath); // (Clean path)
    // Return
    return source;
}
function strArray(array) {
    return Array.isArray(array)
        ? Array.prototype.map.call(array, (v) => str(v))
        : [];
}
//# sourceMappingURL=util.js.map