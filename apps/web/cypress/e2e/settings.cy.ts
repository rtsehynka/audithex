/**
 * /settings — read-only info page.
 *
 * The orchestrator has already seeded a user and 2 scans, so the
 * scan_runs count should be at least 2 and the Mongo connection
 * should be reported as healthy.
 */

describe('audithex web — settings page', () => {
  it('shows mongo + audithex + session info', () => {
    cy.signIn();
    cy.get('[data-testid=settings-link]').click();
    cy.location('pathname').should('eq', '/settings');

    cy.get('[data-testid=audithex-version]').should('contain', '0.0.0-dev');
    cy.get('[data-testid=session-ttl]').should('contain', 's');
    cy.get('[data-testid=cookie-name]').should('contain', 'audithex_session');

    cy.get('[data-testid=mongo-uri]').should('contain', 'mongodb://');
    cy.get('[data-testid=mongo-status]').should('contain', 'connected');
    cy.get('[data-testid=mongo-scan-count]')
      .invoke('text')
      .then((txt) => {
        expect(Number(txt.trim())).to.be.greaterThan(1);
      });
    // No update has been recorded by the orchestrator, so the
    // updates list should explicitly say so.
    cy.get('[data-testid=no-rules-pack-updates]').should('exist');

    cy.get('[data-testid=back-link]').click();
    cy.location('pathname').should('eq', '/');
  });
});
