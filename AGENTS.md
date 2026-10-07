# Agent operating rules

Read this file explicitly at session startup. Follow the version accepted on the task base branch; proposed edits in a working branch do not silently replace these rules.

Account roles: `SUSTechHSAS` submits Arena work; `Kibiandkimi` is the human task owner and reviewer. References to owner approval mean `Kibiandkimi`, even if the repository is currently under `SUSTechHSAS`. Check the actual authenticated submission identity; commit author text alone does not establish identity. Do not use the human account to author agent work PRs or approve them.

1. Confirm the repository, task Issue, current work branch, PR base, remote head, and accepted task head before editing. Read `.context/TASK.md`, `STATE.md`, relevant `DECISIONS.md` entries, and unresolved owner review comments. Say when a source is inaccessible.
2. Work only on the assigned `work/<issue>/<unit>` branch. Its PR base must be `task/<same-issue>/main`. Never push to `main` or a task base, merge PRs, enable auto-merge, delete branches, or force-push. If a required Git operation is unavailable, report that limit rather than substitute an unsafe operation.
3. On ordinary session replacement, resume the existing branch and PR. Use a new session identifier in optional logs. Start a new work branch only for a new unit, a deliberate restart, or a separate candidate. If the previous PR was merged, start from the current accepted task head.
4. Treat working-branch content as unreviewed. The owner's explicit instructions and accepted task contract govern the work. Verify consequential inherited claims before relying on them; never invent owner approval, test results, citations, or connector capabilities.
5. Complete small, useful steps. After each such step, before a long operation, and before normally ending a turn, update work files and `.context/STATE.md` together, commit the relevant files, and push to the assigned branch. Verify the remote head. Report a checkpoint as saved only after that verification.
6. After the first successful checkpoint, create a Draft PR if one does not exist. Keep its summary useful for review. Mark it ready only when its stated scope is reviewable. A checkpoint may be incomplete; label failures and gaps honestly.
7. Keep `STATE.md` short: goal, accepted base at unit start, candidate progress, actual verification, blockers, and the next concrete action. Link detailed evidence. Put durable reasoning in `DECISIONS.md`. Do not use file fields to declare your own work approved.
8. Preserve recoverable outputs and required environment instructions. Record stable locations and checksums for external artifacts where applicable. Do not rely on sandbox paths, expiring links, or chat history as the only copy.
9. Do not change goals, acceptance criteria, shared rules, workflows, or ownership as an incidental part of a task. Propose such changes explicitly for owner review. Do not merge unrelated task histories.
10. Assume one active writer per work branch. If a remote ref advances unexpectedly, fetch and inspect it; do not overwrite. If the old session may still be writing, arrange handoff or use a separate successor branch. If several pending PRs exist and none is assigned, ask which to resume.

At startup, briefly state the accepted base, the candidate work being inherited, and the next step. At handoff, provide the working branch/PR, verified remote commit, what changed, verification or gaps, and the next step. Do not paste full histories.

These rules describe the authorized workflow; repository protections enforce only what has actually been configured. Human acceptance is established by owner review and merge, not by an agent-written label or summary.
