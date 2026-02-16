import { z } from "zod";

const reasonItemSchema = z.object({
  title: z.string().min(1),
  text: z.string().min(1),
});

const testimonialItemSchema = z.object({
  name: z.string().min(1),
  text: z.string().min(1),
  rating: z.int().min(1).max(5),
});

const faqItemSchema = z.object({
  question: z.string().min(1),
  answer: z.string().min(1),
});

const contactDayHoursSchema = z.object({
  day: z.string().min(1),
  closed: z.boolean(),
  start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
});

function defaultContactWeeklyHours() {
  return [
    { day: "Lundi", closed: false, start: "09:30", end: "19:00" },
    { day: "Mardi", closed: false, start: "09:30", end: "19:00" },
    { day: "Mercredi", closed: false, start: "09:30", end: "19:00" },
    { day: "Jeudi", closed: false, start: "09:30", end: "19:00" },
    { day: "Vendredi", closed: false, start: "09:30", end: "19:00" },
    { day: "Samedi", closed: false, start: "09:30", end: "19:00" },
    { day: "Dimanche", closed: true, start: "09:30", end: "19:00" },
  ];
}

export const homeContentSchema = z.object({
  hero: z.object({
    visible: z.boolean(),
    badge: z.string().min(1),
    title: z.string().min(1),
    lead: z.string().min(1),
    primaryButtonLabel: z.string().min(1),
    secondaryButtonLabel: z.string().min(1),
  }),
  offers: z.object({
    visible: z.boolean(),
    title: z.string().min(1),
    subtitle: z.string().min(1),
  }),
  about: z.object({
    visible: z.boolean(),
    title: z.string().min(1),
    text: z.string().min(1),
    buttonLabel: z.string().min(1),
    images: z.array(z.string().min(1)).max(8),
  }),
  reasons: z.object({
    visible: z.boolean(),
    title: z.string().min(1),
    items: z.array(reasonItemSchema).min(1).max(6),
  }),
  testimonials: z.object({
    visible: z.boolean(),
    title: z.string().min(1),
    items: z.array(testimonialItemSchema).min(1).max(8),
  }),
  contact: z.object({
    visible: z.boolean(),
    title: z.string().min(1),
    address: z.string().min(1),
    hours: z.string().min(1),
    contactButtonLabel: z.string().min(1),
    instagramButtonLabel: z.string().min(1),
  }),
  ctaFinal: z.object({
    visible: z.boolean(),
    title: z.string().min(1),
    buttonLabel: z.string().min(1),
  }),
});

export const aboutPageContentSchema = z.object({
  hero: z.object({
    visible: z.boolean(),
    title: z.string().min(1),
    intro: z.string().min(1),
  }),
  approach: z.object({
    visible: z.boolean(),
    title: z.string().min(1),
    text: z.string().min(1),
  }),
  hygiene: z.object({
    visible: z.boolean(),
    title: z.string().min(1),
    text: z.string().min(1),
  }),
  trainee: z.object({
    visible: z.boolean(),
    title: z.string().min(1),
    text: z.string().min(1),
  }),
});

const contactInfoSchema = z.union([
  z.object({
    visible: z.boolean(),
    address: z.string().min(1),
    phone: z.string().min(1),
    email: z.string().min(1),
    hoursLabel: z.string().min(1),
    weeklyHours: z.array(contactDayHoursSchema).length(7),
  }),
  z.object({
    visible: z.boolean(),
    address: z.string().min(1),
    phone: z.string().min(1),
    email: z.string().min(1),
    hours: z.string().min(1),
  }),
]).transform((value) => {
  if ("weeklyHours" in value) {
    return value;
  }

  return {
    visible: value.visible,
    address: value.address,
    phone: value.phone,
    email: value.email,
    hoursLabel: value.hours,
    weeklyHours: defaultContactWeeklyHours(),
  };
});

export const contactPageContentSchema = z.object({
  hero: z.object({
    visible: z.boolean(),
    title: z.string().min(1),
  }),
  info: contactInfoSchema,
  faq: z.object({
    visible: z.boolean(),
    title: z.string().min(1),
    items: z.array(faqItemSchema).min(1).max(10),
  }),
});

export type HomeContentPayload = z.infer<typeof homeContentSchema>;
export type AboutPageContentPayload = z.infer<typeof aboutPageContentSchema>;
export type ContactPageContentPayload = z.infer<typeof contactPageContentSchema>;

export type ManagedPageSlug = "home" | "about" | "contact";

export function defaultHomeContent(): HomeContentPayload {
  return {
    hero: {
      visible: true,
      badge: "Institut de beaute du regard",
      title: "Le regard de Manon",
      lead: "Un institut dedie a la beaute du regard, avec une approche douce, precise et elegante.",
      primaryButtonLabel: "Prendre rendez-vous",
      secondaryButtonLabel: "Voir les soins",
    },
    offers: {
      visible: true,
      title: "Offres du moment",
      subtitle: "Editions limitees / promotions",
    },
    about: {
      visible: true,
      title: "A propos",
      text: "Manon vous accueille dans un espace calme et lumineux, avec un diagnostic personnalise pour respecter votre visage et vos attentes.",
      buttonLabel: "En savoir plus",
      images: [],
    },
    reasons: {
      visible: true,
      title: "Pourquoi nous choisir",
      items: [
        {
          title: "Precision",
          text: "Des gestes minutieux pour un resultat net et naturel.",
        },
        {
          title: "Hygiene stricte",
          text: "Protocoles d'hygiene renforces a chaque prestation.",
        },
        {
          title: "Conseil personnalise",
          text: "Chaque soin est adapte a votre morphologie et votre rythme.",
        },
      ],
    },
    testimonials: {
      visible: true,
      title: "Avis",
      items: [
        {
          name: "Camille",
          text: "Accueil parfait et resultat tres naturel.",
          rating: 5,
        },
        {
          name: "Sarah",
          text: "Mon regard est sublime, je recommande.",
          rating: 5,
        },
        {
          name: "Julie",
          text: "Soin confortable et travail tres soigne.",
          rating: 5,
        },
      ],
    },
    contact: {
      visible: true,
      title: "Contact rapide",
      address: "12 rue des Lilas, 59000 Lille",
      hours: "Lun-Sam: 9h30 - 19h00",
      contactButtonLabel: "Page contact",
      instagramButtonLabel: "Instagram",
    },
    ctaFinal: {
      visible: true,
      title: "Prete a sublimer votre regard ?",
      buttonLabel: "Prendre RDV",
    },
  };
}

export function defaultAboutPageContent(): AboutPageContentPayload {
  return {
    hero: {
      visible: true,
      title: "A propos",
      intro:
        "Le regard de Manon est ne d'une passion pour la precision du geste et l'elegance des resultats naturels. Chaque rendez-vous commence par une ecoute attentive de vos attentes.",
    },
    approach: {
      visible: true,
      title: "Notre approche",
      text: "Nous privilegions des techniques maitrisees, un rythme adapte a chaque cliente, et des conseils simples pour prolonger les effets a la maison.",
    },
    hygiene: {
      visible: true,
      title: "Hygiene et securite",
      text: "Materiel desinfecte, consommables individuels et protocoles stricts sont appliques a chaque soin.",
    },
    trainee: {
      visible: true,
      title: "Stagiaire",
      text: "Selon les periodes, une stagiaire peut etre presente en observation. Aucun geste n'est realise sans validation prealable et votre accord.",
    },
  };
}

export function defaultContactPageContent(): ContactPageContentPayload {
  return {
    hero: {
      visible: true,
      title: "Contact",
    },
    info: {
      visible: true,
      address: "12 rue des Lilas, 59000 Lille",
      phone: "06 00 00 00 00",
      email: "contact@leregarddemanon.fr",
      hoursLabel: "Lun-Sam, 9h30 - 19h00",
      weeklyHours: defaultContactWeeklyHours(),
    },
    faq: {
      visible: true,
      title: "FAQ",
      items: [
        {
          question: "Annulation",
          answer: "Merci de prevenir 24h a l'avance pour toute annulation.",
        },
        {
          question: "Retard",
          answer: "Au-dela de 10 minutes de retard, la prestation peut etre adaptee.",
        },
      ],
    },
  };
}

export function defaultPageContent(slug: ManagedPageSlug): HomeContentPayload | AboutPageContentPayload | ContactPageContentPayload {
  if (slug === "home") {
    return defaultHomeContent();
  }

  if (slug === "about") {
    return defaultAboutPageContent();
  }

  return defaultContactPageContent();
}

export function normalizePageContent(slug: ManagedPageSlug, input: unknown): HomeContentPayload | AboutPageContentPayload | ContactPageContentPayload {
  if (slug === "home") {
    const parsed = homeContentSchema.safeParse(input);
    return parsed.success ? parsed.data : defaultHomeContent();
  }

  if (slug === "about") {
    const parsed = aboutPageContentSchema.safeParse(input);
    return parsed.success ? parsed.data : defaultAboutPageContent();
  }

  const parsed = contactPageContentSchema.safeParse(input);
  return parsed.success ? parsed.data : defaultContactPageContent();
}

export function pageSchemaForSlug(slug: ManagedPageSlug): z.ZodTypeAny {
  if (slug === "home") {
    return homeContentSchema;
  }

  if (slug === "about") {
    return aboutPageContentSchema;
  }

  return contactPageContentSchema;
}

export function normalizeHomeContent(input: unknown): HomeContentPayload {
  const parsed = homeContentSchema.safeParse(input);
  if (!parsed.success) {
    return defaultHomeContent();
  }
  return parsed.data;
}
