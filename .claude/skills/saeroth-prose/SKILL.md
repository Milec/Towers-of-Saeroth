---
name: saeroth-prose
description: Apply the Saeroth house voice when writing or revising campaign or player-facing lore. Excludes technical documentation, UI code, commits, and the copied rules vault.
---

# The Saeroth voice

Write notes a GM can use at the table on a phone: plain words, concrete facts,
short paragraphs, and enough context to understand the people and stakes.
Preserve the user's canon and requested tone. Read the relevant note and its
linked context before adding details. Distinguish proposed lore from established
facts. Do not invent prices, dates or population figures merely to sound specific.

## Drafting and revision

- State a fact once. Remove decorative metaphors, adjective stacks, inflated
  rankings and closing summaries that repeat what the paragraph already says.
- Vary sentence length naturally. Avoid repeated paired sentences, em-dash
  twists, fragments used as fake urgency and identical paragraph rhythms.
  These are diagnostic tendencies, not banned punctuation or numerical quotas.
- Prefer usable details: motives, obligations, resources, costs, geography and
  consequences. Include physical detail when it helps play, without turning
  every note into scenery or forcing invented hooks into a narrow edit.
- Attribute disputed beliefs to the faction or person holding them. Do not
  turn a character's claim into an omniscient statement of campaign canon.
- Read the result for flow. Cut what adds no information, but retain essential
  qualifications and connective sentences that make facts understandable.
- Run `scripts/prose_check.py` on changed prose and inspect its findings.
  Metrics are advisory. Do not rewrite unrelated notes to improve a score.

From the repository root:

```sh
python .claude/skills/saeroth-prose/scripts/prose_check.py "campaign/nations/Quivar/Quivar.md"
python tools/lint_notes.py
```

Use `python3` if that is the installed command. Script/reference paths are
relative to this canonical skill directory, including when loaded through
its Codex entrypoint in `.agents/skills/`.

## Structure and scope

`AGENTS.md` and `campaign/README.md` govern structure and filing. Preserve
frontmatter, statblocks, action syntax and table constraints. A Political
Relations row's first sentence must stand alone: the sync tool displays that
gist on the affected nation notes. Run the corresponding synchronization
tools when changing diplomatic or faith facts.

Keep player material deliberately separate from GM notes. Do not apply this
voice to `vault/`, which retains source wording, or to technical documentation,
code and commit messages. Permission to revise prose does not authorize
publication or merging.

For a scene or read-aloud passage that needs more craft, consult
[writing techniques](references/authors.md) selectively. Use its techniques
as optional aids, not a mandate to imitate an author or add atmosphere to
every note. Historical checker averages are not current measurements.
