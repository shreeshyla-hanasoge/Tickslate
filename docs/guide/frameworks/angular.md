# Tickslate in Angular

Angular needs to be told that `ts-` tags are custom elements, and then binds
properties and events the usual way. This recipe uses standalone components;
for NgModules, put the schema in the module's `schemas` instead.

## Set up

```bash
npm install tickslate
```

Register the elements once, in `main.ts`, so they exist before any template
renders:

```ts
// main.ts
import 'tickslate/elements'
```

Add `tickslate/tokens.css` to the `styles` array in `angular.json` if you want
the stylesheet (the tiles carry defaults without it).

## `CUSTOM_ELEMENTS_SCHEMA`

```ts
import { Component, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core'

@Component({
  selector: 'app-dashboard',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './dashboard.component.html',
})
export class DashboardComponent {}
```

## Binding data

`[data]` is a property binding, and Angular sets properties on custom elements
that have them, so objects pass through:

```html
<ts-metric label="Signups" size="S" [data]="stats"></ts-metric>
<ts-chart label="Revenue" size="Wide" [data]="revenue"></ts-chart>
```

Leave the field `undefined` until your request completes to show the loading
skeleton, or use the `async` pipe. A pipe that emits `null` while loading
would show the empty state instead, so map "not yet" to `undefined`:

```html
<ts-metric label="Signups" [data]="(stats$ | async) ?? undefined"></ts-metric>
```

Set `[error]="message"` for the error view. A literal attribute such as
`size="S"` or `label="Signups"` stays an attribute, which is what the tiles
expect.

## Events

Bind with the event's own name in parentheses:

```html
<ts-grid (ts-layout-change)="onLayout($event)" (ts-edit-change)="editing = $event.detail.editing">
  <ts-metric item="signups" label="Signups" size="S" [data]="stats"></ts-metric>
</ts-grid>
```

```ts
import type { TsLayoutChangeDetail } from 'tickslate/elements'

onLayout(event: Event) {
  const { layout } = (event as CustomEvent<TsLayoutChangeDetail>).detail
  this.api.saveLayout(layout)
}
```

Angular types `$event` as `Event` for unknown events, so cast it as above.
Widget actions work the same way: `(ts-action)="onAction($event)"`.

## Saving layouts

```ts
import { AfterViewInit, ElementRef, OnDestroy, ViewChild } from '@angular/core'
import { persistLayout } from 'tickslate/elements'

export class DashboardComponent implements AfterViewInit, OnDestroy {
  @ViewChild('grid') grid!: ElementRef<HTMLElement>
  private saved?: { dispose(): void }

  ngAfterViewInit() {
    this.saved = persistLayout(this.grid.nativeElement as any, { key: 'ops-dashboard' })
  }
  ngOnDestroy() {
    this.saved?.dispose()
  }
}
```

```html
<ts-grid #grid>
  <ts-metric item="signups" label="Signups" size="S" [data]="stats"></ts-metric>
</ts-grid>
```

The `as any` is only because `ElementRef<HTMLElement>` is wider than `TsGrid`;
type the ref as `ElementRef<TsGrid>` (imported from `tickslate/elements`) to
drop it.

Give each tile a stable `item`. With `*ngFor` or `@for`, bind it from your own
id: `[attr.item]="row.id"`, and track by that id.

## Server-side rendering

Angular Universal and `@angular/ssr` can import `tickslate/elements`: with no
DOM it registers nothing. Import it only from code that the browser also runs,
such as `main.ts`, and use `afterNextRender` for `persistLayout` if you prefer it
to run only in the browser.
