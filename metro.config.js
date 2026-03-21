// metro.config.js
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

// Keep a reference to Expo’s default resolver
const defaultResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  // ✅ On web, replace expo-sqlite with our stub
  if (platform === "web" && moduleName === "expo-sqlite") {
    return {
      type: "sourceFile",
      filePath: path.resolve(__dirname, "lib/expo-sqlite-web-stub.js"),
    };
  }

  // Otherwise use the default resolver
  if (defaultResolveRequest) {
    return defaultResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
