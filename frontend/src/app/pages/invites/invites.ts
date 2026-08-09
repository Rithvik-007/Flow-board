import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { InviteService } from '../../core/services/invite.service';
import { MyInvite } from '../../core/models/invite.model';

@Component({
  selector: 'app-invites',
  imports: [],
  templateUrl: './invites.html',
  styleUrl: './invites.css',
})
export class Invites implements OnInit {
  private readonly router = inject(Router);
  private readonly inviteService = inject(InviteService);

  readonly invites = this.inviteService.myInvites;
  readonly loaded = signal(false);
  readonly errorMessage = signal<string | null>(null);
  // Tracks which invite is mid-request so its own buttons can disable without
  // freezing the rest of the list.
  readonly actingOnId = signal<number | null>(null);

  ngOnInit(): void {
    this.inviteService.refresh().subscribe(() => this.loaded.set(true));
  }

  accept(invite: MyInvite): void {
    this.errorMessage.set(null);
    this.actingOnId.set(invite.id);
    this.inviteService.accept(invite.id).subscribe({
      next: () => this.router.navigate(['/projects', invite.project_id]),
      error: () => {
        this.actingOnId.set(null);
        this.errorMessage.set('Could not accept invite — please try again.');
      },
    });
  }

  decline(invite: MyInvite): void {
    this.errorMessage.set(null);
    this.actingOnId.set(invite.id);
    this.inviteService.decline(invite.id).subscribe({
      next: () => this.actingOnId.set(null),
      error: () => {
        this.actingOnId.set(null);
        this.errorMessage.set('Could not decline invite — please try again.');
      },
    });
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
