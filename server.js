const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const session = require('express-session');

// --- Mongoose Models ---
// For simplicity, we define schemas here. In a larger app, these would be in /models.
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
    imageUrl: { type: String, required: true },
    contactEmail: { type: String, required: true },
    contactPhone: { type: String, required: true },
    reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });
const Item = mongoose.model('Item', ItemSchema);


// --- Initialize App ---
const app = express();
const PORT = process.env.PORT || 3000;

// --- Database Connection (using local MongoDB) ---
const dbURI = 'mongodb://127.0.0.1:27017/campus-lost-and-found';
mongoose.connect(dbURI, {
useNewUrlParser: true,
useUnifiedTopology: true
})
.then(() => console.log('Connected to MongoDB Atlas!'))
.catch((err) => console.error('Error connecting to MongoDB:', err));

// --- Middleware Setup ---
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// --- Session Configuration ---
app.use(session({
    secret: 'a secret key for lost and found',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 } // 1 day
}));

app.use((req, res, next) => {
    res.locals.user = req.session.user;
    next();
});

// --- Data ---
const universities = ["Vellore Institute of Technology", "SRM University", "IIT Madras", "Amity University", "Manipal University"];

// --- Page & Item Routes ---
app.get('/', (req, res) => res.render('index', { universities }));

app.get('/items', async (req, res) => {
    try {
        const { university, status, search } = req.query;
        if (!university) return res.redirect('/');
        let query = { university };
        if (status) query.status = status;
        if (search) query.name = { $regex: search, $options: 'i' };
        const items = await Item.find(query).sort({ createdAt: -1 });
        res.render('items', { items, university, currentStatus: status, searchTerm: search });
    } catch (error) { res.send('Error fetching items.'); }
});

app.get('/item/:id', async (req, res) => {
    try {
        const item = await Item.findById(req.params.id);
        if (!item) return res.status(404).send('Item not found');
        res.render('item-detail', { item });
    } catch (error) { res.send('Error fetching item details.'); }
});

app.get('/report', (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    res.render('report', { universities });
});

app.post('/report', async (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    try {
        const { status, itemName, description, category, university, contactEmail, contactPhone } = req.body;
        await new Item({
            name: itemName, description, status, category, university, contactEmail, contactPhone,
            imageUrl: `https://placehold.co/600x400/${status === 'Lost' ? 'ef4444' : '22c55e'}/ffffff?text=${status}`,
            reportedBy: req.session.user.id
        }).save();
        res.redirect(`/items?university=${university}`);
    } catch (error) { res.send('Error submitting report.'); }
});

app.get('/my-posts', async (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    try {
        const userItems = await Item.find({ reportedBy: req.session.user.id }).sort({ createdAt: -1 });
        res.render('my-posts', { items: userItems });
    } catch (error) { res.send('Error fetching your posts.'); }
});

app.post('/items/:id/delete', async (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    try {
        const item = await Item.findById(req.params.id);
        if (item.reportedBy.toString() !== req.session.user.id) {
            return res.status(403).send('You can only delete your own posts.');
        }
        await Item.findByIdAndDelete(req.params.id);
        res.redirect('/my-posts');
    } catch (error) { res.send('Error deleting item.'); }
});

// --- User Auth Routes ---
app.get('/signup', (req, res) => res.render('signup'));
app.post('/signup', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        await new User({ name, email, password: hashedPassword }).save();
        res.redirect('/login');
    } catch (error) { res.send('Email already exists.'); }
});
app.get('/login', (req, res) => res.render('login'));
app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (user && await bcrypt.compare(password, user.password)) {
            req.session.user = { id: user._id, name: user.name };
            res.redirect('/');
        } else { res.send('Invalid credentials.'); }
    } catch (error) { res.send('Error logging in.'); }
});
app.get('/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/'));
});

app.listen(PORT, () => console.log(`Server is running on http://localhost:${PORT}`));
