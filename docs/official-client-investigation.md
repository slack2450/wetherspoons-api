# Investigating API compatibility with the official client

[Documentation](README.md) · [Package overview](../README.md)

An HTTP 500 is not enough to classify a failure as an upstream outage. Compare
the request with the official client and inspect raw JSON before our Zod schemas
strip unknown fields. Keep release checks strict while investigating.

The public web client was found on 6 November 2026 through Wetherspoons' own
Order and Pay page: https://www.jdwetherspoon.com/order-and-pay-app/ . It describes
the table QR codes linking to https://jdw.online/ . Following that redirect leads
to https://order.jdwetherspoon.com/ . No login, order or payment is needed to
inspect the public HTML and JavaScript.

To repeat the investigation:

1. Follow the redirect and save the HTML. Note the final URL, since relative
   asset paths belong to that host, not `jdw.online` (which redirects asset
   requests to the homepage too).

   ```bash
   curl -fsSL --max-time 30 https://jdw.online/ \
     -o /tmp/jdw-order.html -w '%{url_effective}\n'
   rg '<script[^>]+src=' /tmp/jdw-order.html
   ```

2. Download the main module script from the resolved host. On the investigation
   date it was the following asset; obtain the current hashed filename from the
   HTML each time rather than assuming this URL will remain valid. Verify that
   the download is JavaScript, not a successful HTML fallback response.

   ```bash
   curl -fsSL --max-time 30 \
     https://order.jdwetherspoon.com/assets/index-CP2QwH5f.js \
     -o /tmp/jdw-order-client.js
   ```

3. Inspect the downloaded source as text; it does not need to be executed.
   Search for `sales-areas`, `fetchMenus`, `fetchMenuById`, `specials`,
   `App-Version` and `API_PROXY_VERSION`. For readable snippets from the minified
   bundle, use this instead of printing its entire single line:

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

4. Trace the request helper and configuration as well as the URL builder.
   In that client, menu listing uses `?type=available`, detail requests use
   `/venues/{venueRef}/sales-areas/{salesAreaId}/menus/{menuId}` with a franchise
   prefix, and the HTTP client sends `App-Version: 26.0.1`, `Cache-Control:
   no-cache` and `Accept-Language`. The menu route accepts digits or `specials`.
   Minified symbol names and the app version can change between builds.

5. Make a small number of read-only requests to the affected pubs and a working
   control. Change one thing at a time: query, header, then menu path. Record
   status, raw menu identity/flags, and schema errors, without logging request
   credentials. Compare original and corrected collection close together so a
   changing menu is not mistaken for a code fix.

## Specials regression found on 6 November 2026

For Sigered, King of Essex (7578, sales area 1111) and The Dictum of Kenilworth
(7591, sales area 1107), the raw legacy menu list advertised `id: 10287` and
`isSpecials: true`. Our schema discarded the flag, so we requested the numeric
detail route. The comparison was:

| Request / model | Observed result at both pubs |
| --- | --- |
| `/menus/10287` | HTTP 500, error Z556 |
| `/menus/specials`, with existing headers | HTTP 200, valid menu, `data.id: "specials"` |
| Successful Specials response through the old detail schema | Rejected because the ID was required to be a number |
| Menu listing with only `App-Version: 26.0.1` added | Specials ID becomes `"specials"`; ordinary IDs become decimal strings |
| Menu listing with only cache/language headers added | Legacy numeric IDs remain |

Adding the app-version header globally is not a drop-in fix: it also made our
unprefixed `/venues/{venueRef}` requests return 404; the official client uses a
franchise prefix for venue detail. A full version migration needs separate
contract checks for venue discovery, details and menus.

The narrow correction preserves `isSpecials`, routes flagged menus to
`/menus/specials`, and accepts the literal `"specials"` in the detail schema.
It uses neither the menu name nor the hard-coded numeric ID to identify Specials.
The existing headers and ordinary menu routing are retained. Genuine HTTP or
schema failures still produce partial results, and the live release test still
rejects those results. Do not skip Specials: they can contain products relevant
to drink prices.

Paired live probes reproduced the original failures and obtained complete
results with the correction at both pubs. The corrected probe also obtained
complete results at Walham Green (7634), Hykeham Manor (7934), and Captain
Flinders (7618). These are point-in-time observations, not a guarantee about
future availability. [src/specials.unit.test.ts](../src/specials.unit.test.ts) covers the request and schema
regression independently of the live service.
