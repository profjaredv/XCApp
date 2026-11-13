// Event groups: how a track program is actually organised and coached.
// Finer than the catalog's categories in one place (pole vault is its own
// group, with its own coach and pit, not just another jump) and otherwise
// the same.

export interface EventGroup {
  key: string;
  label: string;
}

export const EVENT_GROUPS: EventGroup[] = [
  { key: 'SPRINT', label: 'Sprints' },
  { key: 'HURDLES', label: 'Hurdles' },
  { key: 'MIDDLE_DISTANCE', label: 'Mid-distance' },
  { key: 'DISTANCE', label: 'Distance' },
  { key: 'RELAY', label: 'Relays' },
  { key: 'JUMP', label: 'Jumps' },
  { key: 'VAULT', label: 'Vault' },
  { key: 'THROW', label: 'Throws' },
  { key: 'MULTI', label: 'Multis' },
];

export function eventGroupOf(event: { name: string; category: string }): string {
  return event.name === 'Pole Vault' ? 'VAULT' : event.category;
}
