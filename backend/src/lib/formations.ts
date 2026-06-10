import { z } from "zod";

export const formationContentSchema = z.object({
  title: z.string().min(1),
  category: z.string().min(1),
  description: z.string().min(1),
  brochureImageUrl: z.string().min(1),
  eventUrl: z.string().max(1000).nullable().optional(),
  nextDatesText: z.string().max(1000).nullable().optional(),
  sessionNote: z.string().max(500).nullable().optional(),
  showEventButton: z.boolean(),
});

export type FormationContentPayload = z.infer<typeof formationContentSchema>;

export type SeedFormationContent = FormationContentPayload & {
  id: string;
};

export const defaultFormationContent: SeedFormationContent[] = [
  {
    id: "brow-lift",
    title: "Brow Lift",
    category: "Regard",
    description: "Une ligne sourciliere nette, souple et parfaitement structuree.",
    brochureImageUrl: "/assets/formation/bowlift.jpg",
    eventUrl: null,
    nextDatesText: null,
    sessionNote: null,
    showEventButton: false,
  },
  {
    id: "esthetique",
    title: "Esthetique",
    category: "Fondation",
    description: "Les bases et les gestes qui signent une pratique elegante.",
    brochureImageUrl: "/assets/formation/esthetique.jpg",
    eventUrl: null,
    nextDatesText: null,
    sessionNote: null,
    showEventButton: false,
  },
  {
    id: "extension-cils",
    title: "Extension de cils",
    category: "Regard",
    description: "Creer une pose harmonieuse, durable et sophistiquee.",
    brochureImageUrl: "/assets/formation/extentionscils.jpg",
    eventUrl: null,
    nextDatesText: null,
    sessionNote: null,
    showEventButton: false,
  },
  {
    id: "maderotherapie",
    title: "Maderotherapie",
    category: "Corps",
    description: "Des techniques sculptantes pensees pour un protocole precis.",
    brochureImageUrl: "/assets/formation/maderotherapie.jpg",
    eventUrl: null,
    nextDatesText: null,
    sessionNote: null,
    showEventButton: false,
  },
  {
    id: "massage-drainant",
    title: "Massage drainant",
    category: "Corps",
    description: "Un toucher expert pour alleger, lisser et relancer.",
    brochureImageUrl: "/assets/formation/massagedrainant.jpg",
    eventUrl: null,
    nextDatesText: null,
    sessionNote: null,
    showEventButton: false,
  },
  {
    id: "massage-harmonisant",
    title: "Massage harmonisant",
    category: "Bien-etre",
    description: "Un rituel enveloppant, fluide et parfaitement maitrise.",
    brochureImageUrl: "/assets/formation/massageharmo.jpg",
    eventUrl: null,
    nextDatesText: null,
    sessionNote: null,
    showEventButton: false,
  },
  {
    id: "massage-pierre-chaude",
    title: "Massage pierre chaude",
    category: "Bien-etre",
    description: "L'alliance de la chaleur et du lacher-prise sensoriel.",
    brochureImageUrl: "/assets/formation/massagepierrechaude.jpg",
    eventUrl: null,
    nextDatesText: null,
    sessionNote: null,
    showEventButton: false,
  },
  {
    id: "massage-prenatal",
    title: "Massage prenatal",
    category: "Bien-etre",
    description: "Un accompagnement doux et rassurant, pense avec finesse.",
    brochureImageUrl: "/assets/formation/massageprenatal.jpg",
    eventUrl: null,
    nextDatesText: null,
    sessionNote: null,
    showEventButton: false,
  },
  {
    id: "pedicure-medicale",
    title: "Pedicure medicale",
    category: "Pied",
    description: "Une approche soignee pour une expertise technique impeccable.",
    brochureImageUrl: "/assets/formation/pedicuremedical.jpg",
    eventUrl: null,
    nextDatesText: null,
    sessionNote: null,
    showEventButton: false,
  },
  {
    id: "perfection-pedicure",
    title: "Perfection en pedicure",
    category: "Expertise",
    description: "Un niveau superieur de precision et de finition.",
    brochureImageUrl: "/assets/formation/perfepedicuremedical.jpg",
    eventUrl: null,
    nextDatesText: null,
    sessionNote: null,
    showEventButton: false,
  },
  {
    id: "reflexologie-plantaire",
    title: "Reflexologie plantaire",
    category: "Bien-etre",
    description: "Des protocoles precis pour un soin subtil et profond.",
    brochureImageUrl: "/assets/formation/reflexologieplantaire.jpg",
    eventUrl: null,
    nextDatesText: null,
    sessionNote: null,
    showEventButton: false,
  },
  {
    id: "rehaussement-cils",
    title: "Rehaussement de cils",
    category: "Regard",
    description: "Une courbe naturelle, lumineuse et delicatement travaillee.",
    brochureImageUrl: "/assets/formation/rehaussementcils.jpg",
    eventUrl: null,
    nextDatesText: null,
    sessionNote: null,
    showEventButton: false,
  },
  {
    id: "techniques-specifiques-pedicure",
    title: "Techniques specifiques pedicure medicale",
    category: "Expertise",
    description: "Des gestes cibles pour des besoins plus techniques.",
    brochureImageUrl: "/assets/formation/techniquesspecifiquespedicuremedical.jpg",
    eventUrl: null,
    nextDatesText: null,
    sessionNote: null,
    showEventButton: false,
  },
  {
    id: "volume-russe",
    title: "Volume russe",
    category: "Regard",
    description: "Creer du relief et de la densite avec une ligne aerienne.",
    brochureImageUrl: "/assets/formation/volumerusse.jpg",
    eventUrl: null,
    nextDatesText: null,
    sessionNote: null,
    showEventButton: false,
  },
  {
    id: "vsp",
    title: "VSP",
    category: "Finition",
    description: "Une finition nette, durable et parfaitement maitrisee.",
    brochureImageUrl: "/assets/formation/vsp.jpg",
    eventUrl: null,
    nextDatesText: null,
    sessionNote: null,
    showEventButton: false,
  },
];

export function normalizeEventUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeOptionalText(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeFormationPayload(input: FormationContentPayload): FormationContentPayload {
  return {
    title: input.title.trim(),
    category: input.category.trim(),
    description: input.description.trim(),
    brochureImageUrl: input.brochureImageUrl.trim(),
    eventUrl: normalizeEventUrl(input.eventUrl ?? null),
    nextDatesText: normalizeOptionalText(input.nextDatesText ?? null),
    sessionNote: normalizeOptionalText(input.sessionNote ?? null),
    showEventButton: input.showEventButton,
  };
}
