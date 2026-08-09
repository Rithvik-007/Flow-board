import { Component, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { InviteService } from '../../services/invite.service';

@Component({
  selector: 'app-shell',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './app-shell.html',
  styleUrl: './app-shell.css',
})
export class AppShell implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly inviteService = inject(InviteService);
  private readonly router = inject(Router);

  readonly currentUser = this.authService.currentUser;
  readonly pendingInviteCount = this.inviteService.pendingCount;
  readonly mobileNavOpen = signal(false);

  ngOnInit(): void {
    this.inviteService.refresh().subscribe();
  }

  closeMobileNav(): void {
    this.mobileNavOpen.set(false);
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  initials(name: string): string {
    return name
      .split(' ')
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  }
}
