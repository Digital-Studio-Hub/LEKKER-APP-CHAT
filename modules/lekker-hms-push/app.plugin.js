const fs = require("fs");
const path = require("path");

const HUAWEI_MAVEN = "maven { url 'https://developer.huawei.com/repo/' }";
const HUAWEI_MAVEN_MARKER = "https://developer.huawei.com/repo/";
const AGCP_CLASSPATH = "classpath 'com.huawei.agconnect:agcp:1.9.1.301'";
const AGCP_APPLY = "apply plugin: 'com.huawei.agconnect'";

/** Insert the Huawei Maven repo into the root Android build.gradle. Idempotent. */
function ensureHuaweiMaven(gradle) {
  if (typeof gradle !== "string" || gradle.includes(HUAWEI_MAVEN_MARKER)) return gradle;
  const jitpack = "maven { url 'https://www.jitpack.io' }";
  if (gradle.includes(jitpack)) {
    return gradle.replace(jitpack, `${jitpack}\n        ${HUAWEI_MAVEN}`);
  }
  return gradle.replace(/repositories\s*\{/, (block) => `${block}\n        ${HUAWEI_MAVEN}`);
}

/**
 * Add the AGConnect Gradle plugin to the root buildscript.
 * Only call this when agconnect-services.json is part of the build.
 * Idempotent.
 */
function ensureAgconnectBuildscript(gradle) {
  if (typeof gradle !== "string" || gradle.includes("com.huawei.agconnect:agcp")) return gradle;
  let next = gradle.replace(
    /buildscript\s*\{\s*repositories\s*\{/,
    (block) => `${block}\n        ${HUAWEI_MAVEN}`,
  );
  next = next.replace(
    /buildscript\s*\{[\s\S]*?dependencies\s*\{/,
    (block) => `${block}\n        ${AGCP_CLASSPATH}`,
  );
  return next;
}

/** Apply com.huawei.agconnect at the bottom of app/build.gradle. Idempotent. */
function ensureAgconnectApplied(gradle) {
  if (typeof gradle !== "string" || gradle.includes("com.huawei.agconnect")) return gradle;
  const trimmed = gradle.endsWith("\n") ? gradle : `${gradle}\n`;
  return `${trimmed}${AGCP_APPLY}\n`;
}

function agconnectServicesPresent(projectRoot) {
  return fs.existsSync(path.join(projectRoot, "agconnect-services.json"));
}

function withHuaweiPush(config) {
  const { withProjectBuildGradle, withAppBuildGradle, withAndroidManifest, withDangerousMod } = require("@expo/config-plugins");

  config = withProjectBuildGradle(config, (cfg) => {
    if (cfg.modResults.language === "groovy") {
      cfg.modResults.contents = ensureHuaweiMaven(cfg.modResults.contents);
      if (agconnectServicesPresent(cfg.modRequest.projectRoot)) {
        cfg.modResults.contents = ensureAgconnectBuildscript(cfg.modResults.contents);
      }
    }
    return cfg;
  });

  config = withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language === "groovy" && agconnectServicesPresent(cfg.modRequest.projectRoot)) {
      cfg.modResults.contents = ensureAgconnectApplied(cfg.modResults.contents);
    }
    return cfg;
  });

  config = withAndroidManifest(config, (cfg) => {
    const appId = process.env.EXPO_PUBLIC_HUAWEI_APP_ID?.trim();
    if (!appId) return cfg;
    const application = cfg.modResults.manifest.application?.[0];
    if (!application) return cfg;
    application["meta-data"] = application["meta-data"] || [];
    const name = "com.huawei.hms.client.appid";
    const value = `appid=${appId}`;
    const existing = application["meta-data"].find((item) => item.$?.["android:name"] === name);
    if (existing) {
      existing.$["android:value"] = value;
    } else {
      application["meta-data"].push({ $: { "android:name": name, "android:value": value } });
    }
    return cfg;
  });

  config = withDangerousMod(config, [
    "android",
    async (cfg) => {
      const src = path.join(cfg.modRequest.projectRoot, "agconnect-services.json");
      if (!fs.existsSync(src)) return cfg;
      const destDir = path.join(cfg.modRequest.platformProjectRoot, "app");
      fs.mkdirSync(destDir, { recursive: true });
      fs.copyFileSync(src, path.join(destDir, "agconnect-services.json"));
      return cfg;
    },
  ]);

  return config;
}

module.exports = withHuaweiPush;
module.exports.ensureHuaweiMaven = ensureHuaweiMaven;
module.exports.ensureAgconnectBuildscript = ensureAgconnectBuildscript;
module.exports.ensureAgconnectApplied = ensureAgconnectApplied;
