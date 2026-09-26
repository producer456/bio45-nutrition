"""Mac-only publisher: the Canvas feed credential stays on this machine.

Reads David's personal Canvas iCal feed, keeps only BIOL 45 events, and publishes
the dates to the public repo as calendar.json. The feed URL is a credential — it
grants read access to his whole Canvas calendar — so it is never logged, never
printed, and never written into the payload.

Deliberately self-contained rather than a fork of the Bio 40C publisher, whose
library hardcodes that course id in six places. Two publishers that share nothing
cannot drift into each other.

Installed by scripts/install-canvas-publisher.sh as a LaunchAgent every 30 min.
"""
import base64, fcntl, json, re, subprocess, time, urllib.request
from pathlib import Path

REPO = 'producer456/bio45-nutrition'
COURSE = '40466'
COURSE_MARK = 'BIOL F045'          # the feed labels every event with its course
ROOT = Path.home() / 'Library/Application Support/Bio45Nutrition'
GH = '/opt/homebrew/bin/gh'

# One credential, not two. Prefer this app's own config if it is ever given one,
# otherwise share the Bio 40C publisher's — the feed is per-user, not per-course,
# so duplicating it would only create a second thing to rotate.
CONFIG_CANDIDATES = [
    ROOT / 'canvas.json',
    Path.home() / 'Library/Application Support/Bio40CCompanion/canvas.json',
]

COVERAGE = ('BIOL 45.01W dates as Canvas publishes them. Canvas is the source of '
            'record; this is a copy, and only as complete as what she has posted.')


def feed_url():
    for path in CONFIG_CANDIDATES:
        if path.exists():
            return json.loads(path.read_text())['ical_url']
    raise RuntimeError('No Canvas feed configuration found')


def fetch(url):
    request = urllib.request.Request(url, headers={'User-Agent': 'bio45-nutrition-calendar'})
    with urllib.request.urlopen(request, timeout=45) as response:
        return response.read().decode('utf-8', 'replace')


def parse(text):
    text = re.sub(r'\r?\n[ \t]', '', text)          # unfold RFC 5545 continuations
    items = []
    for block in text.split('BEGIN:VEVENT')[1:]:
        def field(name):
            found = re.search(name + r'([^:\n]*):(.*)', block)
            return (found.group(1), found.group(2).strip()) if found else ('', '')
        _, summary = field('SUMMARY')
        _, url = field('URL')
        if COURSE_MARK not in summary and '/courses/' + COURSE not in url:
            continue
        params, start = field('DTSTART')
        uid = field('UID')[1]
        due, kind = normalise(params, start)
        # Strip the course suffix FIRST: the milestone marker sits before it, so
        # anchoring on the raw summary never matched and every milestone was missed.
        title = re.sub(r'\s*\[[^\]]*BIOL F045[^\]]*\]\s*$', '', summary).strip()
        items.append(dict(
            id='canvas-%s-%s' % (COURSE, re.sub(r'[^a-zA-Z0-9_-]', '', uid)[:60]),
            title=title, url=url if url.startswith('https://') else '',
            due=due, dueKind=kind,
            milestone=bool(re.search(r':\s*Milestone\s*\d*\s*$', title, re.I)),
        ))
    return items


def normalise(params, value):
    """Return (ISO string, kind). Never invent a timezone the feed did not give."""
    if not value:
        return None, 'unknown'
    if value.endswith('Z'):                                   # UTC instant
        stamp = time.strptime(value, '%Y%m%dT%H%M%SZ')
        return time.strftime('%Y-%m-%dT%H:%M:%S+00:00', stamp), 'instant'
    if re.fullmatch(r'\d{8}', value):                         # all-day, no time at all
        return '%s-%s-%s' % (value[:4], value[4:6], value[6:]), 'date'
    if 'VALUE=DATE' in params:
        digits = re.sub(r'\D', '', value)[:8]
        return '%s-%s-%s' % (digits[:4], digits[4:6], digits[6:]), 'date'
    return value, 'floating'                                  # local time, zone unstated


def api(method, body=None, allow_missing=False):
    command = [GH, 'api', 'repos/%s/contents/calendar.json' % REPO, '--method', method]
    if body is not None:
        command += ['--input', '-']
    result = subprocess.run(command, input=json.dumps(body) if body else None,
                            text=True, capture_output=True, timeout=60)
    if result.returncode:
        if allow_missing and '404' in (result.stderr or ''):
            return None
        raise RuntimeError('Calendar publication could not reach GitHub')
    return json.loads(result.stdout)


def main():
    ROOT.mkdir(parents=True, exist_ok=True)
    with (ROOT / 'publisher.lock').open('w') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return                                            # a run is already in flight

        current = api('GET', allow_missing=True)
        previous = json.loads(base64.b64decode(current['content'])) if current else {}
        now = time.time()

        try:
            items = parse(fetch(feed_url()))
            error = ''
        except Exception:
            # Keep the last good dates rather than publishing an empty calendar.
            if not previous.get('items'):
                raise RuntimeError('No saved calendar is available')
            items = previous['items']
            error = ('Canvas refresh failed. These are the last dates that were '
                     'retrieved; confirm deadlines in Canvas.')

        payload = dict(version=1, course=COURSE, coverage=COVERAGE,
                       lastSuccess=now if not error else previous.get('lastSuccess', 0),
                       lastAttempt=now, error=error,
                       items=sorted(items, key=lambda i: (i['due'] or '', i['title'])))
        body = (json.dumps(payload, indent=1, ensure_ascii=False) + '\n').encode()

        request = dict(message='Refresh BIOL 45 calendar dates from Canvas',
                       branch='main', content=base64.b64encode(body).decode())
        if current:
            request['sha'] = current['sha']
        api('PUT', request)

        # The tailnet copy on the OTA hub is served straight off this machine and
        # cannot fetch the public one — its CSP is connect-src 'self'. Without this
        # it would keep whatever calendar.json was current at the last deploy, so
        # the two copies would silently drift apart.
        card = Path.home() / 'Sites/ios-ota/bio45-nutrition/web/calendar.json'
        if card.parent.is_dir():
            card.write_bytes(body)
        print('Published %d BIOL 45 calendar items; refresh %s.'
              % (len(items), 'failed; cached dates retained' if error else 'succeeded'))


if __name__ == '__main__':
    try:
        main()
    except Exception:
        # Never surface the exception: it can carry the feed URL or an auth'd request.
        raise SystemExit('Calendar publication failed. The site keeps its last dates.')
