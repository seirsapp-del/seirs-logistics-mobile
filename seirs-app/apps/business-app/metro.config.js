const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot   = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Watch ONLY what this app bundles from, not the whole workspace.
// Watching workspaceRoot overflows Windows fs.watch handles once the
// backend/admin/siblings churn (EMFILE crash-loop); same fix as
// customer-app bc65e90 and driver-app.
config.watchFolders = [
  projectRoot,
  path.resolve(workspaceRoot, 'shared'),
  path.resolve(workspaceRoot, 'node_modules'),
];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Force a single React/React Native instance from the workspace root so
// production bundles don't end up with duplicate Reacts (causes
// "useState of null" crashes when hook calls hit the wrong dispatcher).
config.resolver.extraNodeModules = {
  '@seirs/shared': path.resolve(workspaceRoot, 'shared'),
  'react':        path.resolve(workspaceRoot, 'node_modules/react'),
  'react-native': path.resolve(workspaceRoot, 'node_modules/react-native'),
};

// Without this, npm/Expo can hoist a second copy of React into apps/<app>/
// node_modules and Metro's hierarchical lookup picks it up for some imports.
config.resolver.disableHierarchicalLookup = true;

// Silence "Error 'ENOENT' reading contents of ...seirs-backend/node_modules..."
// spam during npm installs and backend rebuilds. Folders here aren't bundled.
config.resolver.blockList = [
  /seirs-backend[\\/]node_modules[\\/].*/,
  /seirs-backend[\\/]dist[\\/].*/,
  /seirs-backend[\\/]uploads[\\/].*/,
  /[\\/]\.git[\\/].*/,
  /[\\/]android[\\/]build[\\/].*/,
  /[\\/]android[\\/]\.gradle[\\/].*/,
  // Sibling apps are never bundled into this one.
  /apps[\\/]customer-app[\\/].*/,
  /apps[\\/]driver-app[\\/].*/,
  /apps[\\/]admin-dashboard[\\/].*/,
  /apps[\\/]seirs-website[\\/].*/,
];

module.exports = config;
