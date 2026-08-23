// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AuthBanner } from '../AuthBanner';
import { LOGIN_URL } from '../../auth/session';

function makeBanner(): { banner: AuthBanner; root: HTMLElement } {
  const root = document.createElement('div');
  document.body.appendChild(root);
  return { banner: new AuthBanner(root), root };
}

describe('AuthBanner', () => {
  it('showSpectator renders the login link', () => {
    const { banner, root } = makeBanner();
    banner.showSpectator();
    const link = root.querySelector('.auth-banner a') as HTMLAnchorElement;
    expect(link.href).toBe(LOGIN_URL);
    expect(link.textContent).toBe('Se connecter pour dessiner');
  });

  it('showUser renders the user name', () => {
    const { banner, root } = makeBanner();
    banner.showUser('kylian');
    const el = root.querySelector('.auth-banner');
    expect(el?.textContent).toBe('kylian');
  });

  describe('toast', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('shows the message and auto-hides', () => {
      const { banner, root } = makeBanner();
      banner.toast('Connecte-toi pour dessiner');
      const el = root.querySelector('.auth-toast');
      expect(el?.textContent).toBe('Connecte-toi pour dessiner');
      expect(el?.classList.contains('is-visible')).toBe(true);
      vi.advanceTimersByTime(2500);
      expect(el?.classList.contains('is-visible')).toBe(false);
    });
  });
});
