const assert = require("node:assert/strict");
const test = require("node:test");
const { ensureHuaweiMaven, ensureAgconnectBuildscript, ensureAgconnectApplied } = require("./app.plugin.js");

const SAMPLE = `
allprojects {
    repositories {
        google()
        mavenCentral()
        maven { url 'https://www.jitpack.io' }
    }
}
`;

test("Huawei Maven repo is added once next to jitpack", () => {
  const once = ensureHuaweiMaven(SAMPLE);
  assert.match(once, /jitpack\.io' \}\n\s+maven \{ url 'https:\/\/developer\.huawei\.com\/repo\/' \}/);
  const twice = ensureHuaweiMaven(once);
  assert.equal(twice, once);
  assert.equal(twice.split("developer.huawei.com/repo").length - 1, 1);
});

const ROOT_GRADLE = `
buildscript {
    repositories {
        google()
        mavenCentral()
    }
    dependencies {
        classpath('com.android.tools.build:gradle')
    }
}

allprojects {
    repositories {
        google()
        mavenCentral()
        maven { url 'https://www.jitpack.io' }
    }
}
`;

test("AGConnect classpath is added to the root buildscript once", () => {
  const withMaven = ensureHuaweiMaven(ROOT_GRADLE);
  const once = ensureAgconnectBuildscript(withMaven);
  assert.match(once, /buildscript\s*\{\s*repositories\s*\{\s*maven \{ url 'https:\/\/developer\.huawei\.com\/repo\/' \}/);
  assert.match(once, /classpath 'com\.huawei\.agconnect:agcp:1\.9\.1\.301'/);
  assert.match(once, /apply plugin: 'com\.android\.application'|classpath\('com\.android\.tools\.build:gradle'\)/);
  const twice = ensureAgconnectBuildscript(once);
  assert.equal(twice, once);
  assert.equal(twice.split("com.huawei.agconnect:agcp").length - 1, 1);
});

test("AGConnect plugin is applied at the bottom of the app gradle once", () => {
  const appGradle = "apply plugin: 'com.android.application'\n";
  const once = ensureAgconnectApplied(appGradle);
  assert.match(once, /apply plugin: 'com\.android\.application'\napply plugin: 'com\.huawei\.agconnect'\n/);
  assert.equal(ensureAgconnectApplied(once), once);
});
