import { Component } from '@angular/core';

@Component({
  selector: 'app-legal',
  imports: [],
  templateUrl: './legal.html',
  styleUrl: './legal.scss'
})
export class Legal {
  protected readonly lastUpdated = new Intl.DateTimeFormat('fr-BE', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  }).format(new Date());
}
