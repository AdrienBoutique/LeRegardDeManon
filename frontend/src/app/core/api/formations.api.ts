import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type FormationContentItem = {
  id: string;
  title: string;
  category: string;
  description: string;
  brochureImageUrl: string;
  eventUrl: string | null;
  nextDatesText: string | null;
  sessionNote: string | null;
  showEventButton: boolean;
  createdAt: string;
  updatedAt: string;
};

export type FormationContentPayload = {
  title: string;
  category: string;
  description: string;
  brochureImageUrl: string;
  eventUrl: string | null;
  nextDatesText: string | null;
  sessionNote: string | null;
  showEventButton: boolean;
};

export function defaultFormationContent(): FormationContentItem[] {
  return [
    {
      id: 'brow-lift',
      title: 'Brow Lift',
      category: 'Regard',
      description: 'Une ligne sourciliere nette, souple et parfaitement structuree.',
      brochureImageUrl: '/assets/formation/bowlift.jpg',
      eventUrl: null,
      nextDatesText: null,
      sessionNote: null,
      showEventButton: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: 'esthetique',
      title: 'Esthetique',
      category: 'Fondation',
      description: 'Les bases et les gestes qui signent une pratique elegante.',
      brochureImageUrl: '/assets/formation/esthetique.jpg',
      eventUrl: null,
      nextDatesText: null,
      sessionNote: null,
      showEventButton: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: 'extension-de-cils',
      title: 'Extension de cils',
      category: 'Regard',
      description: 'Creer une pose harmonieuse, durable et sophistiquee.',
      brochureImageUrl: '/assets/formation/extentionscils.jpg',
      eventUrl: null,
      nextDatesText: null,
      sessionNote: null,
      showEventButton: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: 'maderotherapie',
      title: 'Maderotherapie',
      category: 'Corps',
      description: 'Des techniques sculptantes pensees pour un protocole precis.',
      brochureImageUrl: '/assets/formation/maderotherapie.jpg',
      eventUrl: null,
      nextDatesText: null,
      sessionNote: null,
      showEventButton: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: 'massage-drainant',
      title: 'Massage drainant',
      category: 'Corps',
      description: 'Un toucher expert pour alleger, lisser et relancer.',
      brochureImageUrl: '/assets/formation/massagedrainant.jpg',
      eventUrl: null,
      nextDatesText: null,
      sessionNote: null,
      showEventButton: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: 'massage-harmonisant',
      title: 'Massage harmonisant',
      category: 'Bien-etre',
      description: 'Un rituel enveloppant, fluide et parfaitement maitrise.',
      brochureImageUrl: '/assets/formation/massageharmo.jpg',
      eventUrl: null,
      nextDatesText: null,
      sessionNote: null,
      showEventButton: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: 'massage-pierre-chaude',
      title: 'Massage pierre chaude',
      category: 'Bien-etre',
      description: "L'alliance de la chaleur et du lacher-prise sensoriel.",
      brochureImageUrl: '/assets/formation/massagepierrechaude.jpg',
      eventUrl: null,
      nextDatesText: null,
      sessionNote: null,
      showEventButton: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: 'massage-prenatal',
      title: 'Massage prenatal',
      category: 'Bien-etre',
      description: 'Un accompagnement doux et rassurant, pense avec finesse.',
      brochureImageUrl: '/assets/formation/massageprenatal.jpg',
      eventUrl: null,
      nextDatesText: null,
      sessionNote: null,
      showEventButton: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: 'pedicure-medicale',
      title: 'Pedicure medicale',
      category: 'Pied',
      description: 'Une approche soignee pour une expertise technique impeccable.',
      brochureImageUrl: '/assets/formation/pedicuremedical.jpg',
      eventUrl: null,
      nextDatesText: null,
      sessionNote: null,
      showEventButton: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: 'perfection-pedicure',
      title: 'Perfection en pedicure',
      category: 'Expertise',
      description: 'Un niveau superieur de precision et de finition.',
      brochureImageUrl: '/assets/formation/perfepedicuremedical.jpg',
      eventUrl: null,
      nextDatesText: null,
      sessionNote: null,
      showEventButton: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: 'reflexologie-plantaire',
      title: 'Reflexologie plantaire',
      category: 'Bien-etre',
      description: 'Des protocoles precis pour un soin subtil et profond.',
      brochureImageUrl: '/assets/formation/reflexologieplantaire.jpg',
      eventUrl: null,
      nextDatesText: null,
      sessionNote: null,
      showEventButton: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: 'rehaussement-cils',
      title: 'Rehaussement de cils',
      category: 'Regard',
      description: 'Une courbe naturelle, lumineuse et delicatement travaillee.',
      brochureImageUrl: '/assets/formation/rehaussementcils.jpg',
      eventUrl: null,
      nextDatesText: null,
      sessionNote: null,
      showEventButton: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: 'techniques-specifiques-pedicure-medicale',
      title: 'Techniques specifiques pedicure medicale',
      category: 'Expertise',
      description: 'Des gestes cibles pour des besoins plus techniques.',
      brochureImageUrl: '/assets/formation/techniquesspecifiquespedicuremedical.jpg',
      eventUrl: null,
      nextDatesText: null,
      sessionNote: null,
      showEventButton: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: 'volume-russe',
      title: 'Volume russe',
      category: 'Regard',
      description: 'Creer du relief et de la densite avec une ligne aerienne.',
      brochureImageUrl: '/assets/formation/volumerusse.jpg',
      eventUrl: null,
      nextDatesText: null,
      sessionNote: null,
      showEventButton: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: 'vsp',
      title: 'VSP',
      category: 'Finition',
      description: 'Une finition nette, durable et parfaitement maitrisee.',
      brochureImageUrl: '/assets/formation/vsp.jpg',
      eventUrl: null,
      nextDatesText: null,
      sessionNote: null,
      showEventButton: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ];
}

@Injectable({ providedIn: 'root' })
export class FormationsApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/api`;

  getPublicFormations(): Observable<FormationContentItem[]> {
    return this.http.get<FormationContentItem[]>(`${this.baseUrl}/public/formations`);
  }

  getAdminFormations(): Observable<FormationContentItem[]> {
    return this.http.get<FormationContentItem[]>(`${this.baseUrl}/admin/formations`);
  }

  updateFormation(id: string, payload: FormationContentPayload): Observable<FormationContentItem> {
    return this.http.put<FormationContentItem>(`${this.baseUrl}/admin/formations/${id}`, payload);
  }

  removeEventLink(id: string): Observable<FormationContentItem> {
    return this.http.delete<FormationContentItem>(`${this.baseUrl}/admin/formations/${id}/event-link`);
  }
}
