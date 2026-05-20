import { defineConfig } from 'cypress';

export default defineConfig({
  e2e: {
    baseUrl: process.env.AUDITHEX_E2E_BASE_URL ?? 'http://localhost:7777',
    specPattern: 'cypress/e2e/**/*.cy.ts',
    supportFile: 'cypress/support/e2e.ts',
    fixturesFolder: false,
    video: false,
    screenshotOnRunFailure: true,
    setupNodeEvents() {
      // no plugins yet
    },
  },
});
