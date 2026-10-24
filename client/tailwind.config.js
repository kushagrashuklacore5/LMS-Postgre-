/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
        extend: {
          colors: {
            primary: "#2563EB",
            secondary: "#3B82F6",
            success: "#16A34A",
            warning: "#FACC15",
            danger: "#DC2626",
            background: "#F3F4F6",
            text: "#111827",
          },
          screens: {
            'xs': '475px',
            '3xl': '1600px',
          },
          spacing: {
            '18': '4.5rem',
            '88': '22rem',
            '128': '32rem',
          },
          maxWidth: {
            '8xl': '88rem',
            '9xl': '96rem',
          },
          animation: {
            'fade-in': 'fade-in 0.5s ease-out',
            'slide-in': 'slide-in 0.5s ease-out',
            'scale-in': 'scale-in 0.5s ease-out',
          },
          keyframes: {
            'fade-in': {
              '0%': { opacity: '0', transform: 'translateY(10px)' },
              '100%': { opacity: '1', transform: 'translateY(0)' },
            },
            'slide-in': {
              '0%': { opacity: '0', transform: 'translateX(-20px)' },
              '100%': { opacity: '1', transform: 'translateX(0)' },
            },
            'scale-in': {
              '0%': { opacity: '0', transform: 'scale(0.9)' },
              '100%': { opacity: '1', transform: 'scale(1)' },
            },
          },
        },  },
  plugins: [],
}
