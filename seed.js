const mongoose = require('mongoose');
const Item = require('./models/item'); 

// --- Database Connection ---
const dbURI = 'mongodb://127.0.0.1:27017/campus-lost-and-found';

mongoose.connect(dbURI)
    .then(() => console.log('Connected to MongoDB...'))
    .catch((err) => console.error('Error connecting to MongoDB:', err));

const seedDB = async () => {
    //  It deletes everything
    await Item.deleteMany({});
    console.log(' Database successfully cleared! All items removed.');

};

seedDB().then(() => {
    mongoose.connection.close();
    console.log('MongoDB connection closed.');
});