# Run Team Agents on the Team Server

Team Agents are Team-scoped, shared identities executed by OpenCode on the Team's bound Team Server using an OpenAI-compatible Base URL, API key, and explicit model. This supersedes ADR-0001's per-device, multi-adapter runtime: central execution makes the same Team Agent available to authorized members and keeps its activity Team-visible, at the cost of making Team Agent availability depend on the Team Server.
