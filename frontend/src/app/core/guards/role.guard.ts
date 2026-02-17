import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthRole, AuthService } from '../services/auth.service';

export const roleGuard: CanActivateFn = (route) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const roles = (route.data?.['roles'] as AuthRole[] | undefined) ?? [];
  if (roles.length === 0) {
    return true;
  }

  const user = authService.getCurrentUser();
  if (!user) {
    return router.createUrlTree(['/admin/login']);
  }

  if (roles.includes(user.role)) {
    return true;
  }

  if (user.role === 'ADMIN') {
    return router.createUrlTree(['/espace-pro/services']);
  }

  return router.createUrlTree(['/admin/planning']);
};
