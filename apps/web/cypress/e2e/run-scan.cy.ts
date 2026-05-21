/**
 * Live "Run scan" runner on /projects/[id].
 *
 * The orchestrator already seeds a `banking-bot` project; this spec
 * clicks the in-card button, asserts the SSE log streams per-rule
 * progress, and follows the "Open scan" link into /scans/[id].
 */

describe('audithex web — live scan runner', () => {
  it('streams per-rule progress and lands on the new scan detail', () => {
    cy.signIn();
    cy.visit('/projects');
    cy.get('[data-testid=project-link]').contains('banking-bot').click();
    cy.location('pathname').should('match', /^\/projects\/[a-f0-9]{24}$/);
    cy.get('[data-testid=run-scan-card]').should('exist');
    cy.get('[data-testid=run-scan-button]').click();

    // The discovery + rule-loaded + per-rule + persist + done events
    // all arrive in order — assert on the ones the user actually reads.
    cy.get('[data-testid=run-scan-log]', { timeout: 30_000 }).should('contain', 'Discovered');
    cy.get('[data-testid=run-scan-log]').should('contain', 'Loaded rules pack');
    cy.get('[data-testid=run-scan-log-line]').should('have.length.greaterThan', 5);
    cy.get('[data-testid=run-scan-done]', { timeout: 60_000 }).should('contain', 'Scan complete');
    cy.get('[data-testid=run-scan-open]').click();
    cy.location('pathname', { timeout: 10_000 }).should('match', /^\/scans\/[a-f0-9]{24}$/);
    cy.get('[data-testid=scan-title]').should('contain', 'Scan');
  });

  it('rejects requests without a projectId param', () => {
    cy.signIn();
    cy.request({ url: '/api/scans/run', failOnStatusCode: false }).then((res) => {
      expect(res.status).to.equal(400);
    });
  });
});
