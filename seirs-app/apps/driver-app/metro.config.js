const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot   = __dirname;
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

// Map @seirs/shared to the local shared package
config.resolver.extraNodeModules = {
  '@seirs/shared': path.resolve(workspaceRoot, 'shared'),
};

module.exports = config;
