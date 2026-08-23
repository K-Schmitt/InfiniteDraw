import { LOGIN_URL } from '../auth/session';
import './authBanner.css';

/** Top-center auth status banner + transient rejection toast (spec §5: never reject silently). */
export class AuthBanner {
  private readonly banner: HTMLDivElement;
  private readonly toastEl: HTMLDivElement;
  private toastTimer: number | null = null;

  constructor(root: HTMLElement) {
    this.banner = document.createElement('div');
    this.banner.className = 'auth-banner';
    this.toastEl = document.createElement('div');
    this.toastEl.className = 'auth-toast';
    root.append(this.banner, this.toastEl);
  }

  showSpectator(): void {
    this.banner.innerHTML =
      `<span>Mode spectateur</span><a href="${LOGIN_URL}">Se connecter pour dessiner</a>`;
    this.banner.classList.remove('is-authed');
    this.banner.classList.add('is-visible');
  }

  showUser(name: string): void {
    this.banner.textContent = name;
    this.banner.classList.add('is-visible', 'is-authed');
  }

  toast(message: string): void {
    this.toastEl.textContent = message;
    this.toastEl.classList.add('is-visible');
    if (this.toastTimer !== null) window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(
      () => this.toastEl.classList.remove('is-visible'), 2500);
  }
}
