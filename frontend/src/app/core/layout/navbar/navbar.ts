import { NgIf } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-navbar',
  imports: [RouterLink, RouterLinkActive, NgIf],
  templateUrl: './navbar.html',
  styleUrl: './navbar.scss'
})
export class Navbar {
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private longPressTimer: ReturnType<typeof setTimeout> | null = null;
  private longPressTriggered = false;

  protected readonly menuOpen = signal(false);
  protected readonly proModalOpen = signal(false);
  protected get isAdmin(): boolean {
    return this.authService.getCurrentUser()?.role === 'ADMIN';
  }

  protected toggleMenu(): void {
    this.menuOpen.update((value) => !value);
  }

  protected closeMenu(): void {
    this.menuOpen.set(false);
  }

  protected onBrandPointerDown(event: PointerEvent): void {
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return;
    }

    this.longPressTriggered = false;
    this.clearLongPressTimer();

    this.longPressTimer = setTimeout(() => {
      this.openProAccess();
      this.longPressTriggered = true;
    }, 900);
  }

  protected onBrandPointerEnd(): void {
    this.clearLongPressTimer();
  }

  protected onBrandContextMenu(event: MouseEvent): void {
    event.preventDefault();
    this.openProAccess();
    this.longPressTriggered = true;
  }

  protected onBrandClick(event: MouseEvent): void {
    if (this.longPressTriggered) {
      event.preventDefault();
      event.stopPropagation();
      this.longPressTriggered = false;
    }
  }

  protected closeProAccess(): void {
    this.proModalOpen.set(false);
  }

  protected openAdminLogin(): void {
    this.closeProAccess();
    this.router.navigateByUrl('/admin/login');
  }

  protected editHomepage(): void {
    this.router.navigateByUrl('/admin/dashboard');
  }

  private openProAccess(): void {
    if (this.authService.isLoggedIn()) {
      this.router.navigateByUrl('/admin/dashboard');
      return;
    }

    this.closeMenu();
    this.proModalOpen.set(true);

    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(20);
    }
  }

  private clearLongPressTimer(): void {
    if (!this.longPressTimer) {
      return;
    }

    clearTimeout(this.longPressTimer);
    this.longPressTimer = null;
  }
}
