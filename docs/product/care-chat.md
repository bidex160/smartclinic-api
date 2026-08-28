# Care Chat

Care Chat is private, SmartClinic-hosted plain-text communication attached to one General Care `CareRequest`. It is not attached to FastTrack and does not require a `CareAppointment`; all `IN_PERSON`, `VIRTUAL`, and `HOME_VISIT` Care Requests use the same policy.

The conversation is created lazily after the current Provider accepts the Care Request. `PROVIDER_ACCEPTED`, `SCHEDULED`, and `IN_PROGRESS` permit reading and sending. `COMPLETED`, `CANCELLED`, `DECLINED`, and `UNFULFILLABLE` permit reading an existing conversation but do not permit creation or sending. Earlier lifecycle states have no chat access. One database-unique conversation is allowed per Care Request.

Patient routes are under `/api/v1/me/care-requests/:reference/chat`; Provider routes use `/api/v1/provider/care-requests/:reference/chat`. Each namespace provides chat detail, paginated messages, message sending, and an explicit `/read` command. Message pages are newest-first, ordered by `createdAt DESC` and public message reference as a stable tie-breaker. Messages are immutable plain text, trimmed, non-empty, and limited to 4,000 characters.

Authorization always resolves the JWT identity against the Care Request's current SELF Patient or current assigned Provider. The conversation's stored Provider is not independent access authority. Current Care Request assignment is authoritative, so an old Provider cannot retain access. Provider chat detail receives only the patient's given name plus family initial; Patient detail receives the Provider's safe public identity. Responses omit internal IDs and sender User IDs.

Opening chat does not mark messages read. The explicit read command marks only unread messages sent by the other participant. Chat detail returns the authenticated participant's aggregate `unreadCount`. The appointment summary deliberately excludes the external virtual meeting URL; that URL remains available only through authorized appointment detail.

V1 uses REST polling. There is no mature authenticated WebSocket layer to reuse, so Socket.IO, typing indicators, presence, attachments, editing, deletion, reactions, notifications, and push/email message delivery remain deferred. Message bodies are not logged or sent to the invitation-focused email abstraction.
