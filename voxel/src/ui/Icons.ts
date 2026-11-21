// Inline SVG icons (original, simple line art).
const S = (p: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
export const ICON = {
  jump: S('<path d="M5 15l7-7 7 7"/><path d="M5 20h14"/>'),
  sneak: S('<path d="M5 9l7 7 7-7"/><path d="M5 4h14"/>'),
  break: S('<path d="M14 4c3 0 6 2 6 5"/><path d="M4 9c2-4 7-5 10-5"/><path d="M12 7l-7 13"/>'),
  place: S('<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12l8-4.5M12 12L4 7.5M12 12v9"/>'),
  hand: S('<path d="M8 13V5a1.5 1.5 0 013 0v6"/><path d="M11 11V4a1.5 1.5 0 013 0v7"/><path d="M14 11V6a1.5 1.5 0 013 0v8c0 4-3 7-7 7-3 0-5-2-6-4l-2-4a1.5 1.5 0 012.5-1.5L8 14"/>'),
  bag: S('<rect x="4" y="7" width="16" height="13" rx="3"/><path d="M9 7V5a3 3 0 016 0v2"/><path d="M4 12h16"/>'),
  pause: S('<path d="M9 5v14M15 5v14"/>'),
  drop: S('<path d="M12 4v10"/><path d="M8 10l4 4 4-4"/><path d="M5 19h14"/>'),
  eye: S('<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  wing: S('<path d="M3 17c4-1 7-4 9-9 2 5 5 8 9 9"/><path d="M7 15c1-2 3-3 5-3s4 1 5 3"/>'),
  sprint: S('<path d="M6 6l6 6-6 6"/><path d="M13 6l6 6-6 6"/>'),
  star: S('<path d="M12 3l2.6 5.6L20 9.5l-4 4 1 6-5-2.8L7 19.5l1-6-4-4 5.4-.9z"/>'),
  gear: S('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>'),
};
