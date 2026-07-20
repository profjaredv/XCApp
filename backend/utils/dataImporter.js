const mongoose = require('mongoose');
const Race = require('../models/Race');
const Result = require('../models/Result');
const Athlete = require('../models/Athlete');
const { parseDistanceToMeters } = require('./distanceParser');

function parseTime(timeStr) {
  if (!timeStr) return null;

  const parts = timeStr.trim().split(':');
  if (parts.length === 2) {
    const [mins, secs] = parts;
    return parseInt(mins) * 60 + parseFloat(secs);
  } else if (parts.length === 3) {
    const [hours, mins, secs] = parts;
    return parseInt(hours) * 3600 + parseInt(mins) * 60 + parseFloat(secs);
  }

  return parseFloat(timeStr);
}

function parseRaceDate(dateStr) {
  if (!dateStr) return new Date();

  const parts = dateStr.split(',');
  if (parts.length >= 2) {
    const cleanDate = parts.slice(0, 2).join(',').trim();
    return new Date(cleanDate);
  }

  return new Date(dateStr);
}

async function processScrapedData(scrapedResults, teamId, season) {
  const stats = {
    racesImported: 0,
    athletesImported: 0,
    resultsImported: 0
  };

  if (!scrapedResults || scrapedResults.length === 0) {
    return stats;
  }

  const raceMap = new Map();
  const athleteMap = new Map();

  for (const row of scrapedResults) {
    const [raceName, athleteName, gradeStr, gender, timeStr, raceDate, distance] = row;

    const raceKey = `${raceName}|${raceDate}`;
    if (!raceMap.has(raceKey)) {
      const parsedDate = parseRaceDate(raceDate);
      const distanceMeters = parseDistanceToMeters(distance);

      let race = await Race.findOne({
        name: raceName,
        date: parsedDate,
        team: teamId
      });

      if (!race) {
        race = await Race.create({
          name: raceName,
          date: parsedDate,
          distance: distance,
          distanceMeters: distanceMeters,
          season: season,
          team: teamId
        });
        stats.racesImported++;
      }

      raceMap.set(raceKey, race);
    }

    if (!athleteMap.has(athleteName)) {
      let athlete = await Athlete.findOne({
        name: athleteName,
        team: teamId
      });

      if (!athlete) {
        const grade = parseInt(gradeStr) || null;
        const graduationYear = grade ? new Date().getFullYear() + (12 - grade) : null;

        athlete = await Athlete.create({
          name: athleteName,
          team: teamId,
          grade: grade,
          graduationYear: graduationYear,
          gender: gender
        });
        stats.athletesImported++;
      }

      athleteMap.set(athleteName, athlete);
    }

    const race = raceMap.get(raceKey);
    const athlete = athleteMap.get(athleteName);
    const timeSeconds = parseTime(timeStr);

    if (race && athlete && timeSeconds) {
      const existingResult = await Result.findOne({
        athlete: athlete._id,
        race: race._id
      });

      if (!existingResult) {
        await Result.create({
          athlete: athlete._id,
          race: race._id,
          team: teamId,
          time: timeSeconds,
          grade: parseInt(gradeStr) || null
        });
        stats.resultsImported++;
      }
    }
  }

  return stats;
}

module.exports = { processScrapedData };
