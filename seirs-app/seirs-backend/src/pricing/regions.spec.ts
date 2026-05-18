import { detectStateFromCoords, areStatesAdjacent, getStateZone } from './regions';

describe('Nigerian region taxonomy', () => {
  describe('detectStateFromCoords', () => {
    it('detects Lagos (Victoria Island)', () => {
      expect(detectStateFromCoords(6.4281, 3.4219)).toBe('LA');
    });
    it('detects Abuja / FCT', () => {
      expect(detectStateFromCoords(9.0765, 7.3986)).toBe('FC');
    });
    it('detects Port Harcourt as Rivers', () => {
      expect(detectStateFromCoords(4.8156, 7.0498)).toBe('RI');
    });
    it('detects Kano', () => {
      expect(detectStateFromCoords(12.0022, 8.5919)).toBe('KN');
    });
    it('detects Maiduguri as Borno', () => {
      expect(detectStateFromCoords(11.8333, 13.15)).toBe('BO');
    });
    it('returns null for coords outside Nigeria', () => {
      expect(detectStateFromCoords(-1.286, 36.817)).toBeNull();    // Nairobi
      expect(detectStateFromCoords(51.5, -0.13)).toBeNull();       // London
    });
  });

  describe('areStatesAdjacent', () => {
    it('Lagos and Ogun are adjacent', () => {
      expect(areStatesAdjacent('LA', 'OG')).toBe(true);
      expect(areStatesAdjacent('OG', 'LA')).toBe(true);   // symmetric
    });
    it('Lagos and Kano are NOT adjacent', () => {
      expect(areStatesAdjacent('LA', 'KN')).toBe(false);
    });
    it('Kano and Kaduna are adjacent', () => {
      expect(areStatesAdjacent('KN', 'KD')).toBe(true);
    });
    it('Rivers and Abia are adjacent', () => {
      expect(areStatesAdjacent('RI', 'AB')).toBe(true);
    });
    it('a state is not adjacent to itself', () => {
      expect(areStatesAdjacent('LA', 'LA')).toBe(false);
    });
    it('handles nulls gracefully', () => {
      expect(areStatesAdjacent(null, 'LA')).toBe(false);
      expect(areStatesAdjacent('LA', null)).toBe(false);
    });
  });

  describe('getStateZone', () => {
    it('Lagos → SW', () => expect(getStateZone('LA')).toBe('SW'));
    it('Kano → NW',  () => expect(getStateZone('KN')).toBe('NW'));
    it('FCT → NC',   () => expect(getStateZone('FC')).toBe('NC'));
    it('Rivers → SS',() => expect(getStateZone('RI')).toBe('SS'));
    it('Borno → NE', () => expect(getStateZone('BO')).toBe('NE'));
    it('Enugu → SE', () => expect(getStateZone('EN')).toBe('SE'));
    it('null returns null', () => expect(getStateZone(null)).toBeNull());
  });
});
