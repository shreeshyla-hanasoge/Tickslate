# Server templates

On a page rendered by Blade, Django, Rails or plain HTML there is no
JavaScript to hand the widget an object. Put it in the `data` attribute as
JSON instead.

```html
<ts-metric label="Signups" data='{"value": 1204, "previous": 1075, "compareLabel": "vs last week"}'></ts-metric>
```

## How the attribute is read

- A value that starts with `{` or `[` is parsed with `JSON.parse`. Anything
  else is ignored.
- **The property wins once set.** If a script later assigns `el.data = …`, the
  attribute is ignored from then on, so you can server-render the first paint
  and update live.
- A parse failure shows the tile's error view, and development builds warn once
  with the parser's message and position.
- A value that reads `[object Object]` means a framework turned an object into
  a string; set the property instead.

Always let the template engine escape the attribute (use double quotes around
it and the engine's normal escaping). A browser decodes `&quot;` before the
JSON is parsed, so escaped JSON is the safe form, and unescaped data can break
out of the attribute.

## Blade (Laravel)

Encode in PHP and print with `{{ }}`, which escapes quotes and angle brackets:

```blade
<ts-grid>
  <ts-metric
    item="signups"
    label="Signups"
    size="S"
    data="{{ json_encode(['value' => $signups, 'previous' => $lastWeek, 'compareLabel' => 'vs last week']) }}"
  ></ts-metric>

  <ts-chart
    item="revenue"
    label="Revenue"
    size="Wide"
    data="{{ json_encode(['rows' => $revenueRows, 'x' => 'date', 'y' => ['revenue', 'cost'], 'format' => 'money']) }}"
  ></ts-chart>
</ts-grid>
```

Laravel serialises decimal columns as strings and dates as ISO strings ending
in `Z`; both are read correctly. Use `@json($data)` only inside a script block
or a single-quoted attribute you have checked yourself, because it does not
escape a quote.

## Django

Build the JSON in the view and let autoescaping do its job:

```python
# views.py
import json

def dashboard(request):
    stats = {"value": 1204, "previous": 1075, "compareLabel": "vs last week"}
    return render(request, "dashboard.html", {"signups_json": json.dumps(stats)})
```

```django
<ts-grid>
  <ts-metric item="signups" label="Signups" size="S" data="{{ signups_json }}"></ts-metric>
</ts-grid>
```

Do not add `|safe`: it turns the escaping off. For several widgets, build one
dict per widget in the view. Django's `DjangoJSONEncoder` handles `Decimal` and
`datetime` values (`json.dumps(stats, cls=DjangoJSONEncoder)`).

## Updating live after the first paint

```html
<script type="module">
  import 'tickslate/elements'

  const source = new EventSource('/stream/signups')
  source.onmessage = (e) => {
    document.querySelector('ts-metric[item="signups"]').data = JSON.parse(e.data)
  }
</script>
```

## Layouts on the server

To keep layouts per user rather than per browser, render the saved layout into
the page and pass it to the grid, then save changes from the event. See
[saving layouts](saving-layouts.md).

```html
<ts-grid id="board" data-layout="{{ layout_json }}">…</ts-grid>
<script type="module">
  import 'tickslate/elements'
  const board = document.getElementById('board')
  board.layout = JSON.parse(board.dataset.layout)
  board.addEventListener('ts-layout-change', (e) => {
    fetch('/api/layout', { method: 'PUT', body: JSON.stringify(e.detail.layout) })
  })
</script>
```
