import { Injectable, inject, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { API_BASE_URL } from '../api.config';
import { AuthService } from './auth.service';

export type WsEventType =
  | 'task_created'
  | 'task_updated'
  | 'task_deleted'
  | 'subtask_created'
  | 'subtask_updated'
  | 'subtask_deleted'
  | 'comment_added'
  | 'comment_deleted';

export interface WsEvent {
  event: WsEventType;
  task_id: number;
}

const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY_MS = 1500;

// Custom close codes the backend uses for auth/membership rejections (see
// backend/app/routers/ws.py). Retrying won't help here — the problem is the
// token or the user's access, not a dropped connection — so give up immediately.
const TERMINAL_CLOSE_CODES = new Set([4401, 4403]);

@Injectable({ providedIn: 'root' })
export class WebSocketService {
  private readonly authService = inject(AuthService);

  private socket: WebSocket | null = null;
  private projectId: number | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionalDisconnect = false;

  private readonly messagesSubject = new Subject<WsEvent>();
  readonly messages$ = this.messagesSubject.asObservable();

  // Set once reconnection attempts are exhausted (or the server rejected us outright) —
  // components can surface this as a small "connection lost" indicator.
  readonly connectionLost = signal(false);

  connect(projectId: number): void {
    this.projectId = projectId;
    this.intentionalDisconnect = false;
    this.reconnectAttempts = 0;
    this.connectionLost.set(false);
    this.open();
  }

  disconnect(): void {
    this.intentionalDisconnect = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.socket?.close();
    this.socket = null;
    this.projectId = null;
  }

  private open(): void {
    if (this.projectId === null) return;

    // Browsers can't set custom headers on a WebSocket handshake, so the JWT
    // that would normally be an Authorization header rides as a query param.
    const token = this.authService.getToken();
    const wsBase = API_BASE_URL.replace(/^http/, 'ws');
    const url = `${wsBase}/ws/${this.projectId}?token=${encodeURIComponent(token ?? '')}`;

    const socket = new WebSocket(url);
    this.socket = socket;

    socket.onopen = () => {
      this.reconnectAttempts = 0;
      this.connectionLost.set(false);
    };

    socket.onmessage = (event) => {
      try {
        this.messagesSubject.next(JSON.parse(event.data));
      } catch {
        // Ignore malformed frames rather than crashing the handler.
      }
    };

    socket.onclose = (event) => {
      if (this.intentionalDisconnect || TERMINAL_CLOSE_CODES.has(event.code)) {
        return;
      }
      this.scheduleReconnect();
    };

    socket.onerror = () => {
      socket.close();
    };
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      this.connectionLost.set(true);
      return;
    }
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => this.open(), RECONNECT_DELAY_MS * this.reconnectAttempts);
  }
}
