import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        cloud:   '#F5F0EB',
        cloud2:  '#EDE4D9',
        cloud3:  '#E0D4C4',
        navy:    '#0D1B2A',
        navy2:   '#1E3A5F',
        orange:  '#F4600C',
        orange2: '#D95209',
      },
    },
  },
  plugins: [],
};
export default config;
