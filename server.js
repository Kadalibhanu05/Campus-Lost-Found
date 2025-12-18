const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const multer = require('multer'); 
const cloudinary = require('cloudinary').v2;
require('dotenv').config();

// --- INITIALIZE APP ---
const app = express();
const PORT = process.env.PORT || 3000;

// --- CONFIGURE CLOUDINARY ---
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// --- CONFIGURE MULTER ---
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// --- DATABASE CONNECTION ---
const dbURI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/campus-lost-found';

mongoose.connect(dbURI)
    .then(() => console.log('Successfully connected to MongoDB!'))
    .catch((err) => console.error('Error connecting to MongoDB:', err));

// --- MONGOOSE MODELS ---
const UserSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true } // Storing Plain Text
});
const User = mongoose.model('User', UserSchema);

const ItemSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    status: { type: String, required: true, enum: ['Lost', 'Found'] },
    category: { type: String, required: true, trim: true },
    university: { type: String, required: true, trim: true },
    imageUrl: { type: String, required: true }, 
    contactEmail: { type: String, required: true },
    contactPhone: { type: String, required: true },
    reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });
const Item = mongoose.model('Item', ItemSchema);

// --- NEW: UNIVERSITY MODEL ---
const UniversitySchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true, trim: true }
});
const University = mongoose.model('University', UniversitySchema);


// --- MIDDLEWARE SETUP ---
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// --- SESSION CONFIGURATION ---
app.use(session({
    secret: process.env.SESSION_SECRET || 'dev_secret_key',
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

// Global Middleware to make 'user' available in all EJS templates
app.use((req, res, next) => {
    res.locals.user = req.session.user;
    next();
});

// Authentication Middleware
const isAuthenticated = (req, res, next) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    next();
};

// ==========================================
//               APP ROUTES
// ==========================================


// 1. Home Route (Fetches Universities from DB)
app.get('/', async (req, res) => {
    try {
        const universities = await University.find().sort({ name: 1 });
        res.render('index', { universities });
    } catch (err) {
        console.error(err);
        res.render('index', { universities: [] });
    }
});

// 2. NEW: Add University Route
app.post('/add-university', isAuthenticated, async (req, res) => {
    try {
        const { newUniversity } = req.body;
        // Check case-insensitive existence
        const exists = await University.findOne({ 
            name: { $regex: new RegExp(`^${newUniversity}$`, 'i') } 
        });
        
        if (!exists && newUniversity) {
            await new University({ name: newUniversity }).save();
        }
        res.redirect('/');
    } catch (error) {
        console.error("Error adding university:", error);
        res.redirect('/');
    }
});

// 3. View Items (Protected: Enforces Login)
app.get('/items', async (req, res) => {
    try {
        // --- AUTH CHECK ---
        if (!req.session.user) {
            return res.redirect('/login?error=must_login');
        }

        const { university, status, search } = req.query;
        if (!university) return res.redirect('/');

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

// 4. View Single Item
app.get('/item/:id', async (req, res) => {
    try {
        const item = await Item.findById(req.params.id);
        if (!item) return res.status(404).send('Item not found');
        res.render('item-detail', { item });
    } catch (error) {
        console.error('Error fetching item:', error);
        res.status(500).send('Error.');
    }
});

// 5. Report Item Routes (GET & POST)
app.route('/report')
    .get(isAuthenticated, async (req, res) => {
        // Fetch universities for the dropdown in report form
        const universities = await University.find().sort({ name: 1 });
        res.render('report', { universities });
    })
    .post(isAuthenticated, upload.single('itemImage'), async (req, res) => {
        try {
            const uploadToCloudinary = () => {
                return new Promise((resolve, reject) => {
                    const stream = cloudinary.uploader.upload_stream(
                        { folder: "campus-lost-found" },
                        (error, result) => {
                            if (error) reject(error);
                            else resolve(result);
                        }
                    );
                    stream.end(req.file.buffer);
                });
            };

            const result = await uploadToCloudinary();
            const imageUrl = result.secure_url;

            const { status, itemName, description, category, university, contactEmail, contactPhone } = req.body;

            await new Item({
                name: itemName,
                description,
                status,
                category,
                university,
                contactEmail,
                contactPhone,
                imageUrl: imageUrl,
                reportedBy: req.session.user.id
            }).save();

            res.redirect(`/items?university=${encodeURIComponent(university)}`);
        } catch (error) {
            console.error('Error submitting report:', error);
            res.status(500).send('Error submitting report.');
        }
    });

// 6. User's Posts
app.get('/my-posts', isAuthenticated, async (req, res) => {
    try {
        const userItems = await Item.find({ reportedBy: req.session.user.id }).sort({ createdAt: -1 });
        res.render('my-posts', { items: userItems });
    } catch (error) {
        console.error('Error fetching your posts:', error);
        res.status(500).send('Error fetching posts.');
    }
});

// --- NEW: EDIT ROUTES ---

// 1. Show Edit Form
app.get('/items/:id/edit', isAuthenticated, async (req, res) => {
    try {
        const item = await Item.findById(req.params.id);
        if (!item) return res.status(404).send('Item not found');

        // Check ownership
        if (item.reportedBy.toString() !== req.session.user.id) {
            return res.status(403).send('Unauthorized');
        }

        const universities = await University.find().sort({ name: 1 });
        res.render('edit-item', { item, universities });
    } catch (error) {
        console.error('Error loading edit form:', error);
        res.status(500).send('Error loading edit form');
    }
});

// 2. Handle Update (POST)
app.post('/items/:id/update', isAuthenticated, upload.single('itemImage'), async (req, res) => {
    try {
        const item = await Item.findById(req.params.id);
        if (!item) return res.status(404).send('Item not found');

        // Check ownership
        if (item.reportedBy.toString() !== req.session.user.id) {
            return res.status(403).send('Unauthorized');
        }

        const { status, itemName, description, category, university, contactEmail, contactPhone } = req.body;

        // Update basic fields
        item.name = itemName;
        item.description = description;
        item.status = status;
        item.category = category;
        item.university = university;
        item.contactEmail = contactEmail;
        item.contactPhone = contactPhone;

        // Handle Image Update (Only if a new file is uploaded)
        if (req.file) {
            const uploadToCloudinary = () => {
                return new Promise((resolve, reject) => {
                    const stream = cloudinary.uploader.upload_stream(
                        { folder: "campus-lost-found" },
                        (error, result) => {
                            if (error) reject(error);
                            else resolve(result);
                        }
                    );
                    stream.end(req.file.buffer);
                });
            };
            const result = await uploadToCloudinary();
            item.imageUrl = result.secure_url; // Update URL
        }

        await item.save();
        res.redirect('/my-posts');

    } catch (error) {
        console.error('Error updating item:', error);
        res.status(500).send('Error updating item');
    }
});

// 7. Delete Item
app.post('/items/:id/delete', isAuthenticated, async (req, res) => {
    try {
        const item = await Item.findById(req.params.id);
        if (!item) return res.status(404).send('Not found.');
        
        if (item.reportedBy.toString() !== req.session.user.id) {
            return res.status(403).send('Unauthorized.');
        }
        
        await Item.findByIdAndDelete(req.params.id);
        res.redirect('/my-posts');
    } catch (error) {
        console.error('Error deleting item:', error);
        res.status(500).send('Error deleting item.');
    }
});

// ==========================================
//            AUTH ROUTES (UPDATED)
// ==========================================

// SIGNUP: Render Form & Handle Logic
// ==========================================
//            AUTH ROUTES (UPDATED)
// ==========================================

// SIGNUP: Render Form & Handle Logic
app.route('/signup')
    .get((req, res) => {
        res.render('signup');
    })
    .post(async (req, res) => {
        try {
            const { name, email, password } = req.body;

            // 1. DEBUGGING: Log what the server received
            console.log("Signup Attempt:", { name, email, password });

            // 2. VALIDATION: Ensure email is not empty/undefined
            if (!email || !name || !password) {
                return res.send("Error: All fields are required.");
            }

            // 3. CHECK DUPLICATE: Strictly check for this specific email
            const existingUser = await User.findOne({ email: email });

            if (existingUser) {
                console.log("Duplicate found for:", email);
                return res.redirect('/login?error=email_exists');
            }

            // 4. CREATE USER
            const newUser = new User({ name, email, password });
            const savedUser = await newUser.save();

            // 5. AUTO LOGIN
            req.session.user = { 
                id: savedUser._id, 
                name: savedUser.name, 
                email: savedUser.email 
            };
            
            console.log("User created successfully:", savedUser.email);
            res.redirect('/'); 

        } catch (error) {
            console.error('Signup error:', error);
            res.status(500).send('Error creating account: ' + error.message);
        }
    });

// LOGIN: Render Form & Handle Logic
app.route('/login')
    .get((req, res) => {
        // Determine Error Message based on query parameter
        let error = null;
        if (req.query.error === 'must_login') {
            error = 'You must be logged in to view university items.';
        } else if (req.query.error === 'email_exists') {
            error = 'An account with this email already exists. Please log in.';
        } else if (req.query.error === 'invalid') {
            error = 'Invalid email or password.';
        }

        res.render('login', { error });
    })
    .post(async (req, res) => {
        try {
            const { email, password } = req.body;
            const user = await User.findOne({ email });

            if (user && user.password === password) {
                req.session.user = { 
                    id: user._id, 
                    name: user.name, 
                    email: user.email 
                };
                res.redirect('/');
            } else {
                // Render the login page again with the error message
                res.render('login', { error: 'Invalid email or password.' });
            }
        } catch (error) {
            console.error('Login error:', error);
            res.status(500).send('Error logging in.');
        }
    });

// LOGOUT
app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) console.error('Logout error:', err);
        res.redirect('/');
    });
});

// --- SERVER LISTENER ---
app.listen(PORT, () => console.log(`Server is running on http://localhost:${PORT}`));