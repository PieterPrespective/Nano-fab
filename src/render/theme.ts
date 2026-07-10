/** Dark, high-contrast theme sized for arm's-length tablet play. */
export const theme = {
  bg: '#0b1220',
  panel: '#141d30',
  panelRaised: '#1b2740',
  stroke: '#2a3a5c',
  text: '#e6edf3',
  textDim: '#93a4bf',
  accent: '#4cc9f0',
  accentWarm: '#f4a261',
  good: '#4ade80',
  bad: '#f87171',
  star: '#fbbf24',
  curveHigh: '#4cc9f0',
  curveLow: '#7c8db5',
  font: (px: number, weight = 400) => `${weight} ${px}px system-ui, sans-serif`,
} as const;
