// Create, inspect and delete the demo team. Super-admin only (the routes
// enforce that); this module adds its own guards so it can only ever remove
// the demo team: the fixed demo athleticTeamId, whose staff all use the
// reserved .invalid email domain.

const { generateDemoPlan } = require('./generate');
const { writeDemoPlan } = require('./write');
const { TEAM, DEMO_EMAIL_DOMAIN } = require('./catalog');
const calculationService = require('../../services/performance/calculationService');

const job = { state: 'idle', step: null, startedAt: null, finishedAt: null, error: null, rows: 0, seasonsDone: 0, seasonsTotal: 0 };

const snapshot = () => ({ ...job });

async function findDemoTeam(prisma) {
  return prisma.team.findUnique({
    where: { athleticTeamId: TEAM.athleticTeamId },
    select: { id: true, name: true, slug: true, athleticTeamId: true, currentSeason: true, coachUid: true, createdAt: true },
  });
}

/** Is this really the demo team? Name, ID and the coach's reserved email must all agree. */
async function isDemoTeam(prisma, team) {
  if (!team || team.athleticTeamId !== TEAM.athleticTeamId) return false;
  const coach = team.coachUid ? await prisma.user.findUnique({ where: { id: team.coachUid }, select: { email: true } }) : null;
  return !!coach && coach.email.endsWith(`@${DEMO_EMAIL_DOMAIN}`);
}

async function demoStatus(prisma) {
  const team = await findDemoTeam(prisma);
  if (!team || !(await isDemoTeam(prisma, team))) return { exists: false, job: snapshot() };
  const [athletes, seasons, races, results] = await Promise.all([
    prisma.athlete.count({ where: { teamId: team.id } }),
    prisma.season.count({ where: { teamId: team.id } }),
    prisma.race.count({ where: { teamId: team.id } }),
    prisma.result.count({ where: { teamId: team.id } }),
  ]);
  return { exists: true, team, counts: { athletes, seasons, races, results }, job: snapshot() };
}

async function deleteDemoTeam(prisma) {
  const team = await findDemoTeam(prisma);
  if (!team) return { deleted: false };
  if (!(await isDemoTeam(prisma, team))) throw new Error('Refusing to delete: that team is not the demo team.');
  // Team deletes cascade to every row that belongs to it. Then the invented
  // users (staff, athlete accounts), which only ever carry the reserved domain.
  await prisma.team.delete({ where: { id: team.id } });
  await prisma.teamRequest.deleteMany({ where: { OR: [{ wantsTeamId: team.id }, { email: { endsWith: `@${DEMO_EMAIL_DOMAIN}` } }] } });
  const removed = await prisma.user.deleteMany({ where: { email: { endsWith: `@${DEMO_EMAIL_DOMAIN}` } } });
  return { deleted: true, users: removed.count };
}

/** Delete any old demo team, generate a fresh plan, write it, and calculate every season's metrics. */
async function createDemoTeam(prisma, { now = new Date(), seed, adminUserId } = {}) {
  if (job.state === 'running') throw new Error('The demo team is already being built.');
  Object.assign(job, { state: 'running', step: 'Clearing the old demo team', startedAt: new Date().toISOString(), finishedAt: null, error: null, rows: 0, seasonsDone: 0, seasonsTotal: 0 });
  try {
    await deleteDemoTeam(prisma);
    job.step = 'Generating eight seasons';
    const plan = generateDemoPlan({ now, seed });
    job.seasonsTotal = plan.seasons.length;
    job.step = 'Writing the data';
    const { teamId, counts } = await writeDemoPlan(prisma, plan, {
      adminUserId,
      progress: (label, n) => {
        job.rows += n;
        job.step = `Writing ${label}`;
      },
    });
    for (const s of plan.seasons) {
      job.step = `Calculating ${s.year} analytics`;
      await calculationService.calculateAllMetrics(teamId, s.year, true);
      job.seasonsDone += 1;
    }
    Object.assign(job, { state: 'done', step: 'Done', finishedAt: new Date().toISOString() });
    return { teamId, counts };
  } catch (error) {
    Object.assign(job, { state: 'error', error: error.message, finishedAt: new Date().toISOString() });
    throw error;
  }
}

module.exports = { createDemoTeam, deleteDemoTeam, demoStatus, findDemoTeam, isDemoTeam, jobSnapshot: snapshot };
