const assert = require("node:assert/strict");
const test = require("node:test");
const { ensureHuaweiMaven } = require("./app.plugin.js");

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
