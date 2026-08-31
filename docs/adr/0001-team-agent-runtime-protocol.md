# Team Agent Runtime Protocol

_Superseded by ADR-0002._

TeamRun treats each locally executable Agent as a Team Agent Runtime: its shared record contains only identity and instructions, while the local runtime adapter declares its capabilities, authentication requirement, command execution, and normalized reply result. The chat module accepts one runtime request and returns one reply result; provider-specific CLI flags, credential environment variables, output parsing, and safety limits stay inside the adapter. This keeps credentials local, lets a runtime support chat, task execution, or both explicitly, and makes adding an Agent a registry entry plus adapter rather than a cross-layer change.

## Initial adapters

- Codex: chat reply and task execution; local OpenAI API key.
- Claude Code: chat reply and task execution; local Anthropic API key.
- OpenCode: chat reply and task execution; local OpenCode provider session.

All other known CLIs initially expose task execution only. They are not shown as chat-mentionable until their adapter declares chat-reply capability.
