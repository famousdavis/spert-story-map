// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom

/**
 * N4 (FRAME26, v0.57.0): the storage pill is the frame's account chip, `.sf-chip`, in all three of its states: signed
 * out ("Local only" · "Sign in"), signed in with Local storage, and signed in with Cloud storage. Its two segments are
 * the frame's state (muted) and act (link colour); the accessible names are v0.56.5's, unchanged; every click opens the
 * app's Settings dialog. The avatar keeps #0070f3 with a white initial (4.55 : 1) and is 22 px, to fit the 30 px chip.
 * The colours' contrast is pinned against the vendored tokens in `frameStage0Contrast.test.tsx`.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import StorageStatusPill from '../components/ui/StorageStatusPill';
import { req } from './testHelpers';

const state = vi.hoisted(() => ({ user: null as null | { displayName: string; email: string }, mode: 'local' }));
vi.mock('../lib/AuthProvider', () => ({ useAuth: () => ({ user: state.user, firebaseAvailable: true }) }));
vi.mock('../lib/StorageProvider', () => ({ useStorage: () => ({ mode: state.mode }) }));

afterEach(() => {
  cleanup();
  state.user = null;
  state.mode = 'local';
});

function chip(onClick = () => {}) {
  render(<StorageStatusPill onClick={onClick} />);
  const el = req(document.querySelector<HTMLElement>('[data-sf="chip"]'), 'the chip');
  const seg = (cls: string) => req(el.querySelector<HTMLElement>(`:scope > .${cls}`), cls);
  return { el, state: seg('sf-chip-state'), act: seg('sf-chip-act') };
}

const ANA = { displayName: 'Ana Lima', email: 'ana@example.com' };

describe('the account chip (contract §3, §7)', () => {
  it('signed out: "Local only" with the lock in the state segment, "Sign in" in the act segment; named "Sign in"', () => {
    const c = chip();
    expect(c.el.tagName).toBe('BUTTON');
    expect(c.el.getAttribute('type')).toBe('button');
    expect(c.el.className).toBe('sf-chip');
    expect(c.el.getAttribute('aria-label')).toBe('Sign in');
    expect(c.state.textContent).toBe('Local only');
    expect(c.state.querySelector('svg')).toBeTruthy();
    expect(c.act.textContent).toBe('Sign in');
    expect(c.el.children).toHaveLength(2);
  });

  it('signed in with Local storage: the avatar and first name, then the lock; named as before', () => {
    state.user = ANA;
    const c = chip();
    expect(c.el.getAttribute('aria-label')).toBe('Signed in as Ana — local storage — click to open Cloud Storage settings');
    expect(c.state.textContent).toBe('AAna');
    const lock = req(c.act.querySelector('svg'), 'the lock');
    expect(lock.querySelector('rect')).toBeTruthy();
    expect(lock.getAttribute('class')).toBe('text-[color:var(--sf-text-muted)]');
  });

  it('signed in with Cloud storage: the avatar and first name, then the cloud in currentColor; named as before', () => {
    state.user = ANA;
    state.mode = 'cloud';
    const c = chip();
    expect(c.el.getAttribute('aria-label')).toBe('Signed in as Ana — cloud storage — click to open Cloud Storage settings');
    const cloud = req(c.act.querySelector('svg path'), 'the cloud');
    expect(cloud.getAttribute('fill')).toBe('currentColor');
    expect(c.act.querySelector('rect')).toBeNull();
  });

  it('the avatar is 22 px, #0070f3 with a white initial: the only inline colour in the chip', () => {
    state.user = ANA;
    const c = chip();
    const styled = Array.from(c.el.querySelectorAll<HTMLElement>('[style]'));
    expect(styled).toHaveLength(1);
    const avatar = req(styled[0], 'avatar');
    expect([avatar.style.width, avatar.style.height]).toEqual(['22px', '22px']);
    expect(avatar.style.backgroundColor).toBe('rgb(0, 112, 243)');
    expect(avatar.className).toContain('text-white');
    expect(avatar.textContent).toBe('A');
  });

  it('every state opens the app\'s Settings dialog on click', () => {
    for (const [user, mode] of [[null, 'local'], [ANA, 'local'], [ANA, 'cloud']] as const) {
      state.user = user;
      state.mode = mode;
      const open = vi.fn();
      fireEvent.click(chip(open).el);
      expect(open).toHaveBeenCalledTimes(1);
      cleanup();
    }
  });
});
