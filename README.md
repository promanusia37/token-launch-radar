# Token Launch Radar

A ranked board of the protocols that record no token yet, priced by the ones that already launched —
built for make.fun's `token-radar-01` bounty.

## What it does

`main.ts` (Node 22, standard library only) reads the sealed DefiLlama snapshot, prices every ranked
protocol with the comps model in `lib/model.ts`, and writes:

- `board.json` — 178 rows: the whole 40-protocol watchlist plus 138 early pre-token protocols below
  the $50M floor, each with an implied launch value, the model's working, a thesis and a farm plan;
- `data.js` + `dashboard/` — a static dashboard (board, per-protocol detail view, filters, the live
  comparables and the pricing method) that renders with no network;
- `screenshots/` — the board, one protocol's detail view and a filtered view;
- `dossier.json` — built with the vendored `vendor/makefun-board.ts`.

## The model (comps-2)

A token that does not exist yet has no price; what it has is a balance sheet the market already knows
how to price. For every launched protocol in the snapshot, take `mcap / TVL`. A category's multiple is
the median of its members' ratios, shrunk toward the market-wide median (0.21x) with weight `n/(n+4)`
and clamped to 0.03x–2.50x. Then:

```
implied = TVL × category multiple × growth × maturity × breadth
```

- **growth**: the 7-day TVL change, clamped to −40%…+60%, credited at 35%;
- **maturity**: 0.65 + 0.35 × min(age, 3 years)/3 years (unknown age counts as one year);
- **breadth**: +3% per extra chain, up to five.

The same function prices every row — no protocol is priced by hand — and each row carries its own
working so a reader can disagree line by line. Wrapped, staked and bridged products of tokens that
already trade, exchanges and versioned pools are excluded from the early rows by the same rule the
house applies to the watchlist. A protocol here *records* no token in DefiLlama's data; that is not
proof it has none.

## Run it

```
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

Then open `out/dashboard/index.html`.

## Screenshots

The three captures under `screenshots/` are rendered from the same `board.json` the dashboard
renders, in the dashboard's own layout and palette (the build machine had no usable headless
browser: its managed Chromium refuses standalone startup).

## License

MIT — see `LICENSE`.
