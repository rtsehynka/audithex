/**
 * History list (/) + finding detail (/scans/[id]).
 *
 * The orchestrator seeds one banking-bot scan before this spec runs,
 * so the table is guaranteed to have at least one row to interact with.
 */

const EMAIL = (Cypress.env('EMAIL') ?? Cypress.env('email')) as string;
const PASSWORD = (Cypress.env('PASSWORD') ?? Cypress.env('password')) as string;

function signIn(): void {
  cy.clearCookies();
  cy.visit('/login');
  cy.get('[data-testid=login-email]').type(EMAIL);
  cy.get('[data-testid=login-password]').type(PASSWORD);
  cy.get('[data-testid=login-submit]').click();
  cy.location('pathname').should('eq', '/');
}

describe('audithex web — scan history', () => {
  it('renders the seeded scan in the history table', () => {
    signIn();
    cy.get('[data-testid=scan-table]').should('exist');
    cy.get('[data-testid=scan-row]').should('have.length.greaterThan', 0);
    cy.get('[data-testid=severity-counts]').first().should('contain', 'C5').and('contain', 'H5');
    cy.get('[data-testid=pagination-range]').should('contain', '1');
  });

  it('navigates from the table row to the detail page', () => {
    signIn();
    cy.get('[data-testid=scan-link]').first().click();
    cy.location('pathname').should('match', /^\/scans\/[a-f0-9]{24}$/);
    cy.get('[data-testid=scan-title]').should('contain', 'Scan');
    cy.get('[data-testid=meta-root-path]').should('contain', 'fixture-banking-bot');
    cy.get('[data-testid=meta-findings]').should('contain', '10');
    cy.get('[data-testid=severity-group-critical]').should('exist');
    cy.get('[data-testid=severity-group-high]').should('exist');
    cy.get('[data-testid=finding-row][data-rule-id=R001]').should('exist');
    cy.get('[data-testid=finding-row][data-rule-id=R005]').should('exist');
    // Code snippet is attached when the file is readable from rootPath.
    cy.get('[data-testid=finding-snippet]').should('have.length.greaterThan', 0);
    cy.get('[data-testid=back-link]').click();
    cy.location('pathname').should('eq', '/');
  });

  it('falls back to a 404 for an unknown scan id', () => {
    signIn();
    cy.request({
      url: '/scans/000000000000000000000000',
      failOnStatusCode: false,
    }).then((res) => {
      expect(res.status).to.equal(404);
    });
  });
});
