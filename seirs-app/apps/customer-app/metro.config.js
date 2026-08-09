const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot  = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// SVG support — lets us `import Foo from './foo.svg'` and render it as
// a React component (recolorable via the SVG's own fill or via a prop).
// Standard pairing: react-native-svg + react-native-svg-transformer.
// See apps/customer-app/assets/illustrations/README.md for the asset
// sourcing convention.
config.transformer = {
  ...config.transformer,
  babelTransformerPath: require.resolve('react-native-svg-transformer/expo'),
};
config.resolver = {
  ...config.resolver,
  assetExts: (config.resolver.assetExts || []).filter((ext) => ext !== 'svg'),
  sourceExts: [...(config.resolver.sourceExts || []), 'svg'],
};

// Watch only the paths we actually import from. Watching the entire
// workspaceRoot on Windows blows past fs.watch's handle limit because
// it recurses through every app's android/build, .next, and duplicated
// node_modules. That reliably triggers Metro's "Failed to construct
// transformer: Failed to start watch mode" on cold-start.
//
// The three folders below are the only ones customer-app resolves code
// from at runtime: the app itself, the shared package, and the hoisted
// workspace node_modules. Everything else is either dead weight or
// belongs to another app.
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
  // Belt-and-braces defence for the fs.watch handle limit on Windows:
  // even though watchFolders is now narrowed, blockList prevents the
  // resolver from accidentally reaching into sibling apps.
  /apps[\\/](?!customer-app)[^\\/]+[\\/]node_modules[\\/].*/,
  /apps[\\/](?!customer-app)[^\\/]+[\\/]android[\\/].*/,
  /apps[\\/](?!customer-app)[^\\/]+[\\/]\.next[\\/].*/,
  /apps[\\/](?!customer-app)[^\\/]+[\\/]out[\\/].*/,
];

module.exports = config;
