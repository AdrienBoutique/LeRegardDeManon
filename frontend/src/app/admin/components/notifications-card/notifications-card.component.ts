import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  PushPermissionStatus,
  PushService,
  PushState
} from '../../../core/services/push.service';

@Component({
  selector: 'app-notifications-card',
  templateUrl: './notifications-card.component.html',
  styleUrl: './notifications-card.component.scss'
})
export class NotificationsCardComponent {
  private readonly pushService = inject(PushService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly permissionStatus = signal<PushPermissionStatus>('unsupported');
  protected readonly testResult = signal<{ sentCount: number; failedCount: number } | null>(null);
  protected readonly errorMessage = signal('');
  protected readonly infoMessage = signal('');
  protected readonly enabling = signal(false);
  protected readonly testing = signal(false);

  constructor() {
    this.pushService.state$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((state: PushState) => {
        this.permissionStatus.set(state.permissionStatus);
        this.testResult.set(state.lastTestResult);
        this.errorMessage.set(state.lastError ?? '');
      });

    void this.refreshPermission();
  }

  protected isUnsupported(): boolean {
    return this.permissionStatus() === 'unsupported';
  }

  protected isGranted(): boolean {
    return this.permissionStatus() === 'granted';
  }

  protected isDenied(): boolean {
    return this.permissionStatus() === 'denied';
  }

  protected statusLabel(): string {
    const status = this.permissionStatus();
    if (status === 'unsupported') {
      return 'Disponible uniquement dans l’app mobile';
    }
    if (status === 'denied') {
      return 'Desactivees (permission refusee)';
    }
    if (status === 'prompt') {
      return 'A activer';
    }
    return 'Activees';
  }

  protected mainButtonLabel(): string {
    return this.isDenied() ? 'Reactiver' : 'Activer les notifications';
  }

  protected async activateNotifications(): Promise<void> {
    this.enabling.set(true);
    this.infoMessage.set('');
    this.errorMessage.set('');
    try {
      const result = await this.pushService.enablePush();
      if (result.status === 'granted') {
        this.infoMessage.set('Notifications activees.');
      } else if (result.status === 'denied') {
        this.errorMessage.set('Permission refusee sur le telephone.');
      } else if (result.status === 'unsupported') {
        this.errorMessage.set('Push dispo uniquement dans l’app');
      } else if (result.status === 'prompt') {
        this.errorMessage.set('Autorisation non accordee.');
      } else {
        this.errorMessage.set('Activation impossible.');
      }
    } catch {
      this.errorMessage.set('Token non recu, relance l’app');
    } finally {
      this.enabling.set(false);
      await this.refreshPermission();
    }
  }

  protected testPush(): void {
    this.testing.set(true);
    this.infoMessage.set('');
    this.errorMessage.set('');
    this.pushService
      .sendTestPush()
      .then((result) => {
        if (result.sentCount > 0 && result.failedCount === 0) {
          this.infoMessage.set('Test OK');
          return;
        }
        this.infoMessage.set('Test partiel/KO');
      })
      .catch(() => {
        this.errorMessage.set(this.errorMessage() || 'Test push impossible');
      })
      .finally(() => {
        this.testing.set(false);
      });
  }

  private async refreshPermission(): Promise<void> {
    const status = await this.pushService.getPermissionStatus();
    this.permissionStatus.set(status);
  }
}
