# Official client and API compatibility

[Documentation](README.md) · [Package overview](../README.md)

## Public client source

- Official Order and Pay information: https://www.jdwetherspoon.com/order-and-pay-app/
- Table QR-code entry point: https://jdw.online/
- Web ordering application: https://order.jdwetherspoon.com/

The ordering application's HTML references its public JavaScript bundle. No
login or order is required to download the source. Asset filenames contain a
build hash, so the HTML is the source of the current filename.

Relative asset URLs belong to the final page URL after redirects. Requests to
asset paths on `jdw.online` can redirect to the homepage and return HTML with a
200 status instead of JavaScript.

### Downloading the bundle

This script follows the entry-point redirect, resolves the module script URL,
and saves the source for inspection:

```python
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin
from urllib.request import urlopen

class ModuleScripts(HTMLParser):
    def __init__(self):
        super().__init__()
        self.sources = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'script' and attrs.get('type') == 'module' and attrs.get('src'):
            self.sources.append(attrs['src'])

with urlopen('https://jdw.online/', timeout=30) as page:
    base_url = page.geturl()
    parser = ModuleScripts()
    parser.feed(page.read().decode('utf-8'))

if not parser.sources:
    raise RuntimeError('No module script found; inspect the page HTML')

bundle_url = urljoin(base_url, parser.sources[0])
with urlopen(bundle_url, timeout=30) as bundle:
    if 'javascript' not in bundle.headers.get('Content-Type', '').lower():
        raise RuntimeError('Expected JavaScript, possibly received an HTML fallback')
    Path('/tmp/jdw-order-client.js').write_bytes(bundle.read())
print(bundle_url)
```

### Useful source searches

| Search term | Relevant behaviour |
| --- | --- |
| `fetchMenus` | Menu-list path and query parameters |
| `fetchMenuById` | Menu-detail path construction |
| `sales-areas` | Sales-area identifiers in requests |
| `specials` | Virtual Specials menu route |
| `App-Version` | Client version header and request helper |
| `API_PROXY_VERSION` | API base URL/version configuration |

Minified symbol names change between builds. Follow references from the request
function to its HTTP helper and configuration; a URL alone does not describe the
full request contract. The source can be inspected as text without executing it.

For short excerpts from the minified bundle:

```python
from pathlib import Path

source = Path('/tmp/jdw-order-client.js').read_text()
for term in ['fetchMenus', 'fetchMenuById', 'specials', 'App-Version']:
    offset = 0
    for _ in range(5):
        found = source.find(term, offset)
        if found < 0:
            break
        print(term, source[max(0, found - 180):found + 500])
        offset = found + len(term)
```

## Menu request contract

Paths below are relative to `https://ca.jdw-apps.net/api/v0.1`.

| Resource | Path |
| --- | --- |
| Menu list | `/{franchise}/venues/{venueRef}/sales-areas/{salesAreaId}/menus` |
| Ordinary menu | `/{franchise}/venues/{venueRef}/sales-areas/{salesAreaId}/menus/{menuId}` |
| Specials menu | `/{franchise}/venues/{venueRef}/sales-areas/{salesAreaId}/menus/specials` |

The official web client requests menu lists with `?type=available`. Its HTTP
helper includes `App-Version`, `Cache-Control: no-cache`, and `Accept-Language`
headers alongside the public client authorization token.

### Specials menus

Legacy menu summaries can advertise a numeric Specials ID such as `10287`,
with `isSpecials: true`. That numeric detail route can return HTTP 500 / Z556
while the virtual `/menus/specials` route succeeds.

Required handling:

- Preserve `isSpecials` when parsing menu summaries.
- Use `/menus/specials` for flagged menus, regardless of their numeric ID or
  display name.
- Accept the literal `"specials"` as a detailed menu ID alongside numeric IDs.
- Fetch and validate Specials products normally; they may affect drink prices.
- Treat genuine HTTP and schema failures as incomplete results.

The display name `Specials` alone is not a routing signal. An ordinary menu with
that name still uses its numeric ID. Regression coverage:
[src/specials.unit.test.ts](../src/specials.unit.test.ts).

### App-version compatibility

The `App-Version` header selects API behaviour; it is not merely telemetry.
Known differences with the web client's `App-Version: 26.0.1` contract:

| Area | Legacy requests without the header | Requests with `App-Version: 26.0.1` |
| --- | --- | --- |
| Specials summary ID | Numeric ID with `isSpecials: true` | `"specials"` |
| Ordinary summary IDs | Numbers | Decimal strings |
| Venue detail route | `/venues/{venueRef}` | Franchise-prefixed route; unprefixed requests can return 404 |

Adding cache or language headers does not select the newer menu ID format.
Adding `App-Version` globally requires compatible venue routes and schemas as
well as menu handling. The package uses the legacy request contract with
explicit support for the virtual Specials route.

## Diagnosing request failures

HTTP 500 alone does not establish whether a request is valid. An incompatible
route or omitted version header can also produce a server error.

Useful checks:

- Inspect raw JSON before schema parsing removes unknown fields.
- Compare path, query parameters, headers, and identifier types with the public
  client source.
- Change one request component at a time and include a working pub as a control.
- Compare original and corrected requests close together to account for menu
  updates and ordering availability.
- Record response status, menu flags, identifiers, and schema errors without
  logging request credentials.

The live release suite requires complete results. Request compatibility errors
need client fixes; they are not grounds for treating partial results as complete.
