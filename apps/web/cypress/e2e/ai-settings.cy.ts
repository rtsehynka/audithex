/**
 * /settings/ai — provider/key/model singleton.
 *
 * Saves the form once with each of the three supported providers and
 * verifies that the dropdown plus persisted-key indicator round-trip
 * across reloads. Restores anthropic at the end so other specs that
 * sit on AUDITHEX_LLM_DRY_RUN keep their behaviour predictable.
 */

describe('audithex web — /settings/ai', () => {
  it('renders the form linked from /settings', () => {
    cy.signIn();
    cy.visit('/settings');
    cy.get('[data-testid=ai-settings-link]').click();
    cy.location('pathname').should('eq', '/settings/ai');
    cy.get('[data-testid=ai-settings-card]').should('exist');
    cy.get('[data-testid=ai-provider]').should('have.value', 'anthropic');
  });

  it('saves OpenAI provider + key + model + cost cap', () => {
    cy.signIn();
    cy.visit('/settings/ai');
    cy.get('[data-testid=ai-provider]').select('openai');
    cy.get('[data-testid=ai-key]').type('sk-test-openai-key');
    cy.get('[data-testid=ai-model]').clear().type('gpt-4o-mini');
    cy.get('[data-testid=ai-cost-cap]').clear().type('0.50');
    cy.get('[data-testid=ai-settings-submit]').click();
    cy.get('[data-testid=ai-settings-saved]').should('exist');
    cy.reload();
    cy.get('[data-testid=ai-provider]').should('have.value', 'openai');
    cy.get('[data-testid=ai-model]').should('have.value', 'gpt-4o-mini');
    cy.contains('currently saved').should('exist');
  });

  it('switches to Gemini and back to Anthropic', () => {
    cy.signIn();
    cy.visit('/settings/ai');
    cy.get('[data-testid=ai-provider]').select('gemini');
    cy.get('[data-testid=ai-key]').type('AIza-test-gemini');
    cy.get('[data-testid=ai-model]').clear().type('gemini-2.0-flash');
    cy.get('[data-testid=ai-settings-submit]').click();
    cy.get('[data-testid=ai-settings-saved]').should('exist');

    cy.reload();
    cy.get('[data-testid=ai-provider]').select('anthropic');
    cy.get('[data-testid=ai-key]').type('sk-ant-test-key');
    cy.get('[data-testid=ai-model]').clear().type('claude-sonnet-4-6');
    cy.get('[data-testid=ai-cost-cap]').clear().type('1.00');
    cy.get('[data-testid=ai-settings-submit]').click();
    cy.get('[data-testid=ai-settings-saved]').should('exist');
  });

  it('rejects an empty model id', () => {
    cy.signIn();
    cy.visit('/settings/ai');
    cy.get('[data-testid=ai-model]').clear();
    cy.get('[data-testid=ai-settings-submit]').click();
    cy.location('pathname').should('eq', '/settings/ai');
    cy.contains('Model id is required').should('exist');
  });
});
