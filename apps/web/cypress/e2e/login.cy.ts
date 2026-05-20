/**
 * End-to-end coverage of the auth boundary.
 *
 * Expects the orchestrator (`yarn workspace @audithex/web run cypress:e2e`)
 * to have:
 *   1. started an in-memory MongoDB
 *   2. seeded a single user with email = AUDITHEX_E2E_EMAIL
 *      and password = AUDITHEX_E2E_PASSWORD
 *   3. started the Next.js server with that MONGODB_URI
 *
 * The Cypress test only drives the browser.
 */

const EMAIL = (Cypress.env('EMAIL') ?? Cypress.env('email')) as string;
const PASSWORD = (Cypress.env('PASSWORD') ?? Cypress.env('password')) as string;

describe('audithex web — login flow', () => {
  it('redirects unauthenticated visitors from / to /login', () => {
    cy.clearCookies();
    cy.visit('/', { failOnStatusCode: false });
    cy.location('pathname').should('eq', '/login');
  });

  it('shows an error for invalid credentials', () => {
    cy.clearCookies();
    cy.visit('/login');
    cy.get('[data-testid=login-email]').type('nope@example.com');
    cy.get('[data-testid=login-password]').type('wrong-password-12');
    cy.get('[data-testid=login-submit]').click();
    cy.get('[data-testid=login-error]').should('contain', 'Invalid');
  });

  it('signs in with valid credentials and lets the user sign out', () => {
    cy.clearCookies();
    cy.visit('/login');
    cy.get('[data-testid=login-email]').type(EMAIL);
    cy.get('[data-testid=login-password]').type(PASSWORD);
    cy.get('[data-testid=login-submit]').click();

    cy.location('pathname').should('eq', '/');
    cy.get('[data-testid=session-email]').should('contain', EMAIL.toLowerCase());

    cy.get('[data-testid=logout-button]').click();
    cy.location('pathname').should('eq', '/login');
  });
});
