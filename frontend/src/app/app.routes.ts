import { Routes } from '@angular/router';
import { Home } from './pages/home/home';
import { Services } from './pages/services/services';
import { ServiceDetail } from './pages/service-detail/service-detail';
import { Booking } from './pages/booking/booking';
import { About } from './pages/about/about';
import { Contact } from './pages/contact/contact';
import { Trainings } from './pages/trainings/trainings';
import { Legal } from './pages/legal/legal';
import { Privacy } from './pages/privacy/privacy';
import { AdminLogin } from './admin/pages/admin-login/admin-login';
import { AdminServices } from './admin/pages/admin-services/admin-services';
import { AdminStaffList } from './admin/pages/admin-staff-list/admin-staff-list';
import { AdminStaffDetail } from './admin/pages/admin-staff-detail/admin-staff-detail';
import { AdminPlanning } from './admin/pages/admin-planning/admin-planning';
import { AdminHours } from './admin/pages/admin-hours/admin-hours';
import { AdminTimeOff } from './admin/pages/admin-timeoff/admin-timeoff';
import { AdminLayout } from './admin/layout/admin-layout';
import { adminGuard } from './core/guards/admin.guard';

export const routes: Routes = [
  { path: 'admin/login', component: AdminLogin },
  {
    path: 'admin',
    component: AdminLayout,
    canActivate: [adminGuard],
    children: [
      { path: 'services', component: AdminServices },
      { path: 'staff', component: AdminStaffList },
      { path: 'staff/:id', component: AdminStaffDetail },
      { path: 'praticiennes', redirectTo: 'staff', pathMatch: 'full' },
      { path: 'praticiennes/:id', redirectTo: 'staff/:id' },
      { path: 'horaires', component: AdminHours },
      { path: 'conges', component: AdminTimeOff },
      { path: 'planning', component: AdminPlanning },
      { path: '', pathMatch: 'full', redirectTo: 'services' }
    ]
  },
  { path: '', component: Home },
  { path: 'soins', component: Services },
  { path: 'soins/:id', component: ServiceDetail },
  { path: 'rdv', component: Booking },
  { path: 'a-propos', component: About },
  { path: 'contact', component: Contact },
  { path: 'formations', component: Trainings },
  { path: 'mentions-legales', component: Legal },
  { path: 'confidentialite', component: Privacy },
  { path: '**', redirectTo: '' }
];
