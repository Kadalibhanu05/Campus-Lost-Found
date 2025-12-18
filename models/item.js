// models/item.js (Updated)
const mongoose = require('mongoose');
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
module.exports = mongoose.model('Item', ItemSchema);