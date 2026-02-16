import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { ServicesDataService, ServiceItem } from '../../core/services/services-data.service';
import { SectionTitle } from '../../shared/ui/section-title/section-title';

type CategoryGroup = {
  id: string;
  name: string;
  items: ServiceItem[];
};

type SearchSuggestion = {
  id: string;
  name: string;
  category: string;
};

@Component({
  selector: 'app-services',
  imports: [RouterLink, SectionTitle],
  templateUrl: './services.html',
  styleUrl: './services.scss'
})
export class Services {
  private readonly servicesData = inject(ServicesDataService);
  protected readonly services = toSignal(this.servicesData.list(), { initialValue: [] as ServiceItem[] });

  protected readonly searchTerm = signal('');
  protected readonly openCategoryId = signal<string | null>(null);
  protected readonly searchFocused = signal(false);

  protected readonly groupedCategories = computed<CategoryGroup[]>(() => {
    const services = this.services();
    const term = this.searchTerm().trim().toLowerCase();
    const grouped = new Map<string, CategoryGroup>();

    for (const service of services) {
      const categoryName = service.category?.trim() || 'Sans categorie';
      const serviceSearch = `${service.name} ${service.description}`.toLowerCase();
      const inSearch = term.length === 0 || serviceSearch.includes(term);
      if (!inSearch) {
        continue;
      }

      const id = this.toCategoryId(categoryName);
      const existing = grouped.get(id);
      if (existing) {
        existing.items.push(service);
        continue;
      }

      grouped.set(id, { id, name: categoryName, items: [service] });
    }

    return Array.from(grouped.values())
      .filter((group) => group.items.length > 0)
      .map((group) => ({
        ...group,
        items: [...group.items].sort((a, b) => a.name.localeCompare(b.name))
      }))
      .sort((a, b) => {
        if (a.name === 'Sans categorie') {
          return 1;
        }
        if (b.name === 'Sans categorie') {
          return -1;
        }
        return a.name.localeCompare(b.name);
      });
  });

  protected readonly searchSuggestions = computed<SearchSuggestion[]>(() => {
    const term = this.normalize(this.searchTerm().trim());
    if (term.length < 1) {
      return [];
    }

    const services = this.services();
    const startsWith: SearchSuggestion[] = [];
    const includes: SearchSuggestion[] = [];

    for (const service of services) {
      const category = service.category?.trim() || 'Sans categorie';
      const nameNorm = this.normalize(service.name);
      const descNorm = this.normalize(service.description);
      const catNorm = this.normalize(category);
      const matches = nameNorm.includes(term) || descNorm.includes(term) || catNorm.includes(term);
      if (!matches) {
        continue;
      }

      const suggestion = { id: service.id, name: service.name, category };
      if (nameNorm.startsWith(term)) {
        startsWith.push(suggestion);
      } else {
        includes.push(suggestion);
      }
    }

    return [...startsWith, ...includes].slice(0, 6);
  });

  protected readonly showSuggestions = computed(() => {
    return this.searchFocused() && this.searchTerm().trim().length > 0 && this.searchSuggestions().length > 0;
  });

  constructor() {
    effect(() => {
      const groups = this.groupedCategories();
      const current = this.openCategoryId();

      if (groups.length === 0) {
        if (current !== null) {
          this.openCategoryId.set(null);
        }
        return;
      }

      if (!current || !groups.some((group) => group.id === current)) {
        this.openCategoryId.set(groups[0].id);
      }
    });
  }

  protected toggleCategory(categoryId: string): void {
    this.openCategoryId.update((current) => (current === categoryId ? null : categoryId));
  }

  protected isOpen(categoryId: string): boolean {
    return this.openCategoryId() === categoryId;
  }

  protected setSearch(value: string): void {
    this.searchTerm.set(value);
  }

  protected onSearchFocus(): void {
    this.searchFocused.set(true);
  }

  protected onSearchBlur(): void {
    setTimeout(() => {
      this.searchFocused.set(false);
    }, 120);
  }

  protected applySuggestion(suggestion: SearchSuggestion): void {
    this.searchTerm.set(suggestion.name);
    this.openCategoryId.set(this.toCategoryId(suggestion.category));
    this.searchFocused.set(false);
  }

  protected formatPrice(priceCents: number): string {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0
    }).format(priceCents / 100);
  }

  private toCategoryId(category: string): string {
    return (
      category
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '') || 'sans-categorie'
    );
  }

  private normalize(value: string): string {
    return value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }
}
