import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AdminTopbar } from './admin-topbar/admin-topbar';

@Component({
  selector: 'app-admin-layout',
  imports: [RouterOutlet, AdminTopbar],
  templateUrl: './admin-layout.html',
  styleUrl: './admin-layout.scss'
})
export class AdminLayout {}
