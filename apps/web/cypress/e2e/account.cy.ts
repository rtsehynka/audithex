/**
 * /settings/account — change email + change password.
 *
 * The orchestrator seeds the canonical tester@audithex.local / password
 * combo. This spec walks the password rotation end-to-end (rotate →
 * login with new pw → assert old pw is rejected → rotate back) and the
 * email rename, then sets everything back to the orchestrator defaults
 * so later specs in the same Mongo run can still sign in.
 */

const EMAIL = Cypress.env('EMAIL') as string;
const PASSWORD = Cypress.env('PASSWORD') as string;
const ROTATED_PASSWORD = 'rotated-tester-pw-987';
const RENAMED_EMAIL = 'tester-renamed@audithex.local';

function login(email: string, password: string): void {
  cy.clearCookies();
  cy.visit('/login');
  cy.get('[data-testid=login-email]').type(email);
  cy.get('[data-testid=login-password]').type(password);
  cy.get('[data-testid=login-submit]').click();
}

describe('audithex web — account settings', () => {
  it('rejects a change-email submission when the current password is wrong', () => {
    cy.signIn();
    cy.visit('/settings/account');
    cy.get('[data-testid=email-current-password]').type('definitely-not-the-pw');
    cy.get('[data-testid=email-new]').type('whatever@audithex.local');
    cy.get('[data-testid=change-email-card-submit]').click();
    cy.get('[data-testid=email-current-password-error]').should(
      'contain',
      'Current password is incorrect',
    );
  });

  it('rotates the password, signs in with the new one, then restores the original', () => {
    cy.signIn();
    cy.visit('/settings/account');
    cy.get('[data-testid=pw-current]').type(PASSWORD);
    cy.get('[data-testid=pw-new]').type(ROTATED_PASSWORD);
    cy.get('[data-testid=pw-confirm]').type(ROTATED_PASSWORD);
    cy.get('[data-testid=change-password-card-submit]').click();
    cy.get('[data-testid=change-password-card-saved]').should('exist');

    // Old password must be rejected.
    login(EMAIL, PASSWORD);
    cy.get('[data-testid=login-error]').should('exist');

    // New password must work.
    login(EMAIL, ROTATED_PASSWORD);
    cy.location('pathname').should('eq', '/');

    // Restore so the rest of the orchestrator run still works.
    cy.visit('/settings/account');
    cy.get('[data-testid=pw-current]').type(ROTATED_PASSWORD);
    cy.get('[data-testid=pw-new]').type(PASSWORD);
    cy.get('[data-testid=pw-confirm]').type(PASSWORD);
    cy.get('[data-testid=change-password-card-submit]').click();
    cy.get('[data-testid=change-password-card-saved]').should('exist');
  });

  it('renames the account email, keeps the session live, then restores it', () => {
    cy.signIn();
    cy.visit('/settings/account');
    cy.get('[data-testid=email-current-password]').type(PASSWORD);
    cy.get('[data-testid=email-new]').type(RENAMED_EMAIL);
    cy.get('[data-testid=change-email-card-submit]').click();
    cy.get('[data-testid=change-email-card-saved]').should('exist');
    // The same session cookie should still resolve; the visible email
    // updates on the next navigation.
    cy.visit('/settings');
    cy.get('[data-testid=session-email]').should('contain', RENAMED_EMAIL);

    // Restore the original email.
    cy.visit('/settings/account');
    cy.get('[data-testid=email-current-password]').type(PASSWORD);
    cy.get('[data-testid=email-new]').type(EMAIL);
    cy.get('[data-testid=change-email-card-submit]').click();
    cy.get('[data-testid=change-email-card-saved]').should('exist');
  });

  it('rejects mismatching new password / confirmation', () => {
    cy.signIn();
    cy.visit('/settings/account');
    cy.get('[data-testid=pw-current]').type(PASSWORD);
    cy.get('[data-testid=pw-new]').type('matching-new-pw');
    cy.get('[data-testid=pw-confirm]').type('different-confirm');
    cy.get('[data-testid=change-password-card-submit]').click();
    cy.get('[data-testid=pw-confirm-error]').should('contain', 'do not match');
  });
});
