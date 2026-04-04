// Reference implementation from working version at /media/fabien/jeux/ExodosLauncher/exogui
// Key points:
// 1. FlatImage detected by applicationPath.endsWith('.flatimage')
// 2. Uses spawn(fullPath, [], { detached: true, stdio: 'ignore' }) + proc.unref()
// 3. No cwd or env passed to spawn
// 4. applicationPath can be relative (resolved against config.exodosPath) or absolute
// 5. exec() uses shell: '/bin/bash' for non-FlatImage games

// launchGame FlatImage section:
/*
if (opts.game.applicationPath.endsWith('.flatimage')) {
    const fullPath = path.isAbsolute(opts.game.applicationPath)
        ? opts.game.applicationPath
        : path.join(opts.config.exodosPath, opts.game.applicationPath);

    if (!fs.existsSync(fullPath)) {
        opts.log({ source: logSource, content: `Flatimage not found: ${fullPath}` });
        return;
    }

    fs.chmodSync(fullPath, '755');

    const proc = spawn(fullPath, [], {
        detached: true,
        stdio: 'ignore'
    });
    proc.unref();
    return;
}
*/
