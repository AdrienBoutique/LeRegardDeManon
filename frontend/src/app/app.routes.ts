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
import { AdminPromotions } from './admin/pages/promotions/admin-promotions';
import { AdminHomeContent } from './admin/pages/admin-home-content/admin-home-content';
import { AdminAboutContent } from './admin/pages/admin-about-content/admin-about-content';
import { AdminContactContent } from './admin/pages/admin-contact-content/admin-contact-content';
import { AdminContentHub } from './admin/pages/admin-content-hub/admin-content-hub';
import { AdminLayout } from './admin/layout/admin-layout';
import { AdminClients } from './admin/pages/admin-clients/admin-clients';
import { AdminAppointmentRequests } from './admin/pages/admin-appointment-requests/admin-appointment-requests';
import { AdminSettings } from './admin/pages/admin-settings/admin-settings';
import { AdminDashboardComponent } from './admin/pages/admin-dashboard/admin-dashboard.component';
import { authGuard } from './core/guards/auth.guard';
import { roleGuard } from './core/guards/role.guard';
import { ChangePassword } from './pages/change-password/change-password';

const adminChildren: Routes = [
  { path: 'services', component: AdminServices, canActivate: [roleGuard], data: { roles: ['ADMIN'] } },
  { path: 'promotions', component: AdminPromotions, canActivate: [roleGuard], data: { roles: ['ADMIN'] } },
  { path: 'clients', component: AdminClients, canActivate: [roleGuard], data: { roles: ['ADMIN'] } },
  { path: 'edition', component: AdminContentHub, canActivate: [roleGuard], data: { roles: ['ADMIN'] } },
  { path: 'accueil', component: AdminHomeContent, canActivate: [roleGuard], data: { roles: ['ADMIN'] } },
  { path: 'a-propos', component: AdminAboutContent, canActivate: [roleGuard], data: { roles: ['ADMIN'] } },
  { path: 'contact', component: AdminContactContent, canActivate: [roleGuard], data: { roles: ['ADMIN'] } },
  { path: 'staff', component: AdminStaffList, canActivate: [roleGuard], data: { roles: ['ADMIN'] } },
  { path: 'staff/:id', component: AdminStaffDetail, canActivate: [roleGuard], data: { roles: ['ADMIN'] } },
  { path: 'praticiennes', redirectTo: 'staff', pathMatch: 'full' },
  { path: 'praticiennes/:id', redirectTo: 'staff/:id' },
  { path: 'horaires', component: AdminHours, canActivate: [roleGuard], data: { roles: ['ADMIN'] } },
  { path: 'conges', component: AdminTimeOff, canActivate: [roleGuard], data: { roles: ['STAFF', 'ADMIN'] } },
  { path: 'planning', component: AdminPlanning, canActivate: [roleGuard], data: { roles: ['STAFF', 'ADMIN'] } },
  { path: 'dashboard', component: AdminDashboardComponent, canActivate: [roleGuard], data: { roles: ['ADMIN'] } },
  { path: 'demandes', component: AdminAppointmentRequests, canActivate: [roleGuard], data: { roles: ['ADMIN'] } },
  { path: 'reglages', component: AdminSettings, canActivate: [roleGuard], data: { roles: ['ADMIN'] } },
  { path: '', pathMatch: 'full', redirectTo: 'planning' }
];

export const routes: Routes = [
  { path: 'admin/login', component: AdminLogin },
  { path: 'change-password', component: ChangePassword, canActivate: [authGuard] },
  {
    path: 'admin',
    component: AdminLayout,
    canActivate: [authGuard],
    children: adminChildren
  },
  {
    path: 'espace-pro',
    component: AdminLayout,
    canActivate: [authGuard],
    children: adminChildren
  },
  {
    path: 'planning',
    pathMatch: 'full',
    redirectTo: 'admin/planning'
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
