// Names for the demo team. All invented. The staff and a handful of athletes
// have deliberately silly names so the demo is obviously not a real program.

const STAFF = [
  { key: 'ron', name: 'Ron McDonald', role: 'HEAD_COACH', title: 'Head coach' },
  { key: 'patty', name: 'Patty Melt', role: 'COACH', title: 'Girls distance' },
  { key: 'barb', name: 'Barb Dwyer', role: 'COACH', title: 'Boys distance' },
  { key: 'al', name: 'Al Dente', role: 'VOLUNTEER_COACH', title: 'Novice group' },
  { key: 'kay', name: 'Kay Sera', role: 'VOLUNTEER_COACH', title: 'Parent volunteer' },
];

const BOYS_FIRST = [
  'Liam', 'Noah', 'Mason', 'Ethan', 'Logan', 'Lucas', 'Jackson', 'Aiden', 'Caleb', 'Owen', 'Ryan', 'Nathan',
  'Isaac', 'Gavin', 'Eli', 'Wyatt', 'Carter', 'Hunter', 'Dylan', 'Jaxon', 'Landon', 'Easton', 'Cooper', 'Brody',
  'Tyler', 'Austin', 'Miles', 'Jonah', 'Micah', 'Xavier', 'Diego', 'Mateo', 'Santiago', 'Ezra', 'Silas', 'Theo',
  'Declan', 'Finn', 'Rowan', 'Griffin', 'Tristan', 'Bennett', 'Kai', 'Colton', 'Brayden', 'Parker', 'Reid', 'Sawyer',
];
const GIRLS_FIRST = [
  'Emma', 'Olivia', 'Ava', 'Sophia', 'Isabella', 'Mia', 'Amelia', 'Harper', 'Evelyn', 'Abigail', 'Ella', 'Chloe',
  'Lily', 'Grace', 'Zoe', 'Nora', 'Hannah', 'Layla', 'Riley', 'Aubrey', 'Brooklyn', 'Savannah', 'Maya', 'Elena',
  'Naomi', 'Violet', 'Claire', 'Lucy', 'Stella', 'Hazel', 'Ruby', 'Piper', 'Sadie', 'Tessa', 'Maren', 'Josie',
  'Camila', 'Valentina', 'Lucia', 'Adriana', 'Mackenzie', 'Delaney', 'Jordyn', 'Kennedy', 'Skylar', 'Paisley', 'Quinn', 'Tatum',
];
const LAST = [
  'Anderson', 'Baker', 'Bennett', 'Brooks', 'Campbell', 'Carter', 'Chavez', 'Cooper', 'Cruz', 'Davis', 'Diaz', 'Edwards',
  'Evans', 'Flores', 'Foster', 'Garcia', 'Gonzalez', 'Gray', 'Green', 'Hall', 'Harris', 'Hayes', 'Hernandez', 'Howard',
  'Hughes', 'Jackson', 'James', 'Jenkins', 'Johnson', 'Jones', 'Kelly', 'Kim', 'King', 'Lee', 'Lopez', 'Martin',
  'Martinez', 'Miller', 'Mitchell', 'Moore', 'Morales', 'Morgan', 'Murphy', 'Myers', 'Nguyen', 'Nelson', 'Ortiz', 'Parker',
  'Patel', 'Perez', 'Peterson', 'Phillips', 'Powell', 'Price', 'Ramirez', 'Reed', 'Reyes', 'Richardson', 'Rivera', 'Roberts',
  'Robinson', 'Rodriguez', 'Rogers', 'Ross', 'Sanchez', 'Sanders', 'Scott', 'Smith', 'Stewart', 'Sullivan', 'Taylor', 'Thomas',
  'Thompson', 'Torres', 'Turner', 'Walker', 'Ward', 'Watson', 'White', 'Williams', 'Wilson', 'Wood', 'Wright', 'Young',
];

// Silly names, each used at most once. Kept clean on purpose.
const FUNNY_BOYS = [
  'Justin Case', 'Chip Munk', 'Chuck Wagon', 'Pete Moss', 'Neil Down', 'Stan Dupp', 'Rusty Gates', 'Hugo First',
  'Barry Cuda', 'Dewey Win', 'Phil Harmonic', 'Walter Melon', 'Chris P. Bacon', 'Ray Sun', 'Sy Lence', 'Gene Pool',
  'Max Power', 'Tim Burr', 'Rocky Road', 'Skip Rope', 'Ned Flanders-Hill', 'Sam Pull', 'Kirk Stride', 'Lance Boyle',
];
const FUNNY_GIRLS = [
  'Paige Turner', 'Penny Lane', 'Hazel Nutt', 'Olive Yew', 'Sue Flay', 'Marsha Mellow', 'Willow Tree', 'Anna Conda-Hill',
  'Rhoda Mile', 'Ima Fast', 'Terry Aki', 'Candy Cane', 'Dot Matrix', 'Daisy Chain', 'Holly Wood', 'Rose Bush',
  'Misty Meadows', 'Summer Rain', 'Hope Springs', 'Joy Ryde', 'Stella Mile', 'Dawn Patrol', 'Iris Pace', 'Faith Trail',
];

module.exports = { STAFF, BOYS_FIRST, GIRLS_FIRST, LAST, FUNNY_BOYS, FUNNY_GIRLS };
