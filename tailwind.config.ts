import type { Config } from "tailwindcss";

export default {
	darkMode: ["class"],
	content: [
		"./pages/**/*.{ts,tsx}",
		"./components/**/*.{ts,tsx}",
		"./app/**/*.{ts,tsx}",
		"./src/**/*.{ts,tsx}",
	],
	prefix: "",
	theme: {
		container: {
			center: true,
			padding: '2rem',
			screens: {
				'2xl': '1400px'
			}
		},
		extend: {
			fontFamily: {
				sans: ['Lexend', 'system-ui', 'sans-serif'],
			},
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
				sidebar: {
					DEFAULT: 'hsl(var(--sidebar-background))',
					foreground: 'hsl(var(--sidebar-foreground))',
					primary: 'hsl(var(--sidebar-primary))',
					'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
					accent: 'hsl(var(--sidebar-accent))',
					'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
					border: 'hsl(var(--sidebar-border))',
					ring: 'hsl(var(--sidebar-ring))'
				}
			},
			borderRadius: {
				lg: 'var(--radius)',
				md: 'calc(var(--radius) - 2px)',
				sm: 'calc(var(--radius) - 4px)'
			},
			keyframes: {
				'accordion-down': {
					from: {
						height: '0'
					},
					to: {
						height: 'var(--radix-accordion-content-height)'
					}
				},
				'accordion-up': {
					from: {
						height: 'var(--radix-accordion-content-height)'
					},
					to: {
						height: '0'
					}
				},
				'fade-in': {
					'0%': {
						opacity: '0',
						transform: 'translateY(10px)'
					},
					'100%': {
						opacity: '1',
						transform: 'translateY(0)'
					}
				},
				// Enhanced spring-based slide animations
				'slide-enter': {
					'0%': { 
						transform: 'translate3d(100%, 0, 0) scale(0.95)',
						opacity: '0.7'
					},
					'60%': { 
						transform: 'translate3d(-5%, 0, 0) scale(1.02)',
						opacity: '0.9'
					},
					'100%': { 
						transform: 'translate3d(0, 0, 0) scale(1)',
						opacity: '1'
					}
				},
				'slide-exit-left': {
					'0%': { 
						transform: 'translate3d(0, 0, 0) scale(1)',
						opacity: '1'
					},
					'100%': { 
						transform: 'translate3d(-100%, 0, 0) scale(0.95)',
						opacity: '0'
					}
				},
				'slide-exit-right': {
					'0%': { 
						transform: 'translate3d(0, 0, 0) scale(1)',
						opacity: '1'
					},
					'100%': { 
						transform: 'translate3d(100%, 0, 0) scale(0.95)',
						opacity: '0'
					}
				},
				'slide-out-left': {
					'0%': { 
						transform: 'translateX(0)',
						opacity: '1'
					},
					'100%': { 
						transform: 'translateX(-100%)',
						opacity: '0'
					}
				},
				'slide-out-right': {
					'0%': { 
						transform: 'translateX(0)',
						opacity: '1'
					},
					'100%': { 
						transform: 'translateX(120%)',
						opacity: '0',
						visibility: 'hidden'
					}
				},
				'slide-in': {
					'0%': { 
						transform: 'translateX(100%)',
						opacity: '0'
					},
					'100%': { 
						transform: 'translateX(0)',
						opacity: '1'
					}
				},
				'slide-in-left': {
					'0%': { 
						transform: 'translateX(-100%)',
						opacity: '0'
					},
					'100%': { 
						transform: 'translateX(0)',
						opacity: '1'
					}
				},
				'discard': {
					'0%': { 
						transform: 'scale(1) rotateZ(0deg)', 
						opacity: '1',
						height: 'auto',
						marginBottom: '1rem'
					},
					'60%': { 
						transform: 'scale(0.95) rotateZ(-1deg)', 
						opacity: '0.8',
						height: 'auto',
						marginBottom: '1rem'
					},
					'100%': { 
						transform: 'scale(0.85) rotateZ(-2deg)', 
						opacity: '0',
						height: '0',
						marginBottom: '0',
						paddingTop: '0',
						paddingBottom: '0'
					}
				}
			},
			animation: {
				'accordion-down': 'accordion-down 0.2s ease-out',
				'accordion-up': 'accordion-up 0.2s ease-out',
				'fade-in': 'fade-in 0.3s ease-out',
				// Enhanced Instagram-like animations
				'slide-enter': 'slide-enter 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
				'slide-exit-left': 'slide-exit-left 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
				'slide-exit-right': 'slide-exit-right 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
				// Legacy animations for backward compatibility
				'slide-out-left': 'slide-out-left 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
				'slide-out-right': 'slide-out-right 0.5s cubic-bezier(0.4, 0, 0.2, 1) forwards',
				'slide-in': 'slide-in 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
				'slide-in-left': 'slide-in-left 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
				'discard': 'discard 0.4s ease-in-out forwards'
			}
		}
	},
	plugins: [require("tailwindcss-animate")],
} satisfies Config;
