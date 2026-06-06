import { Component, HostListener, OnDestroy, signal } from '@angular/core';

type TrainingBrochure = {
  id: string;
  title: string;
  teaser: string;
  image: string;
  accent: string;
};

@Component({
  selector: 'app-trainings',
  imports: [],
  templateUrl: './trainings.html',
  styleUrl: './trainings.scss'
})
export class Trainings implements OnDestroy {
  protected readonly brochures: TrainingBrochure[] = [
    {
      id: 'brow-lift',
      title: 'Brow Lift',
      teaser: 'Une ligne sourcilière nette, souple et parfaitement structurée.',
      image: '/assets/formation/bowlift.jpg',
      accent: 'Regard'
    },
    {
      id: 'esthetique',
      title: 'Esthétique',
      teaser: 'Les bases et les gestes qui signent une pratique élégante.',
      image: '/assets/formation/esthetique.jpg',
      accent: 'Fondation'
    },
    {
      id: 'extension-cils',
      title: 'Extension de cils',
      teaser: 'Créer une pose harmonieuse, durable et sophistiquée.',
      image: '/assets/formation/extentionscils.jpg',
      accent: 'Regard'
    },
    {
      id: 'maderotherapie',
      title: 'Madérothérapie',
      teaser: 'Des techniques sculptantes pensées pour un protocole précis.',
      image: '/assets/formation/maderotherapie.jpg',
      accent: 'Corps'
    },
    {
      id: 'massage-drainant',
      title: 'Massage drainant',
      teaser: 'Un toucher expert pour alléger, lisser et relancer.',
      image: '/assets/formation/massagedrainant.jpg',
      accent: 'Corps'
    },
    {
      id: 'massage-harmonisant',
      title: 'Massage harmonisant',
      teaser: 'Un rituel enveloppant, fluide et parfaitement maîtrisé.',
      image: '/assets/formation/massageharmo.jpg',
      accent: 'Bien-être'
    },
    {
      id: 'massage-pierre-chaude',
      title: 'Massage pierre chaude',
      teaser: 'L’alliance de la chaleur et du lâcher-prise sensoriel.',
      image: '/assets/formation/massagepierrechaude.jpg',
      accent: 'Bien-être'
    },
    {
      id: 'massage-prenatal',
      title: 'Massage prénatal',
      teaser: 'Un accompagnement doux et rassurant, pensé avec finesse.',
      image: '/assets/formation/massageprenatal.jpg',
      accent: 'Bien-être'
    },
    {
      id: 'pedicure-medicale',
      title: 'Pédicure médicale',
      teaser: 'Une approche soignée pour une expertise technique impeccable.',
      image: '/assets/formation/pedicuremedical.jpg',
      accent: 'Pied'
    },
    {
      id: 'perfection-pedicure',
      title: 'Perfection en pédicure',
      teaser: 'Un niveau supérieur de précision et de finition.',
      image: '/assets/formation/perfepedicuremedical.jpg',
      accent: 'Expertise'
    },
    {
      id: 'reflexologie-plantaire',
      title: 'Réflexologie plantaire',
      teaser: 'Des protocoles précis pour un soin subtil et profond.',
      image: '/assets/formation/reflexologieplantaire.jpg',
      accent: 'Bien-être'
    },
    {
      id: 'rehaussement-cils',
      title: 'Rehaussement de cils',
      teaser: 'Une courbe naturelle, lumineuse et délicatement travaillée.',
      image: '/assets/formation/rehaussementcils.jpg',
      accent: 'Regard'
    },
    {
      id: 'techniques-specifiques-pedicure',
      title: 'Techniques spécifiques pédicure médicale',
      teaser: 'Des gestes ciblés pour des besoins plus techniques.',
      image: '/assets/formation/techniquesspecifiquespedicuremedical.jpg',
      accent: 'Expertise'
    },
    {
      id: 'volume-russe',
      title: 'Volume russe',
      teaser: 'Créer du relief et de la densité avec une ligne aérienne.',
      image: '/assets/formation/volumerusse.jpg',
      accent: 'Regard'
    },
    {
      id: 'vsp',
      title: 'VSP',
      teaser: 'Une finition nette, durable et parfaitement maîtrisée.',
      image: '/assets/formation/vsp.jpg',
      accent: 'Finition'
    }
  ];

  protected readonly selectedBrochure = signal<TrainingBrochure | null>(null);

  ngOnDestroy(): void {
    this.unlockScroll();
  }

  protected openBrochure(brochure: TrainingBrochure): void {
    this.selectedBrochure.set(brochure);
    this.lockScroll();
  }

  protected closeBrochure(): void {
    this.selectedBrochure.set(null);
    this.unlockScroll();
  }

  protected onBackdropClick(): void {
    this.closeBrochure();
  }

  protected onModalClick(event: MouseEvent): void {
    event.stopPropagation();
  }

  protected onCardKeydown(event: KeyboardEvent, brochure: TrainingBrochure): void {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }

    event.preventDefault();
    this.openBrochure(brochure);
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    if (this.selectedBrochure()) {
      this.closeBrochure();
    }
  }

  private lockScroll(): void {
    if (typeof document === 'undefined') {
      return;
    }

    document.body.style.overflow = 'hidden';
  }

  private unlockScroll(): void {
    if (typeof document === 'undefined') {
      return;
    }

    document.body.style.overflow = '';
  }
}
