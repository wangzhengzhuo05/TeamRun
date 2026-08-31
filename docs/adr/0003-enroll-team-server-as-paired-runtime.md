# Enroll the Team Server as a Paired Runtime

Each Team initially binds one active Linux TeamRun paired runtime as its Team Server, enrolled or replaced by an Owner with a one-time code. Team Agent secrets stay encrypted on that runtime, the Team cloud stores no raw SSH private key, and each Agent Run receives an isolated worktree and process; this reuses the existing remote runtime contract and limits credential exposure, while making shared Agent availability depend on that server.
