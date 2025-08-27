const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const multer = require('multer'); // <-- NEW: for file uploads
const cloudinary = require('cloudinary').v2; // <-- NEW: for image hosting
require('dotenv').config();

// --- INITIALIZE APP ---
const app = express();
const PORT = process.env.PORT || 3000;

// --- CONFIGURE CLOUDINARY --- (NEW SECTION)
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// --- CONFIGURE MULTER --- (NEW SECTION)
// Use memory storage to temporarily hold the file before uploading to Cloudinary
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// --- DATABASE CONNECTION ---
const dbURI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/campus-lost-found';

mongoose.connect(dbURI)
    .then(() => console.log('Successfully connected to MongoDB!'))
    .catch((err) => console.error('Error connecting to MongoDB:', err));

// --- MONGOOSE MODELS  ---
const UserSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true }
});
const User = mongoose.model('User', UserSchema);

const ItemSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    status: { type: String, required: true, enum: ['Lost', 'Found'] },
    category: { type: String, required: true, trim: true },
    university: { type: String, required: true, trim: true },
    imageUrl: { type: String, required: true }, // This will now store a Cloudinary URL
    contactEmail: { type: String, required: true },
    contactPhone: { type: String, required: true },
    reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });
const Item = mongoose.model('Item', ItemSchema);

// --- MIDDLEWARE SETUP  ---
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// --- SESSION CONFIGURATION  ---
app.use(session({
    secret: process.env.SESSION_SECRET || 'a-fallback-secret-for-development',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: dbURI,
        collectionName: 'sessions',
        ttl: 14 * 24 * 60 * 60 // 14 days
    }),
    cookie: {
        maxAge: 1000 * 60 * 60 * 24 // 1 day
    }
}));

app.use((req, res, next) => {
    res.locals.user = req.session.user;
    next();
});

const isAuthenticated = (req, res, next) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    next();
};

// --- DATA  ---
const universities = ["Vellore Institute of Technology", "SRM University", "IIT Madras", "Amity University", "Manipal University"];

// --- PAGE & ITEM ROUTES (Only /report POST is changed) ---
app.get('/', (req, res) => {
    res.render('index', { universities });
});

app.get('/items', async (req, res) => {
    try {
        const { university, status, search } = req.query;
        if (!university) {
            return res.redirect('/');
        }
        let query = { university };
        if (status) query.status = status;
        if (search) query.name = { $regex: search, $options: 'i' };
        
        const items = await Item.find(query).sort({ createdAt: -1 });
        res.render('items', { items, university, currentStatus: status, searchTerm: search });
    } catch (error) {
        console.error('Error fetching items:', error);
        res.status(500).send('Error fetching items.');
    }
});

app.get('/item/:id', async (req, res) => {
    try {
        const item = await Item.findById(req.params.id);
        if (!item) {
            return res.status(404).send('Item not found');
        }
        res.render('item-detail', { item });
    } catch (error) {
        console.error('Error fetching item details:', error);
        res.status(500).send('Error fetching item details.');
    }
});

app.get('/report', isAuthenticated, (req, res) => {
    res.render('report', { universities });
});

// --- UPDATED /report ROUTE TO HANDLE IMAGE UPLOAD ---
// We add the `upload.single('itemImage')` middleware here
app.post('/report', isAuthenticated, upload.single('itemImage'), async (req, res) => {
    try {
        // Wrap the Cloudinary upload in a Promise to use async/await
        const uploadToCloudinary = () => {
            return new Promise((resolve, reject) => {
                const stream = cloudinary.uploader.upload_stream(
                    { folder: "campus-lost-found" }, // Optional: organizes uploads in a folder
                    (error, result) => {
                        if (error) {
                            reject(error);
                        } else {
                            resolve(result);
                        }
                    }
                );
                // Write the file buffer to the stream
                stream.end(req.file.buffer);
            });
        };

        // Upload the image and get the result
        const result = await uploadToCloudinary();
        const imageUrl = result.secure_url; // Get the secure URL from Cloudinary

        // Get the rest of the form data from req.body
        const { status, itemName, description, category, university, contactEmail, contactPhone } = req.body;

        // Create and save the new item with the Cloudinary image URL
        await new Item({
            name: itemName,
            description,
            status,
            category,
            university,
            contactEmail,
            contactPhone,
            imageUrl: imageUrl, // Use the new Cloudinary URL
            reportedBy: req.session.user.id
        }).save();

        res.redirect(`/items?university=${encodeURIComponent(university)}`);
    } catch (error) {
        console.error('Error submitting report:', error);
        res.status(500).send('Error submitting report.');
    }
});

app.get('/my-posts', isAuthenticated, async (req, res) => {
    try {
        const userItems = await Item.find({ reportedBy: req.session.user.id }).sort({ createdAt: -1 });
        res.render('my-posts', { items: userItems });
    } catch (error) {
        console.error('Error fetching your posts:', error);
        res.status(500).send('Error fetching your posts.');
    }
});

app.post('/items/:id/delete', isAuthenticated, async (req, res) => {
    try {
        const item = await Item.findById(req.params.id);
        if (!item) {
            return res.status(404).send('Item not found.');
        }
        if (item.reportedBy.toString() !== req.session.user.id) {
            return res.status(403).send('You are not authorized to delete this post.');
        }
        await Item.findByIdAndDelete(req.params.id);
        res.redirect('/my-posts');
    } catch (error) {
        console.error('Error deleting item:', error);
        res.status(500).send('Error deleting item.');
    }
});

// --- USER AUTH ROUTES  ---
app.get('/signup', (req, res) => res.render('signup'));

app.post('/signup', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).send('An account with this email already exists.');
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        await new User({ name, email, password: hashedPassword }).save();
        res.redirect('/login');
    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).send('Error creating account.');
    }
});

app.get('/login', (req, res) => res.render('login'));

app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (user && await bcrypt.compare(password, user.password)) {
            req.session.user = { id: user._id, name: user.name, email: user.email };
            res.redirect('/');
        } else {
            res.status(401).send('Invalid email or password.');
        }
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).send('Error logging in.');
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Logout error:', err);
            return res.status(500).send('Could not log you out.');
        }
        res.redirect('/');
    });
});

// --- SERVER LISTENER ---
app.listen(PORT, () => console.log(`Server is running on http://localhost:${PORT}`));
