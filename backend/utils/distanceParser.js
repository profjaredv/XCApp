const MILE_IN_METERS = 1609.34;
const KILOMETER_IN_METERS = 1000;

function parseDistanceToMeters(distanceStr) {
    if (!distanceStr || typeof distanceStr !== 'string') {
        return null;
    }

    const lowerCaseDistance = distanceStr.toLowerCase();
    // Matches numbers, including decimals
    const valueMatch = lowerCaseDistance.match(/[\d.]+/);
    if (!valueMatch) {
        return null;
    }

    const value = parseFloat(valueMatch[0]);

    if (lowerCaseDistance.includes('mile')) {
        return value * MILE_IN_METERS;
    } else if (lowerCaseDistance.includes('k') || lowerCaseDistance.includes('kilometer')) {
        return value * KILOMETER_IN_METERS;
    } else if (lowerCaseDistance.includes('meter')) {
        return value;
    }

    // Fallback for cases where unit is not specified but might be implied (e.g., '5000')
    // This is a guess and might need refinement.
    if (value >= 1000) { // Assume meters if a large number without units
        return value;
    }

    return null;
}

module.exports = { parseDistanceToMeters };
