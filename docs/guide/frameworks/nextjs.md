# Tickslate in Next.js

Next.js renders on the server first, and custom elements only exist in the
browser. So: load the elements from a client component, load the stylesheet
from the root layout, and set `data` as a property from an effect. Read
[server-side rendering](../ssr.md) first for why.

This recipe is written for the App Router with React 19. For React 18, or the
Pages Router, see the notes at the end and the [React recipe](react.md).

## Set up

```bash
npm install tickslate
```

Load the theme tokens in the root layout, which is a server component and
renders into the HTML `<head>`. The pre-upgrade rules in this file keep each
tile's space reserved until the elements load:

```tsx
// app/layout.tsx
import 'tickslate/tokens.css'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
```

## A client component

Register the elements and set the data from a `'use client'` module. The
import registers on the client only, and a server render of this component
just emits the tags:

```tsx
// app/dashboard.tsx
'use client'
import 'tickslate/elements'
import type {} from 'tickslate/jsx' // types every ts-* tag in JSX
import type { MetricData } from 'tickslate/elements'

export function Dashboard({ signups }: { signups: MetricData | undefined }) {
  return (
    <ts-grid persist="ops-dashboard">
      <ts-metric item="signups" label="Signups" size="S" data={signups} />
      <ts-card item="notes" label="Notes" sizes="S Wide M">
        <p>Deploy freeze from Friday.</p>
      </ts-card>
    </ts-grid>
  )
}
```

```tsx
// app/page.tsx (server component)
import { Dashboard } from './dashboard'

export default function Page() {
  return <Dashboard signups={undefined} />
}
```

A `'use client'` component is still rendered once on the server. That is fine
here: the tags are emitted, `data` is left alone (objects are not serialised
into HTML for a custom element), and the browser assigns it after hydration.
With `data={undefined}` a tile shows its loading skeleton once upgraded.

## Fetching the data

Fetch on the server and pass the result in as a prop when you can; a server
component can do the fetch and hand a plain object to the client component:

```tsx
// app/page.tsx
import { Dashboard } from './dashboard'

export default async function Page() {
  const signups = await getSignups() // your own function
  return <Dashboard signups={signups} />
}
```

The object crosses to the client as serialised props, then React 19 assigns it
to the element's `data` property. No JSON attribute is involved.

## Loading the elements late

To keep Tickslate out of the first bundle, import it in an effect or load the
component dynamically with the server turned off:

```tsx
// app/dashboard-lazy.tsx
'use client'
import dynamic from 'next/dynamic'

export const Dashboard = dynamic(() => import('./dashboard').then((m) => m.Dashboard), { ssr: false })
```

With `ssr: false` the server emits nothing for the dashboard, so reserve its
space yourself (a fixed-height wrapper). If the elements register after React
renders, bind object props with a ref and assignment instead of JSX props, or
React will write them as attributes first; the [React recipe](react.md) shows
the hook.

## Events and layouts

Use a ref and `addEventListener` for `ts-action` and `ts-layout-change`, or
React 19's `onts-action={…}` form; both are shown in the [React recipe](react.md).
`persist="…"` and `persistLayout` read `localStorage`, so they run only in the
browser, inside the client component.

## React 18 and the Pages Router

React 18 writes every prop to a custom element as an attribute, which turns an
object into `"[object Object]"`. Set `data` from an effect on a ref, as in the
[React recipe](react.md). In the Pages Router import `tickslate/tokens.css`
from `pages/_app.tsx` (the only place global CSS may be imported) and import
`tickslate/elements` from a component, or from `_app.tsx`: both are safe,
because importing on the server registers nothing.
