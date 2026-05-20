/**
 * Shared Cypress setup. Loaded by every spec via cypress.config.ts.
 * The auth helper lives here so the two e2e suites never duplicate
 * the sign-in choreography.
 */

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Cypress {
    interface Chainable {
      signIn(): Chainable<void>;
    }
  }
}

Cypress.Commands.add('signIn', () => {
  const email = (Cypress.env('EMAIL') ?? Cypress.env('email')) as string;
  const password = (Cypress.env('PASSWORD') ?? Cypress.env('password')) as string;
  cy.clearCookies();
  cy.visit('/login');
  cy.get('[data-testid=login-email]').type(email);
  cy.get('[data-testid=login-password]').type(password);
  cy.get('[data-testid=login-submit]').click();
  cy.location('pathname').should('eq', '/');
});

export {};
