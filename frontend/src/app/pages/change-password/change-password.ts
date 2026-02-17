import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-change-password',
  imports: [ReactiveFormsModule],
  templateUrl: './change-password.html',
  styleUrl: './change-password.scss'
})
export class ChangePassword {
  private readonly authService = inject(AuthService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly router = inject(Router);

  protected readonly loading = signal(false);
  protected readonly errorMessage = signal('');

  protected readonly form = this.formBuilder.nonNullable.group({
    currentPassword: [''],
    newPassword: ['', [Validators.required, Validators.minLength(8)]],
    confirmPassword: ['', [Validators.required]]
  });

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

    this.authService.changePassword(raw.currentPassword || undefined, raw.newPassword).subscribe({
      next: (user) => {
        this.loading.set(false);
        if (user.role === 'ADMIN') {
          this.router.navigateByUrl('/espace-pro/services');
        } else {
          this.router.navigateByUrl('/admin/planning');
        }
      },
      error: (error: { error?: { error?: string } }) => {
        this.loading.set(false);
        this.errorMessage.set(error.error?.error ?? 'Impossible de changer le mot de passe.');
      }
    });
  }
}
