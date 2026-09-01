# Use Team-Installed Code Provider Identities

Team Server Agent Runs create branches and pull requests through a Team-installed code-provider application or bot identity rather than a member's personal token. Reviews attribute the initiating member, Team Agent, Team Task, and Agent Run separately; this adds provider-installation work but avoids coupling shared automation and credential rotation to an individual member, with GitHub implemented first behind provider-neutral contracts.
