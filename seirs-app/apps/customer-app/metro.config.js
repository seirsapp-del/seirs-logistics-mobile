const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot  = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Merge our workspace watch folders with Expo's defaults
config.watchFolders = [
  workspaceRoot,
  ...(config.watchFolders || []),
];

// Tell Metro where to find modules — project first, then workspace root
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Map @seirs/shared to the local shared package, and force a single
// React/React Native instance from the workspace root so production
// bundles don't end up with duplicate Reacts (causes "useState of null"
// crashes when hook calls hit the wrong dispatcher).
config.resolver.extraNodeModules = {
  '@seirs/shared': path.resolve(workspaceRoot, 'shared'),
  'react':        path.resolve(workspaceRoot, 'node_modules/react'),
  'react-native': path.resolve(workspaceRoot, 'node_modules/react-native'),
};

// Without this, npm/Expo can hoist a second copy of React into apps/<app>/
// node_modules and Metro's hierarchical lookup picks it up for some imports.
config.resolver.disableHierarchicalLookup = true;

// Tell the file watcher to ignore folders that change a lot but don't
// belong to the bundle — silences "Error 'ENOENT' reading contents of
// ...seirs-backend/node_modules..." spam during npm installs and backend
// builds. The regex is matched against absolute paths (Windows + Unix).
config.watcher = config.watcher ?? {};
config.watcher.watchman = config.watcher.watchman ?? {};
config.resolver.blockList = [
  /seirs-backend[\\/]node_modules[\\/].*/,
  /seirs-backend[\\/]dist[\\/].*/,
  /seirs-backend[\\/]uploads[\\/].*/,
  /[\\/]\.git[\\/].*/,
  /[\\/]android[\\/]build[\\/].*/,
  /[\\/]android[\\/]\.gradle[\\/].*/,
];

module.exports = config;
