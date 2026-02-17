import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-section-title',
  imports: [],
  templateUrl: './section-title.html',
  styleUrl: './section-title.scss'
})
export class SectionTitle {
  @Input() public title = '';
  @Input() public subtitle = '';
}
