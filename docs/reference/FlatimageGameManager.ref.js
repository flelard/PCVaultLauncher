// Reference implementation from working version at /media/fabien/jeux/ExodosLauncher/exogui
// Key points:
// 1. applicationPath stored as RELATIVE: path.join('JeuxGameImage', path.basename(filePath))
//    (our fork uses absolute path instead - both work since launch code handles both)
// 2. launchFlatimage uses spawn(applicationPath, [], { detached: true, stdio: 'ignore' }) + proc.unref()
// 3. metadataCache is a Map in memory (not persistent)
// 4. extractMetadata: title from filename (cleaned), genre from name keywords, year from name
// 5. findScreenshot: looks for image with same base name next to the .flatimage file
// 6. Working config: exodosPath "../" (relative to exogui folder inside ExodosLauncher)
//    → resolves to /media/fabien/jeux/ExodosLauncher/ which contains Images/ and Videos/

// Working config.json (at /media/fabien/jeux/ExodosLauncher/config.json):
/*
{
  "exodosPath": "../",
  "flatimage": {
    "enabled": true,
    "flatimageDirectory": "/media/fabien/Jeux/JeuxGameImage",
    "autoDetect": true,
    "metadataCache": true
  }
}
*/
// Note: no mediaDirectory field — media loaded from exodosPath (Images/Flatimage/, Videos/Flatimage/)
