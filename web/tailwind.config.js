export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#0F1117",
        foreground: "#F5F5F0",
        surface: {
          DEFAULT: "#1A1D27",
          raised: "#232636",
        },
        accent: {
          primary: "#FF6B35",
          secondary: "#4ECDC4",
        },
        muted: {
          DEFAULT: "#8B8FA8",
          foreground: "#8B8FA8",
        },
        border: "#2D3048",
        input: "#232636",
        ring: "#FF6B35",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        display: ["'Playfair Display'", "serif"],
        mono: ["'JetBrains Mono'", "monospace"],
      },
      keyframes: {
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        }
      },
      animation: {
        fadeInUp: 'fadeInUp 0.4s ease forwards',
      }
    },
  },
  plugins: [],
}
