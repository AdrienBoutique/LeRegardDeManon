import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-admin-account',
  imports: [ReactiveFormsModule],
  templateUrl: './admin-account.html',
  styleUrl: './admin-account.scss'
})
export class AdminAccount {
  private readonly authService = inject(AuthService);
  private readonly formBuilder = inject(FormBuilder);

  protected readonly loading = signal(false);
  protected readonly successMessage = signal('');
  protected readonly errorMessage = signal('');
  protected readonly user = signal(this.authService.getCurrentUser());

  protected readonly form = this.formBuilder.nonNullable.group({
    currentPassword: ['', [Validators.required]],
    newPassword: ['', [Validators.required, Validators.minLength(8)]],
    confirmPassword: ['', [Validators.required]]
  });

  protected roleLabel(): string {
    const user = this.user();
    if (!user) {
      return 'Compte';
    }

    return user.role === 'ADMIN' ? 'Administration' : 'Praticienne';
  }

  protected submit(): void {
    if (this.form.invalid || this.loading()) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();
    if (raw.newPassword !== raw.confirmPassword) {
      this.errorMessage.set('La confirmation du mot de passe ne correspond pas.');
      return;
    }

    this.loading.set(true);
    this.errorMessage.set('');
    this.successMessage.set('');

    this.authService.changePassword(raw.currentPassword, raw.newPassword).subscribe({
      next: (user) => {
        this.loading.set(false);
        this.user.set(user);
        this.form.reset({
          currentPassword: '',
          newPassword: '',
          confirmPassword: ''
        });
        this.successMessage.set('Mot de passe mis à jour.');
      },
      error: (error: { status?: number; error?: { error?: string } }) => {
        this.loading.set(false);
        if (error.status === 401 || error.status === 403) {
          this.authService.logout();
          this.errorMessage.set(error.error?.error ?? 'Session invalide. Reconnecte-toi.');
          return;
        }
        this.errorMessage.set(error.error?.error ?? 'Impossible de changer le mot de passe.');
      }
    });
  }
}
