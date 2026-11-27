// @ts-check
import { defineConfig } from 'astro/config';

export default defineConfig({
  devToolbar: {
    enabled: false,
  },
  redirects: {
    '/products': '/prodotti',
  },
});
