import { Component, inject } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { Navbar } from './core/layout/navbar/navbar';
import { Footer } from './core/layout/footer/footer';
import { AuthService } from './core/services/auth.service';
import { PushService } from './core/services/push.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Navbar, Footer],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly pushService = inject(PushService);

  constructor() {
    this.authService.me().subscribe((user) => {
      if (user?.role === 'ADMIN') {
        void this.pushService.initPush();
      }
    });
  }

  protected isAdminRoute(): boolean {
    return this.router.url.startsWith('/admin') || this.router.url.startsWith('/espace-pro');
  }
}
