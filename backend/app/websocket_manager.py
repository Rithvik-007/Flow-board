from fastapi import WebSocket


class ConnectionManager:
    """Tracks active WebSocket connections grouped by project_id, so a broadcast
    triggered by one project's activity never reaches sockets watching another project."""

    def __init__(self) -> None:
        self._connections: dict[int, dict[WebSocket, int]] = {}

    def connect(self, project_id: int, websocket: WebSocket, user_id: int) -> None:
        self._connections.setdefault(project_id, {})[websocket] = user_id

    def disconnect(self, project_id: int, websocket: WebSocket) -> None:
        connections = self._connections.get(project_id)
        if connections is None:
            return
        connections.pop(websocket, None)
        if not connections:
            self._connections.pop(project_id, None)

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


manager = ConnectionManager()
