/**
 * /projects/new and /projects/[id] — database (RAG) section.
 *
 * Live Postgres scanning is unit-tested in @audithex/core-db-scan with
 * pg-mem. This spec covers only the form behaviour: the new fields
 * render, persist across save/reload, and the scan-all-tables toggle
 * round-trips its state.
 */

describe('audithex web — project DB connection card', () => {
  it('persists a postgres connection + table list + scan-all flag', () => {
    cy.signIn();
    cy.visit('/projects/new');
    cy.get('[data-testid=project-name]').type('rag-project');
    cy.get('[data-testid=project-root-path]').type('/tmp/rag-project');
    cy.get('[data-testid=project-db]').should('exist');
    cy.get('[data-testid=project-db-driver]').select('postgres');
    cy.get('[data-testid=project-db-uri]').type('postgres://user:pass@localhost:5432/rag');
    cy.get('[data-testid=project-db-database]').type('rag');
    cy.get('[data-testid=project-db-tables]').type('public.documents, public.conversations');
    cy.get('[data-testid=project-submit]').click();
    cy.location('pathname').should('match', /^\/projects\/[a-f0-9]{24}$/);

    // Reload the detail page and confirm the form is pre-populated.
    cy.reload();
    cy.get('[data-testid=project-db-driver]').should('have.value', 'postgres');
    cy.get('[data-testid=project-db-uri]').should(
      'have.value',
      'postgres://user:pass@localhost:5432/rag',
    );
    cy.get('[data-testid=project-db-database]').should('have.value', 'rag');
    cy.get('[data-testid=project-db-tables]').should(
      'have.value',
      'public.documents, public.conversations',
    );
    cy.get('[data-testid=project-db-scan-all]').should('not.be.checked');

    // Toggle scan-all on, save, reload, confirm.
    cy.get('[data-testid=project-db-scan-all]').check();
    cy.get('[data-testid=project-submit]').click();
    cy.get('[data-testid=project-form-saved]').should('exist');
    cy.reload();
    cy.get('[data-testid=project-db-scan-all]').should('be.checked');

    // Cleanup so the orchestrator-shared DB stays tidy.
    cy.get('[data-testid=delete-project]').click();
    cy.location('pathname').should('eq', '/projects');
  });

  it('rejects a driver selection with no URI', () => {
    cy.signIn();
    cy.visit('/projects/new');
    cy.get('[data-testid=project-name]').type('rag-no-uri');
    cy.get('[data-testid=project-root-path]').type('/tmp/rag-no-uri');
    cy.get('[data-testid=project-db-driver]').select('postgres');
    cy.get('[data-testid=project-submit]').click();
    cy.location('pathname').should('eq', '/projects/new');
    cy.contains('Connection URI is required').should('exist');
  });
});
