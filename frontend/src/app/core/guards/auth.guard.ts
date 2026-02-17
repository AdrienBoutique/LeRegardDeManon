import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const user = authService.getCurrentUser();
  const token = authService.getToken();

  if (!token || !user) {
    return router.createUrlTree(['/admin/login'], {
      queryParams: { redirect: state.url },
    });
  }

  if (user.mustChangePassword && state.url !== '/change-password') {
    return router.createUrlTree(['/change-password']);
  }

  if (!user.mustChangePassword && state.url === '/change-password') {
    if (user.role === 'ADMIN') {
      return router.createUrlTree(['/espace-pro/services']);
    }
    return router.createUrlTree(['/admin/planning']);
  }

  return true;
};
