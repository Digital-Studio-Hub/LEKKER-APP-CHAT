const fs = require("fs");
const path = require("path");

const HUAWEI_MAVEN = "maven { url 'https://developer.huawei.com/repo/' }";
const HUAWEI_MAVEN_MARKER = "https://developer.huawei.com/repo/";

/** Insert the Huawei Maven repo into the root Android build.gradle. Idempotent. */
function ensureHuaweiMaven(gradle) {
  if (typeof gradle !== "string" || gradle.includes(HUAWEI_MAVEN_MARKER)) return gradle;
  const jitpack = "maven { url 'https://www.jitpack.io' }";
  if (gradle.includes(jitpack)) {
    return gradle.replace(jitpack, `${jitpack}\n        ${HUAWEI_MAVEN}`);
  }
  return gradle.replace(/repositories\s*\{/, (block) => `${block}\n        ${HUAWEI_MAVEN}`);
}

function withHuaweiPush(config) {
  const { withProjectBuildGradle, withAndroidManifest, withDangerousMod } = require("@expo/config-plugins");

  config = withProjectBuildGradle(config, (cfg) => {
    if (cfg.modResults.language === "groovy") {
      cfg.modResults.contents = ensureHuaweiMaven(cfg.modResults.contents);
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
