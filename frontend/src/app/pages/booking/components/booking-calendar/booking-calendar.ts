import { Component, EventEmitter, Input, Output } from '@angular/core';
import { AvailabilityLevel, MonthDayMeta } from '../../../../core/services/booking-api.service';

type CalendarCell = {
  date: Date;
  ymd: string;
  dayNumber: number;
  inCurrentMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  level: AvailabilityLevel;
};

@Component({
  selector: 'app-booking-calendar',
  templateUrl: './booking-calendar.html',
  styleUrl: './booking-calendar.scss'
})
export class BookingCalendar {
  @Input({ required: true }) monthDate!: Date;
  @Input({ required: true }) dayMeta: MonthDayMeta = {};
  @Input() selectedDay: string | null = null;

  @Output() monthChange = new EventEmitter<'prev' | 'next'>();
  @Output() daySelect = new EventEmitter<string>();

  protected readonly weekdayLabels = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

  protected monthLabel(): string {
    return new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(this.monthDate);
  }

  protected cells(): CalendarCell[] {
    const currentMonth = new Date(this.monthDate.getFullYear(), this.monthDate.getMonth(), 1);
    const firstWeekdayOffset = (currentMonth.getDay() + 6) % 7;
    const start = new Date(currentMonth);
    start.setDate(start.getDate() - firstWeekdayOffset);

    const today = this.toYmd(new Date());
    const selected = this.selectedDay;
    const out: CalendarCell[] = [];

    for (let index = 0; index < 42; index += 1) {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      const ymd = this.toYmd(date);
      const level = this.dayMeta[ymd]?.level ?? 'none';

      out.push({
        date,
        ymd,
        dayNumber: date.getDate(),
        inCurrentMonth: date.getMonth() === currentMonth.getMonth(),
        isToday: ymd === today,
        isSelected: selected === ymd,
        level
      });
    }

    return out;
  }

  protected dotsFor(level: AvailabilityLevel): number {
    if (level === 'high') {
      return 3;
    }
    if (level === 'mid') {
      return 2;
    }
    if (level === 'low') {
      return 1;
    }
    return 0;
  }

  protected dotIndexes(level: AvailabilityLevel): number[] {
    return Array.from({ length: this.dotsFor(level) }, (_, index) => index);
  }

  protected isDisabled(cell: CalendarCell): boolean {
    return cell.level === 'none';
  }

  protected selectDay(cell: CalendarCell): void {
    if (this.isDisabled(cell)) {
      return;
    }
    this.daySelect.emit(cell.ymd);
  }

  protected previousMonth(): void {
    this.monthChange.emit('prev');
  }

  protected nextMonth(): void {
    this.monthChange.emit('next');
  }

  private toYmd(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
