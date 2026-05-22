/**
 * Projects CRUD (/projects, /projects/new, /projects/[id]).
 *
 * The orchestrator seeds a `banking-bot` project before this spec runs
 * and attaches the banking-bot scan to it, so the table is guaranteed
 * to have at least one row and the detail page has at least one scan
 * in its history section. Auth uses the shared `cy.signIn()` command
 * defined in cypress/support/e2e.ts.
 */

describe('audithex web — projects CRUD', () => {
  it('lists the seeded banking-bot project and links to detail', () => {
    cy.signIn();
    cy.get('[data-testid=projects-link]').click();
    cy.location('pathname').should('eq', '/projects');
    cy.get('[data-testid=projects-table]').should('exist');
    cy.get('[data-testid=project-row]').should('have.length.greaterThan', 0);
    cy.get('[data-testid=project-link]').contains('banking-bot').click();
    cy.location('pathname').should('match', /^\/projects\/[a-f0-9]{24}$/);
    cy.get('[data-testid=project-title]').should('contain', 'banking-bot');
    cy.get('[data-testid=detail-root-path]').should('contain', 'fixture-banking-bot');
    cy.get('[data-testid=project-scan-row]').should('have.length.greaterThan', 0);
    // Rules now live behind a tab; flip to it before asserting on the table.
    cy.get('[data-testid=tab-rules]').click();
    cy.get('[data-testid=project-rules]').should('be.visible');
    cy.get('[data-testid=rule-row]').should('have.length.greaterThan', 0);
    cy.get('[data-testid=rule-row][data-rule-id=R001]').should('exist');
  });

  it('creates a new project, disabling two rules and overriding one severity', () => {
    cy.signIn();
    cy.visit('/projects/new');
    // Basics tab is the default — fill the name/root/description.
    cy.get('[data-testid=project-name]').type('cypress-acceptance');
    cy.get('[data-testid=project-root-path]').type('/tmp/cypress-acceptance');
    cy.get('[data-testid=project-description]').type('Created by the Cypress orchestrator.');
    // Move to the Rules tab to flip rule-level toggles.
    cy.get('[data-testid=tab-rules]').click();
    // All rules ship enabled (checked) by default — untick to disable.
    cy.get('[data-testid=rule-row][data-rule-id=R003] [data-testid=rule-enabled]').uncheck();
    cy.get('[data-testid=rule-row][data-rule-id=R007] [data-testid=rule-enabled]').uncheck();
    cy.get('[data-testid=rule-row][data-rule-id=R009] [data-testid=rule-override]').select('low');
    cy.get('[data-testid=project-submit]').click();
    cy.location('pathname').should('match', /^\/projects\/[a-f0-9]{24}$/);
    cy.get('[data-testid=project-title]').should('contain', 'cypress-acceptance');
    cy.get('[data-testid=detail-root-path]').should('contain', '/tmp/cypress-acceptance');
    cy.get('[data-testid=tab-rules]').click();
    cy.get('[data-testid=rule-row][data-rule-id=R003] [data-testid=rule-enabled]').should(
      'not.be.checked',
    );
    cy.get('[data-testid=rule-row][data-rule-id=R007] [data-testid=rule-enabled]').should(
      'not.be.checked',
    );
    cy.get('[data-testid=rule-row][data-rule-id=R001] [data-testid=rule-enabled]').should(
      'be.checked',
    );
    cy.get('[data-testid=rule-row][data-rule-id=R009] [data-testid=rule-override]').should(
      'have.value',
      'low',
    );
    cy.get('[data-testid=project-scans-empty]').should('exist');
  });

  it('edits the project and shows the saved confirmation', () => {
    cy.signIn();
    cy.visit('/projects');
    cy.get('[data-testid=project-link]').contains('cypress-acceptance').click();
    cy.get('[data-testid=project-description]').clear().type('Edited by the spec.');
    // Re-enable the previously-disabled R003 rule via the Rules tab.
    cy.get('[data-testid=tab-rules]').click();
    cy.get('[data-testid=rule-row][data-rule-id=R003] [data-testid=rule-enabled]').check();
    cy.get('[data-testid=project-submit]').click();
    cy.get('[data-testid=project-form-saved]').should('exist');
    cy.reload();
    cy.get('[data-testid=tab-rules]').click();
    cy.get('[data-testid=rule-row][data-rule-id=R003] [data-testid=rule-enabled]').should(
      'be.checked',
    );
  });

  it('deletes the cypress-acceptance project from the detail page', () => {
    cy.signIn();
    cy.visit('/projects');
    cy.get('[data-testid=project-link]').contains('cypress-acceptance').click();
    cy.get('[data-testid=delete-project]').click();
    cy.location('pathname').should('eq', '/projects');
    cy.get('[data-testid=project-row]')
      .find('[data-testid=project-link]')
      .each(($el) => {
        expect($el.text()).not.to.contain('cypress-acceptance');
      });
  });

  it('shows the project link in the scan history table', () => {
    cy.signIn();
    cy.visit('/');
    cy.get('[data-testid=scan-row]').should('have.length.greaterThan', 0);
    cy.get('[data-testid=scan-project]').first().should('contain', 'banking-bot');
  });
});
