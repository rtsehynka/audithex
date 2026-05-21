/**
 * Diff view at /scans/[id]/compare/[otherId].
 *
 * The orchestrator seeds TWO scans before this spec runs:
 *   1. fixture-banking-bot — 10 findings
 *   2. an empty stub project — 0 findings
 * The compare view should report 0 added (clean → vuln direction), 10
 * removed, 0 unchanged when diffing the clean candidate against the
 * banking-bot baseline.
 */

describe('audithex web — scan diff', () => {
  it('exposes the Diff vs… picker and navigates to the compare route', () => {
    cy.signIn();
    cy.get('[data-testid=scan-link]').first().click();
    cy.location('pathname').should('match', /^\/scans\/[a-f0-9]{24}$/);
    cy.get('[data-testid=compare-picker]')
      .should('exist')
      .find('option')
      .should('have.length.greaterThan', 1);
    cy.get('[data-testid=compare-picker]')
      .find('[data-testid=compare-option]')
      .first()
      .then((opt) => {
        const otherId = opt.attr('value');
        expect(otherId).to.match(/^[a-f0-9]{24}$/);
        cy.get('[data-testid=compare-picker]').select(otherId as string);
        cy.location('pathname').should('match', /^\/scans\/[a-f0-9]{24}\/compare\/[a-f0-9]{24}$/);
      });
  });

  it('renders added/removed totals and grouped diff rows', () => {
    cy.signIn();
    cy.request('/?limit=2').its('status').should('eq', 200);
    cy.window().then(async (win) => {
      const res = await win.fetch('/?limit=2');
      // Cypress request used above only validates server reachability;
      // we already have the table on screen from cy.signIn().
      void res;
    });
    cy.get('[data-testid=scan-link]').then((links) => {
      const ids = Array.from(links).map(
        (el) => (el as HTMLAnchorElement).pathname.split('/').pop() ?? '',
      );
      expect(ids.length).to.be.greaterThan(1);
      const [first, second] = ids as [string, string];
      cy.visit(`/scans/${first}/compare/${second}`);
      cy.get('[data-testid=compare-title]').should('contain', 'Compare two scans');
      cy.get('[data-testid=total-added]').should('exist');
      cy.get('[data-testid=total-removed]').should('exist');
      cy.get('[data-testid=total-unchanged]').should('exist');
      // One scan is empty and the other has all 10 banking-bot findings;
      // exactly one direction must report 10.
      cy.get('[data-testid=group-removed-count]')
        .invoke('text')
        .then((removedText) => {
          cy.get('[data-testid=group-added-count]')
            .invoke('text')
            .then((addedText) => {
              const removed = Number(removedText.replace(/\D/g, ''));
              const added = Number(addedText.replace(/\D/g, ''));
              expect(added + removed).to.equal(10);
            });
        });
      cy.get('[data-testid=back-link]').click();
      cy.location('pathname').should('match', /^\/scans\/[a-f0-9]{24}$/);
    });
  });
});
