import { Component, computed, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  defaultFormationContent,
  FormationContentItem,
  FormationContentPayload,
  FormationsApi
} from '../../../core/api/formations.api';

@Component({
  selector: 'app-admin-formations',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './admin-formations.html',
  styleUrl: './admin-formations.scss'
})
export class AdminFormations {
  private readonly api = inject(FormationsApi);
  private readonly formBuilder = inject(FormBuilder);

  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly errorMessage = signal('');
  protected readonly toastMessage = signal('');
  protected readonly formations = signal<FormationContentItem[]>(defaultFormationContent());
  protected readonly editingId = signal<string | null>(null);
  protected readonly selectedFormation = computed(
    () => this.formations().find((formation) => formation.id === this.editingId()) ?? null
  );

  protected readonly form = this.formBuilder.nonNullable.group({
    title: ['', [Validators.required]],
    category: ['', [Validators.required]],
    description: ['', [Validators.required]],
    brochureImageUrl: ['', [Validators.required]],
    eventUrl: [''],
    nextDatesText: [''],
    sessionNote: [''],
    showEventButton: [false]
  });

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.errorMessage.set('');

    this.api.getAdminFormations().subscribe({
      next: (items) => {
        this.formations.set(items.length > 0 ? items : defaultFormationContent());
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.errorMessage.set('Impossible de charger les formations.');
      }
    });
  }

  protected startEdit(formation: FormationContentItem): void {
    this.editingId.set(formation.id);
    this.form.reset({
      title: formation.title,
      category: formation.category,
      description: formation.description,
      brochureImageUrl: formation.brochureImageUrl,
      eventUrl: formation.eventUrl ?? '',
      nextDatesText: formation.nextDatesText ?? '',
      sessionNote: formation.sessionNote ?? '',
      showEventButton: formation.showEventButton
    });
  }

  protected cancelEdit(): void {
    this.editingId.set(null);
  }

  protected hasEventLink(formation: FormationContentItem | null): boolean {
    return Boolean(formation?.showEventButton && formation.eventUrl?.trim());
  }

  protected save(): void {
    const id = this.editingId();
    if (!id || this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.errorMessage.set('');

    const value = this.form.getRawValue();
    const payload: FormationContentPayload = {
      title: value.title.trim(),
      category: value.category.trim(),
      description: value.description.trim(),
      brochureImageUrl: value.brochureImageUrl.trim(),
      eventUrl: value.eventUrl.trim() ? value.eventUrl.trim() : null,
      nextDatesText: value.nextDatesText.trim() ? value.nextDatesText.trim() : null,
      sessionNote: value.sessionNote.trim() ? value.sessionNote.trim() : null,
      showEventButton: value.showEventButton
    };

    this.api.updateFormation(id, payload).subscribe({
      next: (updated) => {
        this.saving.set(false);
        this.formations.update((items) => items.map((item) => (item.id === updated.id ? updated : item)));
        this.form.patchValue({
          title: updated.title,
          category: updated.category,
          description: updated.description,
          brochureImageUrl: updated.brochureImageUrl,
          eventUrl: updated.eventUrl ?? '',
          nextDatesText: updated.nextDatesText ?? '',
          sessionNote: updated.sessionNote ?? '',
          showEventButton: updated.showEventButton
        });
        this.toastMessage.set('Formation mise a jour.');
        setTimeout(() => this.toastMessage.set(''), 2200);
      },
      error: (error: { error?: { error?: string } }) => {
        this.saving.set(false);
        this.errorMessage.set(error.error?.error ?? 'Sauvegarde impossible.');
      }
    });
  }

  protected removeEventLink(): void {
    const id = this.editingId();
    if (!id || this.saving()) {
      return;
    }

    this.saving.set(true);
    this.errorMessage.set('');

    this.api.removeEventLink(id).subscribe({
      next: (updated) => {
        this.saving.set(false);
        this.formations.update((items) => items.map((item) => (item.id === updated.id ? updated : item)));
        this.form.patchValue({
          eventUrl: '',
        });
        this.toastMessage.set('Lien evenement supprime.');
        setTimeout(() => this.toastMessage.set(''), 2200);
      },
      error: (error: { error?: { error?: string } }) => {
        this.saving.set(false);
        this.errorMessage.set(error.error?.error ?? 'Suppression du lien impossible.');
      }
    });
  }

  protected formatDatesText(text: string | null | undefined): string {
    return text?.trim() || 'Aucune date renseignee';
  }
}
