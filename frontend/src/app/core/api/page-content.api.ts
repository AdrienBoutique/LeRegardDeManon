import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type ManagedPageSlug = 'home' | 'about' | 'contact';

export type AboutPageContent = {
  hero: {
    visible: boolean;
    title: string;
    intro: string;
  };
  blocks: Array<{
    id: string;
    visible: boolean;
    title: string;
    text: string;
  }>;
};

type LegacyAboutPageContent = {
  hero: {
    visible: boolean;
    title: string;
    intro: string;
  };
  approach: {
    visible: boolean;
    title: string;
    text: string;
  };
  hygiene: {
    visible: boolean;
    title: string;
    text: string;
  };
  trainee: {
    visible: boolean;
    title: string;
    text: string;
  };
};

export type ContactFaqItem = {
  question: string;
  answer: string;
};

export type ContactDayHours = {
  day: string;
  closed: boolean;
  start: string;
  end: string;
};

export type ContactPageContent = {
  hero: {
    visible: boolean;
    title: string;
  };
  info: {
    visible: boolean;
    address: string;
    phone: string;
    email: string;
    hoursLabel: string;
    weeklyHours: ContactDayHours[];
  };
  faq: {
    visible: boolean;
    title: string;
    items: ContactFaqItem[];
  };
};

export function defaultAboutPageContent(): AboutPageContent {
  return {
    hero: {
      visible: true,
      title: 'À propos',
      intro:
        "MA Beauty Academy est un institut de beauté et un centre de formation dédié à l’univers de l’esthétique. Nous accompagnons nos clientes avec des prestations soignées, personnalisées et réalisées avec précision, tout en transmettant notre savoir-faire à celles et ceux qui souhaitent se former aux métiers de la beauté. Notre objectif est simple : offrir une expérience professionnelle, humaine et élégante, que ce soit pour sublimer votre beauté ou pour développer vos compétences dans le secteur esthétique."
    },
    blocks: [
      {
        id: 'approach',
        visible: true,
        title: 'Notre approche',
        text: 'Nous privilégions des techniques maîtrisées, un rythme adapté à chaque cliente, et des conseils simples pour prolonger les effets à la maison.'
      },
      {
        id: 'hygiene',
        visible: true,
        title: 'Hygiène et sécurité',
        text: 'Matériel désinfecté, consommables individuels et protocoles stricts sont appliqués à chaque soin.'
      },
      {
        id: 'trainee',
        visible: true,
        title: 'Stagiaire',
        text: "Selon les périodes, une stagiaire peut être présente en observation. Aucun geste n'est réalisé sans validation préalable et votre accord."
      }
    ]
  };
}

export function normalizeAboutPageContent(value: AboutPageContent | LegacyAboutPageContent | null | undefined): AboutPageContent {
  if (!value) {
    return defaultAboutPageContent();
  }

  if ('blocks' in value && Array.isArray(value.blocks)) {
    return value as AboutPageContent;
  }

  const legacy = value as LegacyAboutPageContent;
  return {
    hero: legacy.hero,
    blocks: [
      { id: 'approach', ...legacy.approach },
      { id: 'hygiene', ...legacy.hygiene },
      { id: 'trainee', ...legacy.trainee }
    ]
  };
}

export function defaultContactPageContent(): ContactPageContent {
  return {
    hero: {
      visible: true,
      title: 'Contact'
    },
    info: {
      visible: true,
      address: 'Chaussée de Bruxelles 121, 7800 Ath',
      phone: '06 00 00 00 00',
      email: 'contact@mabeautyacademy.be',
      hoursLabel: 'Lun-Sam, 9h30 - 19h00',
      weeklyHours: [
        { day: 'Lundi', closed: false, start: '09:30', end: '19:00' },
        { day: 'Mardi', closed: false, start: '09:30', end: '19:00' },
        { day: 'Mercredi', closed: false, start: '09:30', end: '19:00' },
        { day: 'Jeudi', closed: false, start: '09:30', end: '19:00' },
        { day: 'Vendredi', closed: false, start: '09:30', end: '19:00' },
        { day: 'Samedi', closed: false, start: '09:30', end: '19:00' },
        { day: 'Dimanche', closed: true, start: '09:30', end: '19:00' }
      ]
    },
    faq: {
      visible: true,
      title: 'FAQ',
      items: [
        { question: 'Annulation', answer: "Merci de prévenir 24h à l'avance pour toute annulation." },
        { question: 'Retard', answer: 'Au-delà de 10 minutes de retard, la prestation peut être adaptée.' }
      ]
    }
  };
}

@Injectable({ providedIn: 'root' })
export class PageContentApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/api`;

  getPublicContent<T>(slug: ManagedPageSlug): Observable<T> {
    return this.http.get<T>(`${this.baseUrl}/public/page-content/${slug}`);
  }

  getAdminContent<T>(slug: ManagedPageSlug): Observable<T> {
    return this.http.get<T>(`${this.baseUrl}/admin/page-content/${slug}`);
  }

  updateAdminContent<T>(slug: ManagedPageSlug, payload: T): Observable<T> {
    return this.http.put<T>(`${this.baseUrl}/admin/page-content/${slug}`, payload);
  }
}
