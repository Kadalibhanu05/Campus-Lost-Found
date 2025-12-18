const mongoose = require('mongoose');
const Item = require('./models/item'); // Make sure your item model is exported

// --- Database Connection ---
const dbURI = 'mongodb://127.0.0.1:27017/campus-lost-and-found';

mongoose.connect(dbURI)
    .then(() => console.log('Connected to MongoDB to seed data...'))
    .catch((err) => console.error('Error connecting to MongoDB:', err));

const universities = [
    "Vellore Institute of Technology",
    "SRM University",
    "IIT Madras",
    "Amity University",
    "Manipal University"
];

const sampleItems = [
    // Lost Items
    { name: 'Blue Dell Laptop Charger', category: 'Electronics', status: 'Lost' },
    { name: 'Silver Hydro Flask Water Bottle', category: 'Accessories', status: 'Lost' },
    { name: '"Intro to Algorithms" Textbook', category: 'Books', status: 'Lost' },
    { name: 'Black Leather Wallet', category: 'Personal Items', status: 'Lost' },
    { name: 'Student ID Card - Priya Patel', category: 'ID Cards', status: 'Lost' },
    // Found Items
    { name: 'Apple AirPods Pro Case', category: 'Electronics', status: 'Found' },
    { name: 'Set of Motorcycle Keys', category: 'Keys', status: 'Found' },
    { name: 'Gold-rimmed Eyeglasses', category: 'Accessories', status: 'Found' },
    { name: 'Green Umbrella', category: 'Accessories', status: 'Found' },
    { name: 'Red Spiral Notebook', category: 'Stationery', status: 'Found' },
    { name: 'Found a single earbud near Food Court', category: 'Electronics', status: 'Found' },
];

const seedDB = async () => {
    // Delete all existing items
    await Item.deleteMany({});
    console.log('Cleared existing items.');

    const dummyUserId = new mongoose.Types.ObjectId(); // Create a fake user ID for all items

    for (const uni of universities) {
        // Create 5 lost items
        for (let i = 0; i < 5; i++) {
            const randomItem = sampleItems[i];
            const item = new Item({
                name: randomItem.name,
                description: `${randomItem.status} near the main library at ${uni}.`,
                status: 'Lost',
                category: randomItem.category,
                university: uni,
                imageUrl: `https://placehold.co/600x400/ef4444/ffffff?text=Lost`,
                contact: 'student@example.edu',
                reportedBy: dummyUserId,
            });
            await item.save();
        }

        // Create 6 found items
        for (let i = 5; i < 11; i++) {
            const randomItem = sampleItems[i];
            const item = new Item({
                name: randomItem.name,
                description: `${randomItem.status} in the central auditorium at ${uni}.`,
                status: 'Found',
                category: randomItem.category,
                university: uni,
                imageUrl: `https://placehold.co/600x400/22c55e/ffffff?text=Found`,
                contact: 'security@example.edu',
                reportedBy: dummyUserId,
            });
            await item.save();
        }
    }

    console.log('Database seeded successfully!');
};

seedDB().then(() => {
    mongoose.connection.close();
    console.log('MongoDB connection closed.');
});
