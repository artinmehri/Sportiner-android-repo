const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// 👇 VERY IMPORTANT for pnpm + monorepo
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// Watch shared package and workspace node_modules
config.watchFolders = [
  path.resolve(workspaceRoot, "packages/shared"),
  path.resolve(workspaceRoot, "node_modules"),
];

// Block backend
config.resolver.blockList = [
  /\/backend\/.*/,
];

// Configure path alias for @/
config.resolver.alias = {
  '@': path.resolve(projectRoot),
};

module.exports = config;
