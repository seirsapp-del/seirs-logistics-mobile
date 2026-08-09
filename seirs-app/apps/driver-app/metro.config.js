const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot   = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Watch only the paths this app actually imports from. Watching the
// whole workspaceRoot on Windows blows past fs.watch's handle limit
// (recursing every sibling app's android/build, .next, node_modules)
// and Metro dies with "Failed to construct transformer: Failed to
// start watch mode". Same fix as customer-app (bc65e90).
config.watchFolders = [
  projectRoot,
  path.resolve(workspaceRoot, 'shared'),
  path.resolve(workspaceRoot, 'node_modules'),
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

// Silence "Error 'ENOENT' reading contents of ...seirs-backend/node_modules..."
// spam during npm installs and backend rebuilds. Folders here aren't bundled.
config.resolver.blockList = [
  /seirs-backend[\\/]node_modules[\\/].*/,
  /seirs-backend[\\/]dist[\\/].*/,
  /seirs-backend[\\/]uploads[\\/].*/,
  /[\\/]\.git[\\/].*/,
  /[\\/]android[\\/]build[\\/].*/,
  /[\\/]android[\\/]\.gradle[\\/].*/,
  // Belt-and-braces: never resolve into sibling apps (fs.watch guard).
  /apps[\\/](?!driver-app)[^\\/]+[\\/]node_modules[\\/].*/,
  /apps[\\/](?!driver-app)[^\\/]+[\\/]android[\\/].*/,
  /apps[\\/](?!driver-app)[^\\/]+[\\/]\.next[\\/].*/,
  /apps[\\/](?!driver-app)[^\\/]+[\\/]out[\\/].*/,
];

module.exports = config;
