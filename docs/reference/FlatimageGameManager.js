"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FlatimageGameManager = void 0;
const fs = require("fs");
const path = require("path");
const util_1 = require("util");
const child_process_1 = require("child_process");
const readdir = (0, util_1.promisify)(fs.readdir);
const stat = (0, util_1.promisify)(fs.stat);
const execPromise = (0, util_1.promisify)(child_process_1.exec);
class FlatimageGameManager {
    config;
    metadataCache = new Map();
    constructor(config, exodosPath) {
        this.config = config;
        // Résoudre le chemin relatif par rapport à exodosPath
        if (!path.isAbsolute(this.config.flatimageDirectory)) {
            this.config.flatimageDirectory = path.resolve(exodosPath, this.config.flatimageDirectory);
        }
    }
    async scanFlatimages() {
        console.log(`Scanning Flatimages in: ${this.config.flatimageDirectory}`);
        try {
            const flatimageFiles = await this.findFlatimageFiles();
            const games = [];
            for (const filePath of flatimageFiles) {
                try {
                    const metadata = await this.extractMetadata(filePath);
                    const game = this.createGameFromFlatimage(filePath, metadata);
                    games.push(game);
                }
                catch (error) {
                    console.error(`Erreur lors du traitement de ${filePath}:`, error);
                }
            }
            console.log(`Trouvé ${games.length} jeux Flatimage`);
            return games;
        }
        catch (error) {
            console.error('Erreur lors du scan des Flatimages:', error);
            return [];
        }
    }
    async findFlatimageFiles() {
        if (!fs.existsSync(this.config.flatimageDirectory)) {
            console.warn(`Le répertoire Flatimage n'existe pas: ${this.config.flatimageDirectory}`);
            return [];
        }
        const files = await readdir(this.config.flatimageDirectory);
        const flatimageFiles = [];
        for (const file of files) {
            if (file.toLowerCase().endsWith('.flatimage')) {
                const fullPath = path.join(this.config.flatimageDirectory, file);
                const fileStats = await stat(fullPath);
                if (fileStats.isFile()) {
                    flatimageFiles.push(fullPath);
                }
            }
        }
        return flatimageFiles;
    }
    async extractMetadata(filePath) {
        const fileName = path.basename(filePath, '.flatimage');
        const fileStats = await stat(filePath);
        // Vérifier le cache si activé
        if (this.config.metadataCache && this.metadataCache.has(filePath)) {
            const cached = this.metadataCache.get(filePath);
            if (cached.lastModified.getTime() === fileStats.mtime.getTime()) {
                return cached;
            }
        }
        const metadata = {
            title: this.cleanGameTitle(fileName),
            size: fileStats.size,
            lastModified: fileStats.mtime
        };
        // Essayer d'extraire plus d'infos depuis le nom du fichier
        metadata.genre = this.extractGenreFromName(fileName);
        metadata.releaseDate = this.extractYearFromName(fileName);
        // Chercher une image de capture d'écran
        metadata.screenshot = await this.findScreenshot(filePath);
        // Mettre en cache si activé
        if (this.config.metadataCache) {
            this.metadataCache.set(filePath, metadata);
        }
        return metadata;
    }
    cleanGameTitle(fileName) {
        // Nettoyer le nom du fichier pour en faire un titre présentable
        return fileName
            .replace(/[._-]/g, ' ')
            .replace(/\s+/g, ' ')
            .replace(/\b\w/g, l => l.toUpperCase())
            .trim();
    }
    extractGenreFromName(fileName) {
        const genres = ['action', 'adventure', 'rpg', 'strategy', 'simulation', 'sports', 'racing', 'puzzle'];
        const lowerName = fileName.toLowerCase();
        for (const genre of genres) {
            if (lowerName.includes(genre)) {
                return genre.charAt(0).toUpperCase() + genre.slice(1);
            }
        }
        return undefined;
    }
    extractYearFromName(fileName) {
        const yearMatch = fileName.match(/\b(19|20)\d{2}\b/);
        return yearMatch ? yearMatch[0] : undefined;
    }
    async findScreenshot(flatimageePath) {
        const baseName = path.basename(flatimageePath, '.flatimage');
        const directory = path.dirname(flatimageePath);
        const possibleExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.bmp'];
        for (const ext of possibleExtensions) {
            const screenshotPath = path.join(directory, baseName + ext);
            if (fs.existsSync(screenshotPath)) {
                return screenshotPath;
            }
        }
        return undefined;
    }
    createGameFromFlatimage(filePath, metadata) {
        const fileName = path.basename(filePath, '.flatimage');
        return {
            // Champs de IPureGameInfo
            id: `flatimage_${fileName}`,
            title: metadata.title,
            convertedTitle: metadata.title,
            alternateTitles: '',
            series: metadata.genre || 'Flatimage Games',
            developer: metadata.developer || 'Unknown',
            publisher: metadata.publisher || 'Unknown',
            dateAdded: new Date().toISOString(),
            platform: 'Flatimage',
            playMode: 'Single Player',
            status: 'Playable',
            notes: `Jeu Flatimage - Taille: ${this.formatFileSize(metadata.size)}`,
            genre: metadata.genre || '',
            source: 'Flatimage',
            applicationPath: path.join('JeuxGameImage', path.basename(filePath)),
            rootFolder: path.dirname(filePath),
            launchCommand: '',
            releaseYear: metadata.releaseDate || '',
            version: '1.0',
            originalDescription: metadata.description || '',
            language: 'French',
            favorite: false,
            recommended: false,
            region: '',
            rating: '',
            maxPlayers: 1,
            // Champs de IGameInfo
            library: 'flatimage',
            orderTitle: metadata.title.toLowerCase(),
            placeholder: false,
            manualPath: '',
            musicPath: '',
            thumbnailPath: metadata.screenshot || '',
            configurationPath: '',
            installed: true,
            media: {
                images: metadata.screenshot ? { 'screenshot': [metadata.screenshot] } : {},
                video: ''
            }
        };
    }
    formatFileSize(bytes) {
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        if (bytes === 0)
            return '0 Bytes';
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
    }
    async launchFlatimage(game) {
        console.log(`Lancement de la Flatimage: ${game.applicationPath}`);
        try {
            // Vérifier que le fichier existe et est exécutable
            if (!fs.existsSync(game.applicationPath)) {
                throw new Error(`Le fichier Flatimage n'existe pas: ${game.applicationPath}`);
            }
            // Rendre le fichier exécutable si nécessaire
            await execPromise(`chmod +x "${game.applicationPath}"`);
            // Lancer la Flatimage
            const { spawn } = require('child_process');
            const process = spawn(game.applicationPath, [], {
                detached: true,
                stdio: 'ignore'
            });
            process.unref();
            console.log(`Flatimage lancée avec succès: ${game.title}`);
        }
        catch (error) {
            console.error(`Erreur lors du lancement de la Flatimage:`, error);
            throw error;
        }
    }
    // Méthode pour rafraîchir le cache des métadonnées
    async refreshMetadataCache() {
        this.metadataCache.clear();
        await this.scanFlatimages();
    }
}
exports.FlatimageGameManager = FlatimageGameManager;
//# sourceMappingURL=FlatimageGameManager.js.map