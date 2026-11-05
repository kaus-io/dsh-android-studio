import test from 'node:test';
import assert from 'node:assert/strict';
import { MENU_INITIAL, menuReducer } from './ui-model.js';

const at = type => menuReducer(MENU_INITIAL, { type });

test('a menu starts closed, unpinned and unfocused', () => {
  assert.deepEqual(MENU_INITIAL, { open: false, pinned: false, focusWithin: false, pending: null });
});

test('pointer enter and leave never open a menu', () => {
  const closed = { ...MENU_INITIAL };
  assert.equal(menuReducer(closed, { type: 'enter' }), closed);
  assert.equal(menuReducer(closed, { type: 'leave' }), closed);
  const open = menuReducer(MENU_INITIAL, { type: 'click' });
  assert.equal(menuReducer(open, { type: 'leave' }).open, true, 'hovering away must not close a clicked menu');
});

test('a delayed open/close event is inert', () => {
  const closed = { ...MENU_INITIAL };
  assert.equal(menuReducer(closed, { type: 'open-delay' }), closed);
  assert.equal(menuReducer(closed, { type: 'close-delay' }), closed);
});

test('click opens and pins, a second click closes', () => {
  const open = at('click');
  assert.equal(open.open, true);
  assert.equal(open.pinned, true);
  assert.deepEqual(menuReducer(open, { type: 'click' }), { ...MENU_INITIAL });
});

test('keyboard opens and pins without a pointer', () => {
  const open = at('keyboard');
  assert.equal(open.open, true);
  assert.equal(open.pinned, true);
});

test('escape, outside click, blur, choose and disable all reset the menu', () => {
  const open = at('click');
  for (const type of ['escape', 'outside', 'blur', 'choose', 'disable']) assert.deepEqual(menuReducer(open, { type }), { ...MENU_INITIAL }, type);
});

test('focus does not open a menu by itself', () => {
  const focused = menuReducer(MENU_INITIAL, { type: 'focus' });
  assert.equal(focused.open, false);
  assert.equal(focused.focusWithin, true);
});

test('unknown events return the exact same state and never mutate inputs', () => {
  const closed = Object.freeze({ ...MENU_INITIAL });
  const event = Object.freeze({ type: 'nonsense' });
  assert.equal(menuReducer(closed, event), closed);
  for (const type of ['click', 'keyboard', 'escape', 'focus', 'enter']) menuReducer(closed, Object.freeze({ type }));
});
