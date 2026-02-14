import { AsyncPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { combineLatest, map } from 'rxjs';
import { ServicesDataService } from '../../core/services/services-data.service';

@Component({
  selector: 'app-service-detail',
  imports: [RouterLink, AsyncPipe],
  templateUrl: './service-detail.html',
  styleUrl: './service-detail.scss'
})
export class ServiceDetail {
  private readonly route = inject(ActivatedRoute);
  private readonly servicesData = inject(ServicesDataService);

  private readonly serviceId = toSignal(this.route.paramMap.pipe(map((params) => params.get('id'))), {
    initialValue: null
  });

  protected readonly service$ = combineLatest([this.servicesData.list(), this.route.paramMap]).pipe(
    map(([services, params]) => {
      const id = params.get('id');
      return id ? services.find((service) => service.id === id) : undefined;
    })
  );

  protected formatPrice(priceCents: number): string {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0
    }).format(priceCents / 100);
  }
}
