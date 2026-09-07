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
        // `line` e `surface` existem pra que nao volte a aparecer hex de cinza
        // escrito a mao no meio do JSX. Divisoria e' line; fundo e' surface.
        line: {
          DEFAULT: 'hsl(var(--border))',
          strong: 'hsl(var(--border-strong))'
        },
        surface: {
          DEFAULT: 'hsl(var(--card))',
          raised: 'hsl(var(--muted))',
          strong: 'hsl(var(--border-strong))'
        },
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
        // Todas as cores da marca vem de variaveis (globals.css) — e o que
        // permite cinco temas sem tocar em componente. Nos temas claros o
        // "acid" de texto escurece pra passar contraste sobre branco; o halo
        // continua vindo de --neon-rgb, que cada tema define do seu jeito.
        acid: {
          DEFAULT: 'hsl(var(--acid))',
          dark: 'hsl(var(--acid-dark))',
          glow: 'hsl(var(--acid))',
          // Verde de TEXTO: mais suave que o do botao (10,9:1 em vez de
          // 14,9:1 no grafite). E o que uma palavra destacada no meio de uma
          // frase usa; `text-acid` puro fica pra estado ativo e acao.
          text: 'hsl(var(--acid-text))'
        },
        slime: {
          DEFAULT: 'hsl(var(--acid))',
          dark: 'hsl(var(--acid-dark))',
          light: 'hsl(var(--acid-light))'
        },
        burn: {
          DEFAULT: 'hsl(var(--burn))',
          dark: 'hsl(var(--burn-dark))'
        },
        // Profundidade: depth-1 e' o proprio bg-void; 2 e 3 sao degraus mais
        // claros (coluna de canais/composer e area do chat).
        depth: {
          2: 'hsl(var(--depth-2))',
          3: 'hsl(var(--depth-3))'
        },
        void: {
          DEFAULT: 'hsl(var(--background))',
          light: 'hsl(var(--muted))',
          card: 'hsl(var(--card))'
        },
        dirty: {
          white: 'hsl(var(--foreground))',
          gray: 'hsl(var(--border-strong))'
        }
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        // 6px e o raio de botao/chip na escala nova (2 · 6 · 10 · 14 · 999).
        // `rounded-brutal` esta em 400 lugares; mudar aqui muda todos.
        brutal: '6px'
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'Consolas', 'monospace'],
        // Anton e carregada de verdade (ver src/index.html); Impact fica de
        // terceira opcao pra que, se a fonte web falhar, ainda caia numa
        // condensada pesada em vez de sans generica.
        display: ['Anton', 'Arial Narrow', 'Impact', 'sans-serif']
      },
      // Intensidades de neon padronizadas. N3 e do botao primario (.btn-acid,
      // em globals.css); aqui ficam N1/N2 pra estado ativo e destaque. As
      // sombras solidas deslocadas (`brutal`) e o brilho interno sairam: nao
      // codificavam nada e eram o que mais engordava a interface.
      boxShadow: {
        'neon-1': '0 0 0 1px rgb(var(--neon-rgb) / 0.35)',
        'neon-2': '0 0 14px rgb(var(--neon-rgb) / 0.20)',
        'neon-3': '0 0 22px rgb(var(--neon-rgb) / 0.30)',
        // Nomes antigos, mapeados pra N2 — hoje 4 arquivos usam.
        'glow-acid': '0 0 14px rgb(var(--neon-rgb) / 0.20)',
        'glow-burn': '0 0 14px rgba(242, 183, 5, 0.20)'
      },
      keyframes: {
        'glow-pulse': {
          '0%, 100%': { boxShadow: '0 0 8px rgb(var(--neon-rgb) / 0.18)' },
          '50%': { boxShadow: '0 0 18px rgb(var(--neon-rgb) / 0.32)' }
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
        },
        // Drops: o banner inteiro gira a matiz (arco-íris) e a barra de
        // validade encolhe até sumir — a duração vem inline, é o tempo que
        // resta até o drop vencer.
        rainbow: {
          '0%': { filter: 'hue-rotate(0deg)' },
          '100%': { filter: 'hue-rotate(360deg)' }
        },
        'shrink-width': {
          from: { width: '100%' },
          to: { width: '0%' }
        }
      },
      animation: {
        'glow-pulse': 'glow-pulse 2s ease-in-out infinite',
        shake: 'shake 0.3s ease-in-out',
        glitch: 'glitch 0.3s ease-in-out',
        flicker: 'flicker 3s ease-in-out infinite',
        scan: 'scan 3s linear infinite',
        float: 'float 3s ease-in-out infinite',
        rainbow: 'rainbow 2s linear infinite',
        // O `shake` de cima é um tranco só (erro de formulário); o drop treme
        // enquanto estiver na tela.
        'drop-shake': 'shake 0.5s ease-in-out infinite',
        'shrink-width': 'shrink-width linear forwards'
      }
    }
  },
  plugins: [import('tailwindcss-animate')]
}
