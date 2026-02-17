import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of, shareReplay } from 'rxjs';
import { ServicesApiService } from './services-api.service';

export interface ServiceItem {
  id: string;
  name: string;
  description: string;
  durationMin: number;
  priceCents: number;
  category: string;
}

const FALLBACK_SERVICES: ServiceItem[] = [
  {
    id: 'rehaussement-cils',
    name: 'Rehaussement de cils',
    description: 'Courbure naturelle et tenue longue duree pour un regard ouvert.',
    durationMin: 60,
    priceCents: 6500,
    category: 'Cils'
  },
  {
    id: 'teinture-cils',
    name: 'Teinture des cils',
    description: 'Intensifie la frange de cils pour un rendu chic sans surcharge.',
    durationMin: 30,
    priceCents: 2800,
    category: 'Cils'
  },
  {
    id: 'brow-lift',
    name: 'Brow lift',
    description: 'Restructure la ligne sourciliere pour un rendu discipline et lumineux.',
    durationMin: 50,
    priceCents: 5500,
    category: 'Sourcils'
  },
  {
    id: 'creation-ligne',
    name: 'Creation de ligne',
    description: 'Etude morphologique puis epilation precise pour harmoniser le visage.',
    durationMin: 35,
    priceCents: 3200,
    category: 'Sourcils'
  },
  {
    id: 'teinture-sourcils',
    name: 'Teinture sourcils',
    description: 'Pigmentation sur-mesure pour densifier et equilibrer la ligne.',
    durationMin: 25,
    priceCents: 2500,
    category: 'Teinture'
  },
  {
    id: 'duo-regard-signature',
    name: 'Duo regard signature',
    description: 'Soin premium combinant rehaussement, teinture et mise en forme.',
    durationMin: 80,
    priceCents: 8900,
    category: 'Signature'
  }
];

@Injectable({
  providedIn: 'root'
})
export class ServicesDataService {
  private readonly servicesApi = inject(ServicesApiService);

  private readonly cachedServices$ = this.servicesApi.list().pipe(
    map((services) =>
      services.map((service) => ({
        id: service.id,
        name: service.name,
        description: service.description,
        durationMin: service.durationMin,
        priceCents: service.priceCents,
        category: service.categoryName ?? service.category ?? 'Sans categorie'
      }))
    ),
    catchError(() => of(FALLBACK_SERVICES)),
    shareReplay(1)
  );

  list(): Observable<ServiceItem[]> {
    return this.cachedServices$;
  }

  findById(id: string): Observable<ServiceItem | undefined> {
    return this.cachedServices$.pipe(map((services) => services.find((service) => service.id === id)));
  }

  popular(): Observable<ServiceItem[]> {
    return this.cachedServices$.pipe(map((services) => services.slice(0, 3)));
  }
}
