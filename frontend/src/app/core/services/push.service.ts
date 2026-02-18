import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { BehaviorSubject, firstValueFrom } from 'rxjs';
import { Capacitor } from '@capacitor/core';
import {
  ActionPerformed,
  PermissionStatus,
  PushNotificationSchema,
  PushNotifications,
  Token
} from '@capacitor/push-notifications';
import { environment } from '../../../environments/environment';

export type PushPermissionStatus = 'granted' | 'denied' | 'prompt' | 'unsupported';

export type PushState = {
  permissionStatus: PushPermissionStatus;
  lastTestResult: { sentCount: number; failedCount: number } | null;
  lastError: string | null;
};

@Injectable({ providedIn: 'root' })
export class PushService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private listenersReady = false;
  private registrationWaiters: Array<(token: string) => void> = [];

  private readonly stateSubject = new BehaviorSubject<PushState>({
    permissionStatus: 'unsupported',
    lastTestResult: null,
    lastError: null
  });
  readonly state$ = this.stateSubject.asObservable();

  isNativePushSupported(): boolean {
    return typeof window !== 'undefined' && Capacitor.isNativePlatform();
  }

  async initPush(): Promise<void> {
    const permissionStatus = await this.getPermissionStatus();
    this.patchState({ permissionStatus });

    if (!this.isNativePushSupported()) {
      return;
    }

    await this.ensureListeners();

    if (permissionStatus !== 'granted') {
      return;
    }

    try {
      await this.registerAndAwaitToken();
      this.patchState({ lastError: null });
    } catch {
      this.patchState({ lastError: 'Token non recu, relance l’app' });
    }
  }

  async getPermissionStatus(): Promise<PushPermissionStatus> {
    if (!this.isNativePushSupported()) {
      return 'unsupported';
    }

    try {
      const permission = await PushNotifications.checkPermissions();
      return this.toPermissionStatus(permission.receive);
    } catch {
      return 'unsupported';
    }
  }

  async enablePush(): Promise<{ status: string }> {
    if (!this.isNativePushSupported()) {
      const status = 'unsupported';
      this.patchState({
        permissionStatus: status,
        lastError: 'Push dispo uniquement dans l’app'
      });
      return { status };
    }

    try {
      await this.ensureListeners();
      const permission = await PushNotifications.requestPermissions();
      const permissionStatus = this.toPermissionStatus(permission.receive);
      this.patchState({ permissionStatus, lastError: null });

      if (permissionStatus !== 'granted') {
        const message =
          permissionStatus === 'denied' ? 'Permission notifications refusee' : 'Permission non accordee';
        this.patchState({ lastError: message });
        return { status: permissionStatus };
      }

      await this.registerAndAwaitToken();
      this.patchState({ lastError: null });
      return { status: 'granted' };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Activation notifications impossible';
      this.patchState({ lastError: message });
      return { status: 'error' };
    }
  }

  async sendTestPush(): Promise<{ sentCount: number; failedCount: number }> {
    try {
      const response = await firstValueFrom(
        this.http.post<{ sentCount?: number; failedCount?: number }>(`${environment.apiUrl}/api/admin/push/test`, {
          title: 'Test notification',
          body: 'Test push Le Regard de Manon'
        })
      );

      const result = {
        sentCount: Number(response.sentCount ?? 0),
        failedCount: Number(response.failedCount ?? 0)
      };
      this.patchState({
        lastTestResult: result,
        lastError: null
      });
      return result;
    } catch (error: unknown) {
      const status = this.extractHttpStatus(error);
      const message = status === 401 ? 'Reconnecte-toi' : 'Test push impossible';
      this.patchState({
        lastError: message
      });
      throw error;
    }
  }

  private async ensureListeners(): Promise<void> {
    if (this.listenersReady) {
      return;
    }

    this.listenersReady = true;
    await PushNotifications.removeAllListeners();
    await PushNotifications.addListener('registration', (token) => {
      void this.onRegistration(token);
    });
    await PushNotifications.addListener('registrationError', (error) => {
      console.error('[push] registration error', error);
      this.patchState({ lastError: 'Token non recu, relance l’app' });
    });
    await PushNotifications.addListener('pushNotificationReceived', (notification) => {
      this.onPushReceived(notification);
    });
    await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      this.onPushAction(action);
    });
  }

  private async onRegistration(token: Token): Promise<void> {
    const value = token.value?.trim();
    if (!value) {
      return;
    }

    try {
      await this.registerToken(value);
      this.patchState({ permissionStatus: 'granted', lastError: null });
      for (const resolve of this.registrationWaiters.splice(0)) {
        resolve(value);
      }
      console.log('[push] token registered');
    } catch (error) {
      console.error('[push] register failed', error);
      this.patchState({ lastError: 'Enregistrement token impossible' });
    }
  }

  private onPushReceived(notification: PushNotificationSchema): void {
    const title = notification.title?.trim() || 'Notification';
    const body = notification.body?.trim() || '';
    this.showToast(body ? `${title}: ${body}` : title);
  }

  private onPushAction(_action: ActionPerformed): void {
    void this.router.navigateByUrl('/admin/demandes');
  }

  private async registerToken(token: string): Promise<void> {
    const platform = Capacitor.getPlatform() === 'ios' ? 'ios' : 'android';
    await firstValueFrom(
      this.http.post(`${environment.apiUrl}/api/admin/push/register`, {
        token,
        platform,
        deviceName: Capacitor.getPlatform()
      })
    );
  }

  private async registerAndAwaitToken(): Promise<string> {
    return new Promise<string>(async (resolve, reject) => {
      let settled = false;
      const timeout = setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        this.registrationWaiters = this.registrationWaiters.filter((entry) => entry !== onToken);
        reject(new Error('Token non recu, relance l’app'));
      }, 5000);

      const onToken = (token: string) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        resolve(token);
      };

      this.registrationWaiters.push(onToken);

      try {
        await PushNotifications.register();
      } catch (error) {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        this.registrationWaiters = this.registrationWaiters.filter((entry) => entry !== onToken);
        reject(error instanceof Error ? error : new Error('Push register failed'));
      }
    });
  }

  private patchState(patch: Partial<PushState>): void {
    this.stateSubject.next({
      ...this.stateSubject.value,
      ...patch
    });
  }

  private toPermissionStatus(value: PermissionStatus['receive']): PushPermissionStatus {
    if (value === 'granted' || value === 'denied' || value === 'prompt') {
      return value;
    }
    return 'unsupported';
  }

  private extractHttpStatus(error: unknown): number | null {
    if (typeof error !== 'object' || error === null) {
      return null;
    }
    if ('status' in error && typeof (error as { status?: unknown }).status === 'number') {
      return (error as { status: number }).status;
    }
    return null;
  }

  private showToast(message: string): void {
    if (!message) {
      return;
    }

    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.position = 'fixed';
    toast.style.left = '50%';
    toast.style.bottom = '24px';
    toast.style.transform = 'translateX(-50%)';
    toast.style.background = 'rgba(44,32,23,0.94)';
    toast.style.color = '#fff';
    toast.style.padding = '10px 14px';
    toast.style.borderRadius = '12px';
    toast.style.zIndex = '9999';
    toast.style.maxWidth = '90vw';
    toast.style.textAlign = 'center';
    toast.style.fontSize = '14px';
    toast.style.boxShadow = '0 12px 24px rgba(0,0,0,0.25)';
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, 2800);
  }
}
