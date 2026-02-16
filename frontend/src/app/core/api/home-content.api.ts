import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type HomeReasonItem = {
  title: string;
  text: string;
};

export type HomeTestimonialItem = {
  name: string;
  text: string;
  rating: number;
};

export type HomeContentPayload = {
  hero: {
    visible: boolean;
    badge: string;
    title: string;
    lead: string;
    primaryButtonLabel: string;
    secondaryButtonLabel: string;
  };
  offers: {
    visible: boolean;
    title: string;
    subtitle: string;
  };
  about: {
    visible: boolean;
    title: string;
    text: string;
    buttonLabel: string;
    images: string[];
  };
  reasons: {
    visible: boolean;
    title: string;
    items: HomeReasonItem[];
  };
  testimonials: {
    visible: boolean;
    title: string;
    items: HomeTestimonialItem[];
  };
  contact: {
    visible: boolean;
    title: string;
    address: string;
    hours: string;
    contactButtonLabel: string;
    instagramButtonLabel: string;
  };
  ctaFinal: {
    visible: boolean;
    title: string;
    buttonLabel: string;
  };
};

export function defaultHomeContent(): HomeContentPayload {
  return {
    hero: {
      visible: true,
      badge: 'Institut de beaute du regard',
      title: 'Le regard de Manon',
      lead: 'Un institut dedie a la beaute du regard, avec une approche douce, precise et elegante.',
      primaryButtonLabel: 'Prendre rendez-vous',
      secondaryButtonLabel: 'Voir les soins'
    },
    offers: {
      visible: true,
      title: 'Offres du moment',
      subtitle: 'Editions limitees / promotions'
    },
    about: {
      visible: true,
      title: 'A propos',
      text: 'Manon vous accueille dans un espace calme et lumineux, avec un diagnostic personnalise pour respecter votre visage et vos attentes.',
      buttonLabel: 'En savoir plus',
      images: []
    },
    reasons: {
      visible: true,
      title: 'Pourquoi nous choisir',
      items: [
        { title: 'Precision', text: 'Des gestes minutieux pour un resultat net et naturel.' },
        { title: 'Hygiene stricte', text: "Protocoles d'hygiene renforces a chaque prestation." },
        { title: 'Conseil personnalise', text: 'Chaque soin est adapte a votre morphologie et votre rythme.' }
      ]
    },
    testimonials: {
      visible: true,
      title: 'Avis',
      items: [
        { name: 'Camille', text: 'Accueil parfait et resultat tres naturel.', rating: 5 },
        { name: 'Sarah', text: 'Mon regard est sublime, je recommande.', rating: 5 },
        { name: 'Julie', text: 'Soin confortable et travail tres soigne.', rating: 5 }
      ]
    },
    contact: {
      visible: true,
      title: 'Contact rapide',
      address: '12 rue des Lilas, 59000 Lille',
      hours: 'Lun-Sam: 9h30 - 19h00',
      contactButtonLabel: 'Page contact',
      instagramButtonLabel: 'Instagram'
    },
    ctaFinal: {
      visible: true,
      title: 'Prete a sublimer votre regard ?',
      buttonLabel: 'Prendre RDV'
    }
  };
}

@Injectable({ providedIn: 'root' })
export class HomeContentApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/api`;

  getPublicContent(): Observable<HomeContentPayload> {
    return this.http.get<HomeContentPayload>(`${this.baseUrl}/public/home-content`);
  }

  getAdminContent(): Observable<HomeContentPayload> {
    return this.http.get<HomeContentPayload>(`${this.baseUrl}/admin/home-content`);
  }

  updateAdminContent(payload: HomeContentPayload): Observable<HomeContentPayload> {
    return this.http.put<HomeContentPayload>(`${this.baseUrl}/admin/home-content`, payload);
  }
}
