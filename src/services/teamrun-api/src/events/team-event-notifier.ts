import { EventEmitter } from 'node:events'

export const TEAM_EVENT_CHANNEL = 'teamrun_events'

export class TeamEventNotifier {
  readonly #events = new EventEmitter()

  constructor() {
    this.#events.setMaxListeners(0)
  }

  notify(payload: string): void {
    try {
      const value = JSON.parse(payload) as { organizationId?: unknown }
      if (typeof value.organizationId === 'string') {
        this.#events.emit(value.organizationId)
      }
    } catch {
      // Database notifications are hints; durable catch-up remains authoritative.
    }
  }

  subscribe(organizationId: string, listener: () => void): () => void {
    this.#events.on(organizationId, listener)
    return () => this.#events.off(organizationId, listener)
  }
}
