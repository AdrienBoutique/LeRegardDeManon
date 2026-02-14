import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-navbar',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './navbar.html',
  styleUrl: './navbar.scss'
})
export class Navbar {
  private readonly router = inject(Router);
  private longPressTimer: ReturnType<typeof setTimeout> | null = null;
  private longPressTriggered = false;

  protected readonly menuOpen = signal(false);
  protected readonly proModalOpen = signal(false);

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

  private openProAccess(): void {
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
