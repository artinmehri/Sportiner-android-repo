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

// Watch shared package
config.watchFolders = [
  path.resolve(workspaceRoot, "packages/shared"),
];

// Block backend
config.resolver.blockList = [
  /\/backend\/.*/,
];

module.exports = config;
