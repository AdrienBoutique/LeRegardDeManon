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
      title: 'A propos',
      intro:
        "Le regard de Manon est ne d'une passion pour la precision du geste et l'elegance des resultats naturels. Chaque rendez-vous commence par une ecoute attentive de vos attentes."
    },
    blocks: [
      {
        id: 'approach',
        visible: true,
        title: 'Notre approche',
        text: 'Nous privilegions des techniques maitrisees, un rythme adapte a chaque cliente, et des conseils simples pour prolonger les effets a la maison.'
      },
      {
        id: 'hygiene',
        visible: true,
        title: 'Hygiene et securite',
        text: 'Materiel desinfecte, consommables individuels et protocoles stricts sont appliques a chaque soin.'
      },
      {
        id: 'trainee',
        visible: true,
        title: 'Stagiaire',
        text: "Selon les periodes, une stagiaire peut etre presente en observation. Aucun geste n'est realise sans validation prealable et votre accord."
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
      address: '12 rue des Lilas, 59000 Lille',
      phone: '06 00 00 00 00',
      email: 'contact@leregarddemanon.fr',
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
        { question: 'Annulation', answer: "Merci de prevenir 24h a l'avance pour toute annulation." },
        { question: 'Retard', answer: 'Au-dela de 10 minutes de retard, la prestation peut etre adaptee.' }
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
