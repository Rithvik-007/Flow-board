import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { API_BASE_URL } from '../api.config';
import { Invite, MyInvite } from '../models/invite.model';

@Injectable({ providedIn: 'root' })
export class InviteService {
  private readonly http = inject(HttpClient);

  // Shared across the app (sidebar badge + the invites page itself) so accepting
  // or declining on the invites page updates the badge without a second fetch.
  readonly myInvites = signal<MyInvite[]>([]);
  readonly pendingCount = computed(() => this.myInvites().length);

  refresh(): Observable<MyInvite[]> {
    return this.http
      .get<MyInvite[]>(`${API_BASE_URL}/invites/my`)
      .pipe(tap((invites) => this.myInvites.set(invites)));
  }

  accept(inviteId: number): Observable<Invite> {
    return this.http.patch<Invite>(`${API_BASE_URL}/invites/${inviteId}/accept`, {}).pipe(
      tap(() => this.myInvites.update((current) => current.filter((i) => i.id !== inviteId))),
    );
  }

  decline(inviteId: number): Observable<Invite> {
    return this.http.patch<Invite>(`${API_BASE_URL}/invites/${inviteId}/decline`, {}).pipe(
      tap(() => this.myInvites.update((current) => current.filter((i) => i.id !== inviteId))),
    );
  }
}
