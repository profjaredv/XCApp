import { sportOfLocation, type Sport } from './sport';

// The three parts of a day's plan. Cross country calls them by the run;
// track has throwers and jumpers who don't run it, so there they are the
// warm-up, the main session and the cool-down. Same three fields either way.
export function practicePlanLabels(sport: Sport = sportOfLocation()): { pre: string; main: string; post: string; mainPlaceholder: string } {
  return sport === 'TRACK'
    ? { pre: 'Warm-up', main: 'Main session', post: 'Cool-down', mainPlaceholder: 'Block starts, tempo 200s, technique day…' }
    : { pre: 'Pre Run', main: 'Run', post: 'Post Run', mainPlaceholder: 'Tempo, Long Run, Dis/Steady…' };
}
