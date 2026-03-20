/**
 * @fileoverview Lightweight event bus for framework telemetry.
 *
 * Emits structured events (see contracts.js → createHealingEvent)
 * so that the report writer and any other listener can observe
 * every healing decision in real time.
 */

const EventEmitter = require('events');

class EventBus extends EventEmitter {
  constructor() {
    super();
    /** @type {Object[]} Recorded events for the current run */
    this._eventLog = [];
  }

  /**
   * Emit a typed healing event and store it in the log.
   * @param {Object} healingEvent – output of createHealingEvent()
   */
  publish(healingEvent) {
    this._eventLog.push(healingEvent);
    this.emit(healingEvent.type, healingEvent);
    this.emit('*', healingEvent); // wildcard listener
  }

  /**
   * Return all events recorded since the bus was created / last reset.
   * @returns {Object[]}
   */
  getLog() {
    return [...this._eventLog];
  }

  /**
   * Return events filtered by type.
   * @param {string} type
   * @returns {Object[]}
   */
  getEventsByType(type) {
    return this._eventLog.filter((e) => e.type === type);
  }

  /** Clear the event log (e.g. between test files). */
  reset() {
    this._eventLog = [];
  }
}

// Singleton so every module shares the same bus
const eventBus = new EventBus();

module.exports = eventBus;
