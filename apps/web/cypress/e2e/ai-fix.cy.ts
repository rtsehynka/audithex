/**
 * AI fix flow + PDF download.
 *
 * The orchestrator boots Next.js with AUDITHEX_LLM_DRY_RUN=true so the
 * Explain-fix button returns a deterministic dry-run response without
 * hitting the Anthropic API.
 */

describe('audithex web — AI fix + PDF export', () => {
  it('requests an AI fix in dry-run mode, then serves the cached copy', () => {
    cy.signIn();
    cy.get('[data-testid=scan-link]').first().click();
    cy.location('pathname').should('match', /^\/scans\/[a-f0-9]{24}$/);

    cy.get('[data-testid=ai-fix-button]').first().as('btn');
    cy.get('@btn').should('contain', 'Explain how to fix').click();
    cy.get('[data-testid=ai-fix-result]', { timeout: 10_000 }).first().as('card');
    cy.get('@card').find('[data-testid=ai-fix-provider]').should('contain', 'dry-run');
    cy.get('@card').find('[data-testid=ai-fix-cost]').should('contain', '$0.0000');
    cy.get('@card').find('[data-testid=ai-fix-cache-state]').should('contain', 'fresh response');

    // Reloading the page should render the same fix from the server-side cache.
    cy.reload();
    cy.get('[data-testid=ai-fix-result]', { timeout: 10_000 })
      .first()
      .find('[data-testid=ai-fix-cache-state]')
      .should('contain', 'served from cache');
  });

  it('serves a real PDF download from /scans/[id]/pdf', () => {
    cy.signIn();
    cy.get('[data-testid=scan-link]')
      .first()
      .then(($link) => {
        const id = $link.attr('href')?.split('/').pop();
        expect(id).to.match(/^[a-f0-9]{24}$/);
        cy.request({ url: `/scans/${id}/pdf`, encoding: 'binary' }).then((res) => {
          expect(res.status).to.equal(200);
          expect(res.headers['content-type']).to.contain('application/pdf');
          // PDF files begin with the magic bytes "%PDF"
          expect(res.body.slice(0, 4)).to.equal('%PDF');
        });
      });
  });
});
