import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0b0e14',
        pane: '#11141b',
        border: '#1f242d',
        accent: '#10b981',
        'accent-warm': '#f97316',
        text: '#d4d4d4',
        'text-muted': '#6b7280',
        critical: '#ef4444',
        high: '#f59e0b',
        medium: '#eab308',
        low: '#84cc16',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'SF Mono', 'Menlo', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
