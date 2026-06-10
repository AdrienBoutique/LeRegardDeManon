import { Component, HostListener, OnDestroy, inject, signal } from '@angular/core';
import { FormationContentItem, FormationsApi, defaultFormationContent } from '../../core/api/formations.api';

@Component({
  selector: 'app-trainings',
  imports: [],
  templateUrl: './trainings.html',
  styleUrl: './trainings.scss'
})
export class Trainings implements OnDestroy {
  private readonly formationsApi = inject(FormationsApi);

  protected readonly formations = signal<FormationContentItem[]>(defaultFormationContent());
  protected readonly selectedBrochure = signal<FormationContentItem | null>(null);
  protected readonly loading = signal(false);
  protected readonly errorMessage = signal('');

  constructor() {
    this.loadFormations();
  }

  ngOnDestroy(): void {
    this.unlockScroll();
  }

  protected openBrochure(formation: FormationContentItem): void {
    this.selectedBrochure.set(formation);
    this.lockScroll();
  }

  protected closeBrochure(): void {
    this.selectedBrochure.set(null);
    this.unlockScroll();
  }

  protected onBackdropClick(): void {
    this.closeBrochure();
  }

  protected onModalClick(event: MouseEvent): void {
    event.stopPropagation();
  }

  protected onCardKeydown(event: KeyboardEvent, formation: FormationContentItem): void {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }

    event.preventDefault();
    this.openBrochure(formation);
  }

  protected hasEventButton(formation: FormationContentItem): boolean {
    return Boolean(formation.showEventButton && formation.eventUrl?.trim());
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    if (this.selectedBrochure()) {
      this.closeBrochure();
    }
  }

  private loadFormations(): void {
    this.loading.set(true);
    this.errorMessage.set('');

    this.formationsApi.getPublicFormations().subscribe({
      next: (items) => {
        this.formations.set(items);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.errorMessage.set('Impossible de charger les formations.');
      }
    });
  }

  private lockScroll(): void {
    if (typeof document === 'undefined') {
      return;
    }

    document.body.style.overflow = 'hidden';
  }

  private unlockScroll(): void {
    if (typeof document === 'undefined') {
      return;
    }

    document.body.style.overflow = '';
  }
}
