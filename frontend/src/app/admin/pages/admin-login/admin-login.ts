import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { PushService } from '../../../core/services/push.service';

@Component({
  selector: 'app-admin-login',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './admin-login.html',
  styleUrl: './admin-login.scss'
})
export class AdminLogin {
  private readonly formBuilder = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly pushService = inject(PushService);
  private readonly router = inject(Router);

  protected readonly loading = signal(false);
  protected readonly errorMessage = signal('');

  protected readonly form = this.formBuilder.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]]
  });

  constructor() {
    const user = this.authService.getCurrentUser();
    if (user) {
      if (user.mustChangePassword) {
        this.router.navigateByUrl('/change-password');
      } else if (user.role === 'ADMIN') {
        this.router.navigateByUrl('/espace-pro/services');
      } else {
        this.router.navigateByUrl('/admin/planning');
      }
    }
  }

  protected submit(): void {
    if (this.form.invalid || this.loading()) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    this.errorMessage.set('');

    const { email, password } = this.form.getRawValue();

    this.authService.login(email, password).subscribe({
      next: (user) => {
        this.loading.set(false);
        if (user.role === 'ADMIN') {
          void this.pushService.initPush();
        }
        if (user.mustChangePassword) {
          this.router.navigateByUrl('/change-password');
        } else if (user.role === 'ADMIN') {
          this.router.navigateByUrl('/espace-pro/services');
        } else {
          this.router.navigateByUrl('/admin/planning');
        }
      },
      error: () => {
        this.loading.set(false);
        this.errorMessage.set('Email ou mot de passe invalide.');
      }
    });
  }
}
