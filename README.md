# Wetherspoons API

A TypeScript package for accessing JD Wetherspoon's venue and menu data, including drink information with pricing and alcohol unit calculations.

[![npm version](https://img.shields.io/npm/v/wetherspoons-api.svg)](https://www.npmjs.com/package/wetherspoons-api)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Tests](https://github.com/slack2450/wetherspoons-api/actions/workflows/test.yml/badge.svg)](https://github.com/slack2450/wetherspoons-api/actions/workflows/test.yml)

Requires Node.js 20.19 or newer. No token configuration is needed by default.

## Quick start

```bash
npm install wetherspoons-api
```

```typescript
import { venues, getDrinks } from 'wetherspoons-api';

const [venue] = await venues();
if (!venue) throw new Error('No venues available');

const result = await getDrinks(venue);
if (result.status === 'unavailable') {
  console.log(result.reason);
} else if (result.partial) {
  console.log('Incomplete menu; keep the previous price snapshot.');
} else {
  console.log(result.drinks); // Sorted by lowest price per alcohol unit
}
```

## Documentation

- [Usage and configuration](docs/usage.md)
- [API reference](docs/api-reference.md)
- [Development and testing](docs/development.md)
- [Official client and API compatibility](docs/official-client.md)

## Contributing

Issues and pull requests are welcome on [GitHub](https://github.com/slack2450/wetherspoons-api).

## License

MIT © [Joss Bird](https://github.com/slack2450)
