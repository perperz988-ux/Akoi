type Handler = (data: any) => void;

/** Minimal global event bus so systems stay decoupled. */
export class EventBus {
  private map = new Map<string, Set<Handler>>();
  on(ev: string, h: Handler) {
    if (!this.map.has(ev)) this.map.set(ev, new Set());
    this.map.get(ev)!.add(h);
    return () => this.map.get(ev)!.delete(h);
  }
  emit(ev: string, data?: any) {
    const s = this.map.get(ev);
    if (s) for (const h of [...s]) h(data);
  }
}
