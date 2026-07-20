const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const mongoose = require('mongoose');

const dbUrl = process.env.DATABASE_URL;

if (!dbUrl) {
    console.error('Error: DATABASE_URL is not defined in .env file');
    process.exit(1);
}

console.log('Attempting to connect to MongoDB...');
console.log('Using connection string:', dbUrl);

mongoose.connect(dbUrl)
    .then(() => {
        console.log('MongoDB connection successful!');
        mongoose.connection.close();
        process.exit(0);
    })
    .catch(err => {
        console.error('MongoDB connection error:', err);
        process.exit(1);
    });
