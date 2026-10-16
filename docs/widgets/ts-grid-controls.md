# `<ts-grid-controls>`

The controls a grid's host would otherwise build: a switcher for layouts that
change on a schedule, and the link that lets the edit pill open a widget picker.

```js
import 'tickslate/elements/controls'
```

```html
<ts-grid id="dashboard"></ts-grid>
<ts-widget-picker for="dashboard"></ts-widget-picker>
<ts-grid-controls for="dashboard"></ts-grid-controls>
```

## The profile switcher

It appears only when the grid has a `schedule`; otherwise the element renders
nothing. It reads **Auto**, **Market hours** and **After close** (three buttons
with `aria-pressed`), and under them the next switch, such as "Switches to
After close at 15:35", written in the grid's `locale`, `time-zone` and
`hour-cycle`. A change that falls on another day names the day.

- **Auto** calls `grid.override(null)`: the schedule decides.
- **Market hours** and **After close** call `grid.override('market')` and
  `grid.override('closed')`, until the schedule next changes.

The `profile` attribute, if the host sets it, still beats an override.

## Linking a picker

While a picker is linked the controls set `grid.openPicker`, and the grid's edit
pill shows **Add** (which opens the picker) in place of **Add back (n)**. The
picker is the `picker` id when given, else the `<ts-widget-picker>` whose `for`
is the same grid. Remove the picker or the controls and the pill goes back to
Add back.

## Attributes and properties

| Member | Type | What it does |
|---|---|---|
| `for` | `string` | The id of the `<ts-grid>` it controls. Reflects the `for` attribute |
| `picker` | `string \| null` | The id of a `<ts-widget-picker>` to link. Default: the one whose `for` is the same grid. Reflects the `picker` attribute |

## Parts

| Part | Element |
|---|---|
| `switcher` | The group of three buttons |
| `option` | Each button |
| `next` | The next-switch line |

## Accessibility

The switcher is a labelled group of buttons whose pressed state is
`aria-pressed`, so the choice is not colour alone. Targets are at least 44px,
focus rings are `--ts-focus` outlines that survive forced colours, and every
string is a message (`controls.*`).
