import { describe, it, expect, beforeEach } from 'vitest';
import { createLeaderboard } from '../src/leaderboard.js';

describe('createLeaderboard', () => {
  let lb;

  beforeEach(() => {
    lb = createLeaderboard();
  });

  describe('addPlayer / removePlayer', () => {
    it('adds a player with score 0', () => {
      lb.addPlayer(0, 'alice', '#f00');
      const scores = lb.getScores();
      expect(scores).toHaveLength(1);
      expect(scores[0]).toMatchObject({ id: 0, name: 'alice', color: '#f00', score: 0 });
    });

    it('removes a player', () => {
      lb.addPlayer(0, 'alice', '#f00');
      lb.removePlayer(0);
      expect(lb.getScores()).toHaveLength(0);
    });
  });

  describe('updateColor', () => {
    it('updates a player color', () => {
      lb.addPlayer(0, 'alice', '#f00');
      lb.updateColor(0, '#0f0');
      expect(lb.getScores()[0].color).toBe('#0f0');
    });

    it('does nothing for unknown player', () => {
      lb.updateColor(99, '#0f0');
      expect(lb.getScores()).toHaveLength(0);
    });
  });

  describe('clear', () => {
    it('removes all players', () => {
      lb.addPlayer(0, 'alice', '#f00');
      lb.addPlayer(1, 'bob', '#0f0');
      lb.clear();
      expect(lb.getScores()).toHaveLength(0);
    });
  });

  describe('recordKill', () => {
    it('increments killer score by 1', () => {
      lb.addPlayer(0, 'alice', '#f00');
      lb.recordKill(0);
      expect(lb.getScores()[0].score).toBe(1);
    });

    it('ignores unknown killer', () => {
      lb.recordKill(99);
      expect(lb.getScores()).toHaveLength(0);
    });
  });

  describe('recordCollision', () => {
    it('decrements both players by 1', () => {
      lb.addPlayer(0, 'alice', '#f00');
      lb.addPlayer(1, 'bob', '#0f0');
      lb.recordCollision(0, 1);
      expect(lb.getScores().find(s => s.id === 0).score).toBe(-1);
      expect(lb.getScores().find(s => s.id === 1).score).toBe(-1);
    });
  });

  describe('setScores', () => {
    it('sets scores from a list', () => {
      lb.addPlayer(0, 'alice', '#f00');
      lb.addPlayer(1, 'bob', '#0f0');
      lb.setScores([{ id: 0, score: 5 }, { id: 1, score: -2 }]);
      expect(lb.getScores().find(s => s.id === 0).score).toBe(5);
      expect(lb.getScores().find(s => s.id === 1).score).toBe(-2);
    });
  });

  describe('getScores sorting', () => {
    it('sorts by score descending', () => {
      lb.addPlayer(0, 'alice', '#f00');
      lb.addPlayer(1, 'bob', '#0f0');
      lb.recordKill(1);
      lb.recordKill(1);
      const scores = lb.getScores();
      expect(scores[0].id).toBe(1);
      expect(scores[1].id).toBe(0);
    });

    it('breaks ties by player id ascending', () => {
      lb.addPlayer(2, 'charlie', '#00f');
      lb.addPlayer(0, 'alice', '#f00');
      lb.addPlayer(1, 'bob', '#0f0');
      const scores = lb.getScores();
      expect(scores.map(s => s.id)).toEqual([0, 1, 2]);
    });

    it('supports negative scores', () => {
      lb.addPlayer(0, 'alice', '#f00');
      lb.addPlayer(1, 'bob', '#0f0');
      lb.recordCollision(0, 1);
      lb.recordCollision(0, 1);
      lb.recordKill(1);
      // alice: -2, bob: -2 + 1 = -1
      const scores = lb.getScores();
      expect(scores[0].id).toBe(1);
      expect(scores[0].score).toBe(-1);
      expect(scores[1].id).toBe(0);
      expect(scores[1].score).toBe(-2);
    });
  });
});
