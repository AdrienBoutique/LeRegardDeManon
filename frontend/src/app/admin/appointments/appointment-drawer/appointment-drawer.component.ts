import { CommonModule } from '@angular/common';
import { Component, HostListener, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AppointmentUiService } from '../appointment-ui.service';
import { AppointmentWizardComponent } from '../appointment-wizard/appointment-wizard.component';

@Component({
  selector: 'app-appointment-drawer',
  imports: [CommonModule, AppointmentWizardComponent],
  templateUrl: './appointment-drawer.component.html',
  styleUrl: './appointment-drawer.component.scss'
})
export class AppointmentDrawerComponent {
  private readonly ui = inject(AppointmentUiService);

  protected readonly isOpen = signal(false);
  protected readonly mode = signal<'create' | 'edit'>('create');

  constructor() {
    this.ui.isOpen$.pipe(takeUntilDestroyed()).subscribe((value) => this.isOpen.set(value));
    this.ui.mode$.pipe(takeUntilDestroyed()).subscribe((value) => this.mode.set(value));
  }

  protected close(): void {
    this.ui.close();
  }

  @HostListener('document:keydown.escape')
  protected onEsc(): void {
    if (this.isOpen()) {
      this.close();
    }
  }
}

