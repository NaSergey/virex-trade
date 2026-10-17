import { describe, expect, it } from 'vitest';
import { avatarPlan } from './avatar-image';

describe('avatarPlan', () => {
  it('широкую картинку режет по бокам, по центру', () => {
    expect(avatarPlan(1600, 900)).toEqual({ sx: 350, sy: 0, side: 900 });
  });

  it('высокую — сверху и снизу', () => {
    expect(avatarPlan(600, 1000)).toEqual({ sx: 0, sy: 200, side: 600 });
  });

  it('квадрат берёт целиком', () => {
    expect(avatarPlan(512, 512)).toEqual({ sx: 0, sy: 0, side: 512 });
  });
});
