# Staying inside the course's AI policy

Her syllabus says, in full:

> AI is a tool and should be used as such. It is not a substitute for thinking,
> evaluating or completing work. All of your coursework should reflect your own
> thinking and demonstrate your individual understanding of course concepts. In this
> course, AI tools may be used for preparation or editing, such as brainstorming or
> proofreading after drafting. AI may not be used for content analysis or writing
> your submissions.

So the line is: **preparation and editing, yes. Content analysis and writing
submissions, no.**

## How this app is built to stay on the right side of it

- **Nothing here drafts submittable text.** There is no feature that takes a prompt
  and returns a discussion post, a reflection, a paper analysis or an essay. The
  application-activity helpers are checklists and self-interrogation questions — they
  ask, they do not answer.
- **Nothing here analyses your writing.** The app never reads a draft and tells you
  what it means or whether it is right. Free text you type into the food diary is
  checked against her formatting rubric — is there a portion, is there a preparation
  method — and nothing else.
- **The self-quiz shows you its own authored answer** so you can compare your
  recall against it. That is the same thing a textbook's answer key does.
- **No network calls to anything.** The app makes no third-party requests at all;
  a test asserts it. There is no model behind it at runtime.

These are enforced, not just intended: `tests/weeks.test.mjs` fails the build if an
application prompt reads like it drafts work for you, and `tests/content.test.mjs`
fails it if any module references a remote origin.

## What it does not decide for you

If you use this app, say so, the way she asks:

> If you use AI in the allowable ways, include a brief note describing the tool and
> how it was used.

A truthful note would be something like *"I used a self-quiz tool I built to test my
recall of the chapter objectives before writing."* Whether that needs disclosing at
all is her call, not this app's — ask her.
