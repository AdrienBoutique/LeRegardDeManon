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
      badge: 'INSTITUT DE BEAUTÉ & CENTRE DE FORMATION',
      title: 'MA Beauty Academy',
      lead: "Un institut de beauté et un centre de formation dédié à l'esthétique, avec des prestations soignées et un savoir-faire transmis avec précision.",
      primaryButtonLabel: 'Prendre rendez-vous',
      secondaryButtonLabel: 'Découvrir les formations'
    },
    offers: {
      visible: true,
      title: 'Offres du moment',
      subtitle: 'Editions limitees / promotions'
    },
    about: {
      visible: true,
      title: 'À propos',
      text:
        "MA Beauty Academy est un institut de beauté et un centre de formation dédié à l’univers de l’esthétique. Nous accompagnons nos clientes avec des prestations soignées, personnalisées et réalisées avec précision, tout en transmettant notre savoir-faire à celles et ceux qui souhaitent se former aux métiers de la beauté. Notre objectif est simple : offrir une expérience professionnelle, humaine et élégante, que ce soit pour sublimer votre beauté ou pour développer vos compétences dans le secteur esthétique.",
      buttonLabel: 'En savoir plus',
      images: []
    },
    reasons: {
      visible: true,
      title: 'Pourquoi nous choisir',
      items: [
        { title: 'Expertise', text: 'Des prestations et formations réalisées avec sérieux, précision et passion.' },
        { title: 'Hygiène stricte', text: 'Des protocoles professionnels respectés à chaque prestation et formation.' },
        { title: 'Accompagnement', text: 'Un suivi personnalisé, que vous soyez cliente ou apprenante.' }
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
      address: 'Chaussée de Bruxelles 121, 7800 Ath',
      hours: 'Lun-Sam: 9h30 - 19h00',
      contactButtonLabel: 'Page contact',
      instagramButtonLabel: 'Instagram'
    },
    ctaFinal: {
      visible: true,
      title: 'Prête à révéler votre potentiel beauté ?',
      buttonLabel: 'Prendre RDV'
    }
  };
}

@Injectable({ providedIn: 'root' })
export class HomeContentApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/api`;

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
