/**
 * @fileoverview Network Log Tool.
 *
 * Captures network requests/responses during test execution.
 * Useful for debugging flow-level failures where the page
 * navigates to unexpected URLs.
 */

class NetworkLogTool {
  /**
   * @param {import('@playwright/test').Page} page
   */
  constructor(page) {
    this.page = page;
    /** @type {Object[]} */
    this._logs = [];
    this._listening = false;
  }

  /** Start capturing network events. */
  startCapture() {
    if (this._listening) return;
    this._listening = true;

    this.page.on('request', (request) => {
      this._logs.push({
        type: 'request',
        url: request.url(),
        method: request.method(),
        resourceType: request.resourceType(),
        timestamp: new Date().toISOString(),
      });
    });

    this.page.on('response', (response) => {
      this._logs.push({
        type: 'response',
        url: response.url(),
        status: response.status(),
        timestamp: new Date().toISOString(),
      });
    });

    this.page.on('requestfailed', (request) => {
      this._logs.push({
        type: 'request_failed',
        url: request.url(),
        method: request.method(),
        failure: request.failure()?.errorText || 'unknown',
        timestamp: new Date().toISOString(),
      });
    });
  }

  /**
   * Get recent navigation-level entries (document requests).
   * @param {number} [limit=10]
   * @returns {Object[]}
   */
  getRecentNavigations(limit = 10) {
    return this._logs
      .filter((l) => l.resourceType === 'document' || l.type === 'request_failed')
      .slice(-limit);
  }

  /**
   * Get all captured logs.
   * @returns {Object[]}
   */
  getAllLogs() {
    return [...this._logs];
  }

  /** Clear captured logs. */
  reset() {
    this._logs = [];
  }
}

module.exports = NetworkLogTool;
