import { AsyncPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ServicesDataService, ServiceItem } from '../../core/services/services-data.service';
import { SectionTitle } from '../../shared/ui/section-title/section-title';

@Component({
  selector: 'app-services',
  imports: [RouterLink, SectionTitle, AsyncPipe],
  templateUrl: './services.html',
  styleUrl: './services.scss'
})
export class Services {
  private readonly servicesData = inject(ServicesDataService);
  protected readonly services$ = this.servicesData.list();

  protected readonly selectedCategory = signal('Toutes');
  protected readonly searchTerm = signal('');

  protected getCategories(services: ServiceItem[]): string[] {
    return ['Toutes', ...new Set(services.map((service) => service.category))];
  }

  protected filterServices(services: ServiceItem[]): ServiceItem[] {
    const category = this.selectedCategory();
    const term = this.searchTerm().trim().toLowerCase();

    return services.filter((service) => {
      const inCategory = category === 'Toutes' || service.category === category;
      const inSearch =
        term.length === 0 ||
        service.name.toLowerCase().includes(term) ||
        service.description.toLowerCase().includes(term);

      return inCategory && inSearch;
    });
  }

  protected setCategory(category: string): void {
    this.selectedCategory.set(category);
  }

  protected setSearch(value: string): void {
    this.searchTerm.set(value);
  }

  protected formatPrice(priceCents: number): string {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0
    }).format(priceCents / 100);
  }
}
