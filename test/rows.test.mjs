import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { createRows, setText } from '../src/elements/rows.js'
import { MiniDoc } from './mini-dom.mjs'

// Keyed rows (RFC 0003 §16): rows are matched by id, and a change writes only
// what changed. Every write goes through mini-dom's log, so "one write" is
// counted, not assumed.

function setup() {
  const doc = new MiniDoc()
  const body = doc.createElement('tbody')
  const created = []
  const rows = createRows(body, {
    create(row) {
      created.push(row.id)
      const tr = doc.createElement('tr')
      tr.setAttribute('data-id', String(row.id))
      tr.appendChild(doc.createElement('td'))
      tr.appendChild(doc.createElement('td'))
      return tr
    },
    update(tr, row) {
      setText(tr.children[0], row.name)
      setText(tr.children[1], row.value)
    },
  })
  const ids = () => body.children.map((tr) => tr.getAttribute('data-id'))
  return { doc, body, rows, created, ids }
}

const r = (id, name = `Row ${id}`, value = '1') => ({ id, name, value })
const writes = (log, kind) => log.filter((l) => l.startsWith(kind))

describe('setText', () => {
  test('writes only when the text differs, and says whether it did', () => {
    const doc = new MiniDoc()
    const node = doc.createElement('span')
    assert.equal(setText(node, 'a'), true)
    assert.equal(setText(node, 'a'), false)
    assert.equal(setText(node, 'b'), true)
    assert.equal(node.textContent, 'b')
    assert.equal(writes(doc.take(), 'text').length, 2)
  })
})

describe('sync', () => {
  test('the first sync creates each row once, in order', () => {
    const { rows, created, ids } = setup()
    rows.sync([r('a'), r('b'), r('c')])
    assert.deepEqual(ids(), ['a', 'b', 'c'])
    assert.deepEqual(created, ['a', 'b', 'c'])
  })

  test('changing one cell is one write, and no row is created, moved or removed', () => {
    const { doc, rows, created } = setup()
    rows.sync([r('a'), r('b', 'Row b', '1'), r('c')])
    doc.take()
    rows.sync([r('a'), r('b', 'Row b', '2'), r('c')])
    assert.deepEqual(doc.take(), ['text td "2"'])
    assert.deepEqual(created, ['a', 'b', 'c'])
  })

  test('the same data again writes nothing at all', () => {
    const { doc, rows } = setup()
    const data = () => [r('a'), r('b'), r('c')]
    rows.sync(data())
    doc.take()
    rows.sync(data())
    assert.deepEqual(doc.take(), [])
  })

  test('a new row is inserted without touching the others', () => {
    const { doc, rows, ids } = setup()
    rows.sync([r('a'), r('c')])
    doc.take()
    rows.sync([r('a'), r('b'), r('c')])
    assert.deepEqual(ids(), ['a', 'b', 'c'])
    // The new row's own cells and text, then its place in the body: nothing of a or c.
    assert.deepEqual(doc.take(), ['attr tr data-id=b', 'insert td', 'insert td', 'text td "Row b"', 'text td "1"', 'insert b'])
  })

  test('a departed row is removed and the rest stay', () => {
    const { doc, rows, ids } = setup()
    rows.sync([r('a'), r('b'), r('c')])
    doc.take()
    rows.sync([r('a'), r('c')])
    assert.deepEqual(ids(), ['a', 'c'])
    assert.deepEqual(doc.take(), ['remove b'])
  })

  test('a row that comes back is created again, as a new row', () => {
    const { rows, created } = setup()
    rows.sync([r('a'), r('b')])
    rows.sync([r('a')])
    rows.sync([r('a'), r('b')])
    assert.deepEqual(created, ['a', 'b', 'b'])
  })

  test('moving one row to the front moves only that row', () => {
    const { doc, rows, ids } = setup()
    rows.sync([r('a'), r('b'), r('c'), r('d'), r('e')])
    doc.take()
    rows.sync([r('e'), r('a'), r('b'), r('c'), r('d')])
    assert.deepEqual(ids(), ['e', 'a', 'b', 'c', 'd'])
    assert.deepEqual(doc.take(), ['insert e'])
  })

  test('moving one row to the end moves only that row', () => {
    const { doc, rows, ids } = setup()
    rows.sync([r('a'), r('b'), r('c'), r('d')])
    doc.take()
    rows.sync([r('b'), r('c'), r('d'), r('a')])
    assert.deepEqual(ids(), ['b', 'c', 'd', 'a'])
    assert.deepEqual(doc.take(), ['insert a'])
  })

  test('a reversal gives the right order whatever it moves', () => {
    const { rows, ids } = setup()
    const order = ['a', 'b', 'c', 'd', 'e', 'f']
    rows.sync(order.map((id) => r(id)))
    rows.sync([...order].reverse().map((id) => r(id)))
    assert.deepEqual(ids(), [...order].reverse())
  })

  test('a mix of inserts, removals and moves ends in the order asked for', () => {
    const { rows, ids } = setup()
    rows.sync(['a', 'b', 'c', 'd', 'e'].map((id) => r(id)))
    rows.sync(['e', 'x', 'b', 'y', 'a'].map((id) => r(id)))
    assert.deepEqual(ids(), ['e', 'x', 'b', 'y', 'a'])
    rows.sync([])
    assert.deepEqual(ids(), [])
  })

  test('every shuffle of six rows ends in the order asked for', () => {
    const { rows, ids } = setup()
    const perms = (xs) => (xs.length <= 1 ? [xs] : xs.flatMap((x, i) => perms([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p])))
    rows.sync(['a', 'b', 'c', 'd', 'e', 'f'].map((id) => r(id)))
    for (const p of perms(['a', 'b', 'c', 'd']).slice(0, 24)) {
      rows.sync([...p, 'e', 'f'].map((id) => r(id)))
      assert.deepEqual(ids(), [...p, 'e', 'f'])
    }
  })

  test('a number id and its string are different rows', () => {
    const { rows, ids, created } = setup()
    rows.sync([r(1), r('1')])
    assert.equal(ids().length, 2)
    assert.deepEqual(created, [1, '1'])
  })

  test('a repeated id in one sync is skipped, the first wins', () => {
    const { rows, ids, body } = setup()
    rows.sync([r('a', 'first'), r('a', 'second'), r('b')])
    assert.deepEqual(ids(), ['a', 'b'])
    assert.equal(body.children[0].children[0].textContent, 'first')
  })

  test('update is told the row it last showed, and undefined for a new element', () => {
    const doc = new MiniDoc()
    const body = doc.createElement('tbody')
    const seen = []
    const rows = createRows(body, { create: () => doc.createElement('tr'), update: (el, row, prev) => seen.push([row.v, prev && prev.v]) })
    rows.sync([{ id: 1, v: 'x' }])
    rows.sync([{ id: 1, v: 'y' }])
    assert.deepEqual(seen, [['x', undefined], ['y', 'x']])
  })
})

describe('focus', () => {
  test('a focused row that has to move keeps its focus', () => {
    const { doc, rows, body } = setup()
    rows.sync(['a', 'b', 'c'].map((id) => r(id)))
    const b = body.children[1]
    b.focus()
    // b goes to the end; moving it would drop focus in a browser.
    rows.sync(['a', 'c', 'b'].map((id) => r(id)))
    assert.equal(doc.activeElement, b)
  })

  test('a focused row that stays is not moved at all', () => {
    const { doc, rows, body } = setup()
    rows.sync(['a', 'b', 'c', 'd'].map((id) => r(id)))
    const b = body.children[1]
    b.focus()
    doc.take()
    rows.sync(['b', 'c', 'd', 'a'].map((id) => r(id)))
    assert.equal(doc.activeElement, b)
    assert.deepEqual(doc.take(), ['insert a'])
  })

  test('a removed row takes its focus with it, and nothing else is focused instead', () => {
    const { doc, rows, body } = setup()
    rows.sync(['a', 'b'].map((id) => r(id)))
    body.children[0].focus()
    rows.sync([r('b')])
    assert.notEqual(doc.activeElement, null)
    assert.equal(body.children.length, 1)
  })
})

describe('a live table', () => {
  test('500 rows ticking one cell write one cell and move nothing', () => {
    const { doc, rows } = setup()
    const data = (tick) => Array.from({ length: 500 }, (_, i) => r(`o${i}`, `Order ${i}`, i === 250 ? String(tick) : '0'))
    rows.sync(data(0))
    for (let tick = 1; tick <= 5; tick++) {
      doc.take()
      rows.sync(data(tick))
      assert.deepEqual(doc.take(), ['text td "' + tick + '"'])
    }
  })
})
