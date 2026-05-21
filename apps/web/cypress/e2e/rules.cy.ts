/**
 * Rules browser (/rules, /rules/[id]).
 *
 * The page loads from the active rules pack on disk, so it does not
 * depend on any Mongo seeding the orchestrator does. The bundled pack
 * always ships with R001 – R010 enabled.
 */

describe('audithex web — rules browser', () => {
  it('lists every rule in the active pack', () => {
    cy.signIn();
    cy.get('[data-testid=rules-link]').click();
    cy.location('pathname').should('eq', '/rules');
    cy.get('[data-testid=rules-table]').should('exist');
    cy.get('[data-testid=rule-row]').should('have.length.greaterThan', 0);
    cy.get('[data-testid=rule-row][data-rule-id=R001]').should('exist');
    cy.get('[data-testid=rule-row][data-rule-id=R010]').should('exist');
    cy.get('[data-testid=rules-count]')
      .invoke('text')
      .then((txt) => {
        expect(Number.parseInt(txt, 10)).to.be.greaterThan(0);
      });
  });

  it('drills into a rule and renders message + fix + engine params', () => {
    cy.signIn();
    cy.visit('/rules');
    cy.get('[data-testid=rule-row][data-rule-id=R009] [data-testid=rule-link]').click();
    cy.location('pathname').should('eq', '/rules/R009');
    cy.get('[data-testid=rule-id]').should('contain', 'R009');
    cy.get('[data-testid=rule-title]').should('not.be.empty');
    cy.get('[data-testid=rule-message]').should('contain', 'SQL');
    cy.get('[data-testid=rule-fix]').should('contain', 'parameterised');
    cy.get('[data-testid=rule-engine-params]').should('exist');
    cy.get('[data-testid=meta-owasp]').should('contain', 'LLM02');
    cy.get('[data-testid=back-link]').click();
    cy.location('pathname').should('eq', '/rules');
  });

  it('returns a 404 for unknown rule ids', () => {
    cy.signIn();
    cy.request({ url: '/rules/R999', failOnStatusCode: false }).then((res) => {
      expect(res.status).to.equal(404);
    });
    cy.request({ url: '/rules/not-an-id', failOnStatusCode: false }).then((res) => {
      expect(res.status).to.equal(404);
    });
  });
});
