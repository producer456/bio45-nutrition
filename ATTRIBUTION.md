# Attribution

Study content in this app is adapted from openly licensed textbooks. Nothing here
is a verbatim reproduction: reading cards, objectives, glosses and quiz questions
are written for this app and carry a citation to the section they came from. A test
(`tests/weeks.test.mjs`) fails the build if any shipped string reproduces twelve or
more consecutive words from a source.

The source books themselves are **not** redistributed here. They live outside this
repository and `.gitignore` blocks `*.pdf`, `*.odt`, `*.docx` and `*.zip` so they
cannot be added by accident.

| Source | Authors / publisher | Licence | Used for |
|---|---|---|---|
| *An Introduction to Nutrition* (v1.0, 2013) | Saylor Academy | **CC BY-NC-SA 3.0** | The primary reading map. Its chapter order matches this course's weekly topics one-to-one. Cited as `§chapter.section`. |
| *Nutrition Science and Everyday Application* | Alice Callahan, Heather Leonard, Tamberly Powell (OpenOregon / LibreTexts) | CC BY-NC-SA 4.0 | Modern cross-reference; the only supplied source with real gut-microbiome coverage. |
| *Human Nutrition 2e* | University of Hawai'i at Mānoa Food Science and Human Nutrition Program | CC BY-NC-SA 4.0 | Performance nutrition and food safety. |
| *Human Nutrition (FNDH 400) Flexbook* | Brian Lindshield, Kansas State University | CC BY-NC-SA 4.0 | Deeper biochemistry. |

Note the version difference: the Saylor text is **3.0**, the others are **4.0**.
They are not identical licences, and adaptation compatibility runs in one direction
only. This app is released under CC BY-NC-SA 4.0 (see `LICENSE`).

## Not from a textbook

The course schedule, assignment names, point values, rubric criteria and policies
come from the instructor's own syllabus and Canvas pages. See `SHARING.md` for the
permission under which they appear. Her document files are not rehosted.

## What this app is not

NutritionCalc Plus (ISBN 9781260891089) is a separate, paid McGraw-Hill product and
a required purchase for the course. This app does not integrate with it, scrape it,
reproduce it, or compute nutrient values of its own.
