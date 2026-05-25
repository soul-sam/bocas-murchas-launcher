/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./src/**/*.{js,ts,jsx,tsx,html}', './src/index.html'],
  theme: {
    container: {
      center: true,
      padding: '1.5rem',
      screens: { '2xl': '1400px' }
    },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))'
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))'
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))'
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))'
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))'
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))'
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))'
        },
        acid: {
          DEFAULT: '#6AFF00',
          dark: '#3A5F0B',
          glow: '#6AFF00'
        },
        slime: {
          DEFAULT: '#6AFF00',
          dark: '#4CAF00',
          light: '#8FFF40'
        },
        burn: {
          DEFAULT: '#F2B705',
          dark: '#D4A005'
        },
        void: {
          DEFAULT: '#0B0B0B',
          light: '#151515',
          card: '#0F0F0F'
        },
        dirty: {
          white: '#EAEAEA',
          gray: '#2A2A2A'
        }
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        brutal: '4px'
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
        display: ['Impact', 'Haettenschweiler', 'Arial Narrow Bold', 'sans-serif']
      },
      boxShadow: {
        'glow-acid': '0 0 20px rgba(106, 255, 0, 0.5), 0 0 40px rgba(106, 255, 0, 0.3)',
        'glow-burn': '0 0 20px rgba(242, 183, 5, 0.5), 0 0 40px rgba(242, 183, 5, 0.3)',
        brutal: '4px 4px 0 0 rgba(106, 255, 0, 0.8)',
        'brutal-sm': '2px 2px 0 0 rgba(106, 255, 0, 0.8)',
        'inner-glow': 'inset 0 0 20px rgba(106, 255, 0, 0.2)'
      },
      keyframes: {
        'glow-pulse': {
          '0%, 100%': { boxShadow: '0 0 5px rgba(106, 255, 0, 0.5)' },
          '50%': { boxShadow: '0 0 25px rgba(106, 255, 0, 0.8), 0 0 50px rgba(106, 255, 0, 0.4)' }
        },
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '25%': { transform: 'translateX(-2px) rotate(-1deg)' },
          '75%': { transform: 'translateX(2px) rotate(1deg)' }
        },
        glitch: {
          '0%, 100%': { transform: 'translate(0)' },
          '20%': { transform: 'translate(-2px, 2px)' },
          '40%': { transform: 'translate(-2px, -2px)' },
          '60%': { transform: 'translate(2px, 2px)' },
          '80%': { transform: 'translate(2px, -2px)' }
        },
        flicker: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.8' },
          '75%': { opacity: '0.9' }
        },
        scan: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100%)' }
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-5px)' }
        }
      },
      animation: {
        'glow-pulse': 'glow-pulse 2s ease-in-out infinite',
        shake: 'shake 0.3s ease-in-out',
        glitch: 'glitch 0.3s ease-in-out',
        flicker: 'flicker 3s ease-in-out infinite',
        scan: 'scan 3s linear infinite',
        float: 'float 3s ease-in-out infinite'
      }
    }
  },
  plugins: [import('tailwindcss-animate')]
}
