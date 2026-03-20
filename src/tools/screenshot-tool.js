/**
 * @fileoverview Screenshot Tool.
 *
 * Captures before/after screenshots during healing and
 * stores them in the healing artifact directory.
 */

const fs = require('fs');
const path = require('path');
const frameworkConfig = require('../../config/framework.config');

class ScreenshotTool {
  /**
   * @param {import('@playwright/test').Page} page
   */
  constructor(page) {
    this.page = page;
  }

  /**
   * Take a screenshot and save it to the artifact directory.
   *
   * @param {Object} opts
   * @param {string} opts.testId
   * @param {string} opts.stepId
   * @param {'before_heal'|'after_heal'|'failure'|'success'} opts.phase
   * @param {string} [opts.outputDir]
   * @returns {Promise<string>} Absolute path to the saved screenshot
   */
  async capture(opts) {
    if (!frameworkConfig.artifacts.captureScreenshots) {
      return null;
    }

    const dir = opts.outputDir || frameworkConfig.artifacts.outputDir;
    const screenshotsDir = path.resolve(dir, 'screenshots');
    fs.mkdirSync(screenshotsDir, { recursive: true });

    const fileName = `${opts.testId}_${opts.stepId}_${opts.phase}_${Date.now()}.png`;
    const filePath = path.join(screenshotsDir, fileName);

    await this.page.screenshot({ path: filePath, fullPage: false });

    return filePath;
  }

  /**
   * Take a full-page screenshot.
   * @param {string} filePath
   * @returns {Promise<string>}
   */
  async captureFullPage(filePath) {
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });
    await this.page.screenshot({ path: filePath, fullPage: true });
    return filePath;
  }
}

module.exports = ScreenshotTool;
