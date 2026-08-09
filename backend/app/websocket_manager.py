from fastapi import WebSocket


class ConnectionManager:
    """Tracks active WebSocket connections grouped by project_id, so a broadcast
    triggered by one project's activity never reaches sockets watching another project."""

    def __init__(self) -> None:
        self._connections: dict[int, dict[WebSocket, int]] = {}
        # Every connected socket is also indexed here by the user it belongs to,
        # independent of project scoping — this is what lets a message meant for
        # one specific person (e.g. a mention) reach them without needing to know
        # which project's channel their socket happens to be attached to.
        self._user_sockets: dict[int, set[WebSocket]] = {}
        # Reverse lookup so a stale socket found while broadcasting to a user can
        # still be fully cleaned out of _connections too, not just _user_sockets.
        self._socket_project: dict[WebSocket, int] = {}

    def connect(self, project_id: int, websocket: WebSocket, user_id: int) -> None:
        self._connections.setdefault(project_id, {})[websocket] = user_id
        self._user_sockets.setdefault(user_id, set()).add(websocket)
        self._socket_project[websocket] = project_id

    def disconnect(self, project_id: int, websocket: WebSocket) -> None:
        connections = self._connections.get(project_id)
        if connections is not None:
            user_id = connections.pop(websocket, None)
            if not connections:
                self._connections.pop(project_id, None)
            if user_id is not None:
                self._discard_user_socket(user_id, websocket)
        self._socket_project.pop(websocket, None)

    def _discard_user_socket(self, user_id: int, websocket: WebSocket) -> None:
        sockets = self._user_sockets.get(user_id)
        if sockets is None:
            return
        sockets.discard(websocket)
        if not sockets:
            self._user_sockets.pop(user_id, None)

    async def broadcast(
        self, project_id: int, message: dict, exclude_user_id: int | None = None
    ) -> None:
        """Send message to every socket connected to project_id, except sockets
        belonging to exclude_user_id (the user whose own action triggered this) —
        that user already applied the change optimistically and doesn't need a refetch."""
        connections = self._connections.get(project_id)
        if not connections:
            return

        stale: list[WebSocket] = []
        for websocket, user_id in connections.items():
            if user_id == exclude_user_id:
                continue
            try:
                await websocket.send_json(message)
            except Exception:
                stale.append(websocket)

        for websocket in stale:
            self.disconnect(project_id, websocket)

    async def broadcast_to_user(self, user_id: int, message: dict) -> None:
        """Sends to every socket belonging to user_id, regardless of which project's
        connection they came in on. Used for mentions, which target one specific
        person rather than everyone watching a project."""
        sockets = self._user_sockets.get(user_id)
        if not sockets:
            return

        stale: list[WebSocket] = []
        for websocket in list(sockets):
            try:
                await websocket.send_json(message)
            except Exception:
                stale.append(websocket)

        for websocket in stale:
            project_id = self._socket_project.get(websocket)
            if project_id is not None:
                self.disconnect(project_id, websocket)
            else:
                self._discard_user_socket(user_id, websocket)


manager = ConnectionManager()
