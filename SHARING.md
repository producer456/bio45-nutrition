# Sharing this course's information

**Recorded 2026-09-25.**

The student who built this app states that he has permission to share this course's
information, on the same footing as the permission recorded for another Foothill
course in a sibling project: the material may be shared **provided it is not sold**.

On that basis this app carries:

- the weekly topic sequence and term dates,
- assignment names, due dates and point values,
- category structure, drop-lowest rules and the grading scale,
- rubric criteria, quoted where quoting them is what makes them useful.

It does **not** carry:

- any of the instructor's document files — no PDFs, no Word or ODT files, nothing
  rehosted. `.gitignore` blocks those extensions so they cannot be added by accident;
- lecture recordings, slides, or any material by another author;
- any student's submitted work, including the author's.

## Terms this imposes

- **Non-commercial.** This material is not sold, and the `LICENSE`
  (CC BY-NC-SA 4.0) carries that forward to anyone who reuses it.
- **Permission is not endorsement.** The instructor has not written, reviewed or
  approved this app. Every page says so.
- **The instructor's authorship is retained.** Where her wording is used — rubric
  criteria, policy sentences — it is presented as hers, not paraphrased into
  something that could be mistaken for this app's own rule.

## If that permission is ever withdrawn

Remove `course.json`'s `assignments`, `grading` and `latePolicy` blocks and the
`Course` route. The study content is independent of them: it is adapted from openly
licensed textbooks (see `ATTRIBUTION.md`) and would stand on its own.

## Accuracy

Everything here was transcribed by hand from a syllabus and a Canvas course summary
on 2026-09-25, and parts of the schedule are **inferred** rather than stated — those
are marked in the app and in `README.md`. It is a study aid, not a source of record.
Canvas is the source of record.
